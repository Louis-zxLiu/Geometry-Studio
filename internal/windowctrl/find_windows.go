//go:build windows

package windowctrl

import (
	"errors"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
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
