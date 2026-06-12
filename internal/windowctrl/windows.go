//go:build windows

package windowctrl

import (
	"errors"
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
	swHide      = 0
	swShow      = 5
	swMaximize  = 3
	swRestore   = 9
	swpNoSize   = 0x0001
	swpNoMove   = 0x0002
	swpNoZOrder = 0x0004
	swpFrame    = 0x0020
	swPShow     = 0x0040
	wmClose     = 0x0010
	wsCaption   = 0x00C00000
	wsThick     = 0x00040000
	wsMinBox    = 0x00020000
	wsMaxBox    = 0x00010000
)

var (
	gwlStyle               = ^uintptr(15)
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
)

var (
	hwndTop     = windows.Handle(0)
	hwndTopMost = windows.Handle(^uintptr(0))
)

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

func MaximizeWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	procShowWindow.Call(hwnd, uintptr(swRestore))
	procShowWindow.Call(hwnd, uintptr(swMaximize))
	return nil
}

func HideWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	procShowWindow.Call(hwnd, uintptr(swHide))
	return nil
}

func ShowWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	procShowWindow.Call(hwnd, uintptr(swShow))
	return nil
}

func BringWindowToFront(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	procSetWindowPos.Call(hwnd, uintptr(hwndTopMost), 0, 0, 0, 0, uintptr(swpNoMove|swpNoSize))
	procSetWindowPos.Call(hwnd, uintptr(hwndTop), 0, 0, 0, 0, uintptr(swpNoMove|swpNoSize))
	procSetForeground.Call(hwnd)
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

func PreparePresentationWindow(hwnd uintptr) error {
	if err := StripWindowFrame(hwnd); err != nil {
		return err
	}
	if err := MaximizeWindow(hwnd); err != nil {
		return err
	}
	if err := BringWindowToFront(hwnd); err != nil {
		return err
	}
	return nil
}

func AnimateTransition(from uintptr, to uintptr, animation Animation) error {
	if to != 0 {
		if err := ShowWindow(to); err != nil {
			return err
		}
		if err := BringWindowToFront(to); err != nil {
			return err
		}
		if err := MaximizeWindow(to); err != nil {
			return err
		}
	}

	delay := 80 * time.Millisecond
	if animation == AnimationSlideLeft {
		delay = 120 * time.Millisecond
	}
	time.Sleep(delay)

	if from != 0 {
		_ = HideWindow(from)
	}

	return nil
}
