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

func MaximizeWindow(hwnd uintptr) error {
	return nil
}

func HideWindow(hwnd uintptr) error {
	return nil
}

func ShowWindow(hwnd uintptr) error {
	return nil
}

func BringWindowToFront(hwnd uintptr) error {
	return nil
}

func CloseWindow(hwnd uintptr) error {
	return nil
}

func PreparePresentationWindow(hwnd uintptr) error {
	return nil
}

func AnimateTransition(from uintptr, to uintptr, animation Animation) error {
	return nil
}
