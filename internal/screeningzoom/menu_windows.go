package screeningzoom

import (
	"fmt"
	"os"
	"syscall"
	"time"
	"unsafe"
)

const (
	menuIDLiveZoomOn  = 1
	menuIDLiveZoomOff = 2
	menuIDSeparator   = 0
	menuIDDrawToggle  = 3
)

const (
	MF_STRING    = 0x00000000
	MF_SEPARATOR = 0x00000800
	MF_CHECKED   = 0x00000008
	MF_UNCHECKED = 0x00000000

	TPM_RETURNCMD  = 0x0100
	TPM_NONOTIFY   = 0x0080
	TPM_LEFTALIGN  = 0x0000
	TPM_TOPALIGN   = 0x0000
)

const (
	WM_NULL = 0x0000
)

var (
	procCreatePopupMenu     = libUser32.NewProc("CreatePopupMenu")
	procAppendMenuW         = libUser32.NewProc("AppendMenuW")
	procCheckMenuItem       = libUser32.NewProc("CheckMenuItem")
	procTrackPopupMenu      = libUser32.NewProc("TrackPopupMenu")
	procDestroyMenu         = libUser32.NewProc("DestroyMenu")
	procGetCursorPos        = libUser32.NewProc("GetCursorPos")
	procSetForegroundWindow = libUser32.NewProc("SetForegroundWindow")
)

type POINT struct {
	X int32
	Y int32
}

func showZoomitContextMenu(ownerHwnd uintptr, liveZoomActive, drawActive bool) string {
	menu, _, _ := procCreatePopupMenu.Call()
	if menu == 0 {
		return ""
	}
	defer procDestroyMenu.Call(menu)

	if liveZoomActive {
		appendMenuString(menu, menuIDLiveZoomOff, "退出实时缩放")
	} else {
		appendMenuString(menu, menuIDLiveZoomOn, "进入实时缩放")
	}

	// Separator
	appendMenuSeparator(menu)

	checkFlag := uintptr(MF_UNCHECKED)
	if drawActive {
		checkFlag = MF_CHECKED
		appendMenuStringEx(menu, menuIDDrawToggle, "画笔 (右键退出)", checkFlag)
	} else {
		appendMenuStringEx(menu, menuIDDrawToggle, "画笔", checkFlag)
	}

	// Show at cursor position
	var pt POINT
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))

	// ownerHwnd is a message-only window created by the screening package on
	// the SAME thread that calls us (the menuWnd thread). Because owner and
	// caller share a process and a thread, the foreground lock does not apply
	// and no AttachThreadInput dance is needed. TrackPopupMenu still requires
	// its owner to be the foreground window to display and dismiss correctly,
	// so we do the MSDN-mandated SetForegroundWindow + PostMessage(WM_NULL)
	// pair. A message-only window is invisible and outside the z-order, so the
	// popped-up menu (an independent topmost layer) is never covered by the
	// fullscreen scene window.
	if ownerHwnd != 0 {
		procSetForegroundWindow.Call(ownerHwnd)
	}

	fmt.Fprintf(os.Stderr, "[screening-menu] TrackPopupMenu owner=%#x pt=(%d,%d) live=%v draw=%v\n", ownerHwnd, pt.X, pt.Y, liveZoomActive, drawActive)
	ret, _, _ := procTrackPopupMenu.Call(
		menu,
		TPM_RETURNCMD|TPM_NONOTIFY|TPM_LEFTALIGN|TPM_TOPALIGN,
		uintptr(pt.X),
		uintptr(pt.Y),
		0, ownerHwnd, 0,
	)
	fmt.Fprintf(os.Stderr, "[screening-menu] TrackPopupMenu returned %d\n", ret)

	// MSDN quirk fix: without this, the menu won't dismiss on the next click.
	if ownerHwnd != 0 {
		procPostMessageW.Call(ownerHwnd, WM_NULL, 0, 0)
	}

	// TrackPopupMenu returns as soon as the user picks an item, but the menu's
	// close animation is still playing. If we act on the selection immediately
	// (e.g. entering draw mode) the not-yet-dismissed menu briefly overlaps
	// the new fullscreen overlay and causes a visible glitch. A short sleep
	// lets the close animation finish first. Only needed when an item was
	// actually selected (ret != 0); a dismissed-without-selection menu (ret==0)
	// has already finished animating by the time we get here.
	if ret != 0 {
		time.Sleep(350 * time.Millisecond)
	}

	switch ret {
	case menuIDLiveZoomOn:
		return "livezoom-on"
	case menuIDLiveZoomOff:
		return "livezoom-off"
	case menuIDDrawToggle:
		return "draw-toggle"
	default:
		return ""
	}
}

func appendMenuString(menu uintptr, id uintptr, text string) {
	ptr, _ := syscall.UTF16PtrFromString(text)
	procAppendMenuW.Call(menu, MF_STRING, id, uintptr(unsafe.Pointer(ptr)))
}

func appendMenuStringEx(menu uintptr, id uintptr, text string, flags uintptr) {
	ptr, _ := syscall.UTF16PtrFromString(text)
	procAppendMenuW.Call(menu, MF_STRING|flags, id, uintptr(unsafe.Pointer(ptr)))
}

func appendMenuSeparator(menu uintptr) {
	procAppendMenuW.Call(menu, MF_SEPARATOR, 0, 0)
}
