//go:build windows

package windowctrl

import "golang.org/x/sys/windows"

type Animation string

const (
	AnimationCrossfade Animation = "crossfade"
	AnimationSlideLeft Animation = "slide-left"
)

const (
	swHide         = 0
	swMaximize     = 3
	swShow         = 5
	swShowNoActive = 8
	swMinimize     = 6
	swRestore      = 9
	swpNoSize      = 0x0001
	swpNoMove      = 0x0002
	swpNoZOrder    = 0x0004
	swpNoActivate  = 0x0010
	swpFrame       = 0x0020
	swPShow        = 0x0040
	wmClose        = 0x0010
	lwaAlpha       = 0x00000002
	wsCaption      = 0x00C00000
	wsThick        = 0x00040000
	wsMinBox       = 0x00020000
	wsMaxBox       = 0x00010000
	wsExLayered    = 0x00080000
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
	procSetLayeredAttrs    = user32.NewProc("SetLayeredWindowAttributes")
	procSetWindowPos       = user32.NewProc("SetWindowPos")
	procShowWindow         = user32.NewProc("ShowWindow")
	procSetForeground      = user32.NewProc("SetForegroundWindow")
	procPostMessage        = user32.NewProc("PostMessageW")
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
