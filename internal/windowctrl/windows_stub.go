//go:build !windows

package windowctrl

import (
	"errors"
	"time"
)

type Animation string

const (
	AnimationCrossfade Animation = "crossfade"
	AnimationSlideLeft Animation = "slide-left"
)

func FindWindowByPID(pid int, timeout time.Duration) (uintptr, error) {
	return 0, errors.New("window control is only implemented on Windows")
}

func StripWindowFrame(hwnd uintptr) error {
	return nil
}

func CloseWindow(hwnd uintptr) error {
	return nil
}

func MinimizeWindow(hwnd uintptr) error {
	return nil
}

func PrepareStackedWindow(hwnd uintptr) error {
	return nil
}

func ActivateWindow(hwnd uintptr) error {
	return nil
}

func RaiseWindowWithoutFocus(hwnd uintptr) error {
	return nil
}

func ActivateForegroundWindow(hwnd uintptr) error {
	return nil
}

func StackWindowBelow(hwnd uintptr, anchor uintptr) error {
	return nil
}

func SendWindowToPoolLayer(hwnd uintptr) error {
	return nil
}

func AnimateTransition(from uintptr, to uintptr, animation Animation) error {
	return nil
}

func AnimateExit(from uintptr, animation Animation) error {
	return nil
}
