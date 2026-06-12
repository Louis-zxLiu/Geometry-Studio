//go:build windows

package windowctrl

import (
	"errors"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

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
