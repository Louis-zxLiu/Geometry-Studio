//go:build windows

package windowctrl

import (
	"errors"

	"golang.org/x/sys/windows"
)

func PrepareStackedWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	if err := StripWindowFrame(hwnd); err != nil {
		return err
	}
	if err := restoreWindow(hwnd); err != nil {
		return err
	}
	bounds, err := monitorBounds(hwnd)
	if err != nil {
		return err
	}
	if err := setWindowBounds(hwnd, bounds, hwndBottom, swPShow|swpNoActivate); err != nil {
		return err
	}
	if err := maximizeWindow(hwnd); err != nil {
		return err
	}
	return showNoActivateWindow(hwnd)
}

func ActivateWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	if err := RaiseWindowWithoutFocus(hwnd); err != nil {
		return err
	}
	return ActivateForegroundWindow(hwnd)
}

func RaiseWindowWithoutFocus(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	if err := restoreWindow(hwnd); err != nil {
		return err
	}
	bounds, err := monitorBounds(hwnd)
	if err != nil {
		return err
	}
	if err := setWindowBounds(hwnd, bounds, hwndTop, swPShow|swpNoActivate); err != nil {
		return err
	}
	if err := maximizeWindow(hwnd); err != nil {
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
	if err := restoreWindow(hwnd); err != nil {
		return err
	}
	if err := maximizeWindow(hwnd); err != nil {
		return err
	}
	if err := showWindow(hwnd); err != nil {
		return err
	}
	return bringWindowToFront(hwnd)
}

func StackWindowBelow(hwnd uintptr, anchor uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	if err := restoreWindow(hwnd); err != nil {
		return err
	}
	if err := maximizeWindow(hwnd); err != nil {
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
	return StackWindowBelow(hwnd, 0)
}
