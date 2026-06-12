//go:build windows

package windowctrl

import (
	"errors"
	"log"
	"math"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

type Animation string

const (
	AnimationCrossfade Animation = "crossfade"
	AnimationSlideLeft Animation = "slide-left"
)

const (
	swHide         = 0
	swShow         = 5
	swShowNoActive = 8
	swMinimize     = 6
	swpNoSize      = 0x0001
	swpNoMove      = 0x0002
	swpNoZOrder    = 0x0004
	swpNoActivate  = 0x0010
	swpFrame       = 0x0020
	swPShow        = 0x0040
	wmClose        = 0x0010
	wsCaption      = 0x00C00000
	wsThick        = 0x00040000
	wsMinBox       = 0x00020000
	wsMaxBox       = 0x00010000
	wsExLayered    = 0x00080000
	lwaAlpha       = 0x00000002
	monitorDefault = 0x00000002
)

var (
	gwlStyle               = ^uintptr(15)
	gwlExStyle             = ^uintptr(19)
	user32                 = windows.NewLazySystemDLL("user32.dll")
	procEnumWindows        = user32.NewProc("EnumWindows")
	procGetWindowThreadPID = user32.NewProc("GetWindowThreadProcessId")
	procIsWindowVisible    = user32.NewProc("IsWindowVisible")
	procGetWindowLongPtr   = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtr   = user32.NewProc("SetWindowLongPtrW")
	procSetWindowPos       = user32.NewProc("SetWindowPos")
	procShowWindow         = user32.NewProc("ShowWindow")
	procSetForeground      = user32.NewProc("SetForegroundWindow")
	procPostMessage        = user32.NewProc("PostMessageW")
	procSetLayeredAttrs    = user32.NewProc("SetLayeredWindowAttributes")
	procMonitorFromWindow  = user32.NewProc("MonitorFromWindow")
	procGetMonitorInfo     = user32.NewProc("GetMonitorInfoW")
)

var (
	hwndTop     = windows.Handle(0)
	hwndBottom  = windows.Handle(1)
	hwndTopMost = windows.Handle(^uintptr(0))
)

type rect struct {
	Left   int32
	Top    int32
	Right  int32
	Bottom int32
}

type monitorInfo struct {
	CbSize    uint32
	RcMonitor rect
	RcWork    rect
	DwFlags   uint32
}

func FindWindowByPID(pid int, timeout time.Duration) (uintptr, error) {
	deadline := time.Now().Add(timeout)
	for {
		hwnd, err := findWindowByPIDOnce(uint32(pid))
		if err == nil && hwnd != 0 {
			return hwnd, nil
		}
		if time.Now().After(deadline) {
			if err != nil {
				return 0, err
			}
			return 0, errors.New("window not found for process")
		}
		time.Sleep(120 * time.Millisecond)
	}
}

func findWindowByPIDOnce(pid uint32) (uintptr, error) {
	var result uintptr
	cb := syscall.NewCallback(func(hwnd uintptr, _ uintptr) uintptr {
		visible, _, _ := procIsWindowVisible.Call(hwnd)
		if visible == 0 {
			return 1
		}

		var windowPID uint32
		procGetWindowThreadPID.Call(hwnd, uintptr(unsafe.Pointer(&windowPID)))
		if windowPID == pid {
			result = hwnd
			return 0
		}
		return 1
	})

	ret, _, callErr := procEnumWindows.Call(cb, 0)
	if ret == 0 && result == 0 && callErr != windows.ERROR_SUCCESS {
		return 0, callErr
	}
	return result, nil
}

func StripWindowFrame(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}

	style, _, err := procGetWindowLongPtr.Call(hwnd, uintptr(gwlStyle))
	if style == 0 && err != windows.ERROR_SUCCESS {
		return err
	}

	style &^= uintptr(wsCaption | wsThick | wsMinBox | wsMaxBox)
	if _, _, err = procSetWindowLongPtr.Call(hwnd, uintptr(gwlStyle), style); err != windows.ERROR_SUCCESS {
		return err
	}

	_, _, err = procSetWindowPos.Call(
		hwnd,
		uintptr(hwndTop),
		0,
		0,
		0,
		0,
		uintptr(swpNoMove|swpNoSize|swpNoZOrder|swpFrame|swPShow),
	)
	if err != windows.ERROR_SUCCESS {
		return err
	}

	return nil
}

func CloseWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	_, _, err := procPostMessage.Call(hwnd, uintptr(wmClose), 0, 0)
	if err != windows.ERROR_SUCCESS && err != nil {
		return err
	}
	return nil
}

func MinimizeWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	log.Printf("[windowctrl] minimize hwnd=%#x", hwnd)
	procShowWindow.Call(hwnd, uintptr(swMinimize))
	return nil
}

func PrepareStackedWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	log.Printf("[windowctrl] prepare-stacked hwnd=%#x", hwnd)
	if err := StripWindowFrame(hwnd); err != nil {
		return err
	}
	bounds, err := monitorBounds(hwnd)
	if err != nil {
		return err
	}
	if err := setWindowOpacity(hwnd, 255); err != nil {
		return err
	}
	if err := setWindowBounds(hwnd, bounds, hwndBottom, swPShow|swpNoActivate); err != nil {
		return err
	}
	return showNoActivateWindow(hwnd)
}

func ActivateWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	log.Printf("[windowctrl] activate hwnd=%#x", hwnd)
	if err := RaiseWindowWithoutFocus(hwnd); err != nil {
		return err
	}
	return ActivateForegroundWindow(hwnd)
}

func RaiseWindowWithoutFocus(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	log.Printf("[windowctrl] raise-without-focus hwnd=%#x", hwnd)
	bounds, err := monitorBounds(hwnd)
	if err != nil {
		return err
	}
	if err := setWindowOpacity(hwnd, 255); err != nil {
		return err
	}
	if err := setWindowBounds(hwnd, bounds, hwndTop, swPShow|swpNoActivate); err != nil {
		return err
	}
	if err := showNoActivateWindow(hwnd); err != nil {
		return err
	}
	return setWindowPos(hwnd, hwndTop, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
}

func ActivateForegroundWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	log.Printf("[windowctrl] activate-foreground hwnd=%#x", hwnd)
	if err := showWindow(hwnd); err != nil {
		return err
	}
	return bringWindowToFront(hwnd)
}

func StackWindowBelow(hwnd uintptr, anchor uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	log.Printf("[windowctrl] stack-below hwnd=%#x anchor=%#x", hwnd, anchor)
	if err := setWindowOpacity(hwnd, 255); err != nil {
		return err
	}
	if err := showNoActivateWindow(hwnd); err != nil {
		return err
	}
	insertAfter := hwndBottom
	if anchor != 0 {
		insertAfter = windows.Handle(anchor)
	}
	return setWindowPos(hwnd, insertAfter, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
}

func SendWindowToPoolLayer(hwnd uintptr) error {
	log.Printf("[windowctrl] send-to-pool hwnd=%#x", hwnd)
	return StackWindowBelow(hwnd, 0)
}

func AnimateTransition(from uintptr, to uintptr, animation Animation) error {
	if to == 0 {
		return errors.New("invalid target window handle")
	}
	log.Printf("[windowctrl] animate start animation=%s from=%#x to=%#x", animation, from, to)

	switch animation {
	case AnimationSlideLeft:
		err := slideLeftTransition(from, to)
		log.Printf("[windowctrl] animate end animation=%s from=%#x to=%#x err=%v", animation, from, to, err)
		return err
	default:
		err := crossfadeTransition(from, to)
		log.Printf("[windowctrl] animate end animation=%s from=%#x to=%#x err=%v", animation, from, to, err)
		return err
	}
}

func crossfadeTransition(from uintptr, to uintptr) error {
	if from != 0 {
		if err := StackWindowBelow(to, from); err != nil {
			return err
		}
		if err := RaiseWindowWithoutFocus(to); err != nil {
			return err
		}
	} else if err := ActivateWindow(to); err != nil {
		return err
	}

	time.Sleep(120 * time.Millisecond)

	if from != 0 {
		_ = StackWindowBelow(from, to)
	}
	time.Sleep(80 * time.Millisecond)
	return nil
}

func slideLeftTransition(from uintptr, to uintptr) error {
	targetBounds, err := monitorBounds(to)
	if err != nil {
		return err
	}
	width := targetBounds.Right - targetBounds.Left
	if width <= 0 {
		return ActivateWindow(to)
	}

	startBounds := rect{
		Left:   targetBounds.Left + width,
		Top:    targetBounds.Top,
		Right:  targetBounds.Right + width,
		Bottom: targetBounds.Bottom,
	}

	if err := setWindowOpacity(to, 255); err != nil {
		return err
	}
	if err := setWindowBounds(to, startBounds, hwndTop, swPShow); err != nil {
		return err
	}
	if err := showWindow(to); err != nil {
		return err
	}
	if err := bringWindowToFront(to); err != nil {
		return err
	}

	const (
		steps    = 28
		duration = 480 * time.Millisecond
	)
	for step := 0; step <= steps; step++ {
		progress := easeInOut(float64(step) / float64(steps))
		offset := int32(math.Round(float64(width) * (1 - progress)))
		toBounds := rect{
			Left:   targetBounds.Left + offset,
			Top:    targetBounds.Top,
			Right:  targetBounds.Right + offset,
			Bottom: targetBounds.Bottom,
		}
		if err := setWindowBounds(to, toBounds, hwndTop, 0); err != nil {
			return err
		}
		if from != 0 {
			fromOffset := int32(math.Round(float64(width) * progress * 0.18))
			fromBounds := rect{
				Left:   targetBounds.Left - fromOffset,
				Top:    targetBounds.Top,
				Right:  targetBounds.Right - fromOffset,
				Bottom: targetBounds.Bottom,
			}
			if err := setWindowBounds(from, fromBounds, hwndTop, 0); err != nil {
				return err
			}
		}
		time.Sleep(duration / steps)
	}

	if err := setWindowBounds(to, targetBounds, hwndTop, 0); err != nil {
		return err
	}
	if from != 0 {
		_ = setWindowBounds(from, targetBounds, hwndTop, 0)
		_ = StackWindowBelow(from, to)
	}
	time.Sleep(80 * time.Millisecond)
	return nil
}

func easeInOut(progress float64) float64 {
	if progress <= 0 {
		return 0
	}
	if progress >= 1 {
		return 1
	}
	return 0.5 - 0.5*math.Cos(math.Pi*progress)
}

func setWindowOpacity(hwnd uintptr, alpha byte) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}

	exStyle, _, err := procGetWindowLongPtr.Call(hwnd, uintptr(gwlExStyle))
	if exStyle == 0 && err != windows.ERROR_SUCCESS {
		return err
	}
	if exStyle&wsExLayered == 0 {
		if _, _, err = procSetWindowLongPtr.Call(hwnd, uintptr(gwlExStyle), exStyle|wsExLayered); err != windows.ERROR_SUCCESS {
			return err
		}
	}

	if ret, _, err := procSetLayeredAttrs.Call(hwnd, 0, uintptr(alpha), uintptr(lwaAlpha)); ret == 0 {
		if err != windows.ERROR_SUCCESS {
			return err
		}
		return syscall.EINVAL
	}
	return nil
}

