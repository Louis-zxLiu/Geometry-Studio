//go:build windows

package windowctrl

import (
	"errors"

	"golang.org/x/sys/windows"
)

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
	procShowWindow.Call(hwnd, uintptr(swMinimize))
	return nil
}

func restoreWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	procShowWindow.Call(hwnd, uintptr(swRestore))
	return nil
}

func maximizeWindow(hwnd uintptr) error {
	if hwnd == 0 {
		return errors.New("invalid window handle")
	}
	procShowWindow.Call(hwnd, uintptr(swMaximize))
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

	if _, _, err = procSetLayeredAttrs.Call(hwnd, 0, uintptr(alpha), uintptr(lwaAlpha)); err != windows.ERROR_SUCCESS {
		return err
	}
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
