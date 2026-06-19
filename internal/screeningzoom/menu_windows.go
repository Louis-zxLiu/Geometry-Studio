package screeningzoom

import (
	"syscall"
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

var (
	procCreatePopupMenu  = libUser32.NewProc("CreatePopupMenu")
	procAppendMenuW      = libUser32.NewProc("AppendMenuW")
	procCheckMenuItem    = libUser32.NewProc("CheckMenuItem")
	procTrackPopupMenu   = libUser32.NewProc("TrackPopupMenu")
	procDestroyMenu      = libUser32.NewProc("DestroyMenu")
	procGetCursorPos     = libUser32.NewProc("GetCursorPos")
	procSetForegroundWindow = libUser32.NewProc("SetForegroundWindow")
)

type POINT struct {
	X int32
	Y int32
}

func showZoomitContextMenu(liveZoomActive, drawActive bool) string {
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
	}
	appendMenuStringEx(menu, menuIDDrawToggle, "画笔", checkFlag)

	// Show at cursor position
	var pt POINT
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	procSetForegroundWindow.Call(0) // allow menu to receive dismissal click

	ret, _, _ := procTrackPopupMenu.Call(
		menu,
		TPM_RETURNCMD|TPM_NONOTIFY|TPM_LEFTALIGN|TPM_TOPALIGN,
		uintptr(pt.X),
		uintptr(pt.Y),
		0, 0, 0,
	)

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