func monitorBounds(hwnd uintptr) (rect, error) {
	monitor, _, err := procMonitorFromWindow.Call(hwnd, uintptr(monitorDefault))
	if monitor == 0 {
		if err != windows.ERROR_SUCCESS {
			return rect{}, err
		}
		return rect{}, errors.New("monitor not found for window")
	}

	info := monitorInfo{CbSize: uint32(unsafe.Sizeof(monitorInfo{}))}
	ret, _, err := procGetMonitorInfo.Call(monitor, uintptr(unsafe.Pointer(&info)))
	if ret == 0 {
		if err != windows.ERROR_SUCCESS {
			return rect{}, err
		}
		return rect{}, errors.New("failed to query monitor info")
	}
	return info.RcMonitor, nil
}

func setWindowBounds(hwnd uintptr, bounds rect, after windows.Handle, flags uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	width := bounds.Right - bounds.Left
	height := bounds.Bottom - bounds.Top
	return setWindowPos(hwnd, after, bounds.Left, bounds.Top, width, height, flags)
}

func setWindowPos(hwnd uintptr, after windows.Handle, x int32, y int32, width int32, height int32, flags uintptr) error {
	ret, _, err := procSetWindowPos.Call(
		hwnd,
		uintptr(after),
		uintptr(x),
		uintptr(y),
		uintptr(width),
		uintptr(height),
		flags,
	)
	if ret == 0 {
		if err != windows.ERROR_SUCCESS {
			return err
		}
		return syscall.EINVAL
	}
	return nil
}

func showWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	procShowWindow.Call(hwnd, uintptr(swShow))
	return nil
}

func showNoActivateWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	procShowWindow.Call(hwnd, uintptr(swShowNoActive))
	return nil
}

func bringWindowToFront(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	procSetWindowPos.Call(hwnd, uintptr(hwndTopMost), 0, 0, 0, 0, uintptr(swpNoMove|swpNoSize))
	procSetWindowPos.Call(hwnd, uintptr(hwndTop), 0, 0, 0, 0, uintptr(swpNoMove|swpNoSize))
	procSetForeground.Call(hwnd)
	return nil
}
