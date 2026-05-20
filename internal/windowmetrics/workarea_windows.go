//go:build windows

package windowmetrics

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	monitorDefaultToPrimary = 0x00000001
	mdtEffectiveDPI         = 0
)

type rect struct {
	Left   int32
	Top    int32
	Right  int32
	Bottom int32
}

type point struct {
	X int32
	Y int32
}

type monitorInfo struct {
	Size    uint32
	Monitor rect
	Work    rect
	Flags   uint32
}

func workAreaSize() Size {
	user32 := windows.NewLazySystemDLL("user32.dll")
	shcore := windows.NewLazySystemDLL("shcore.dll")

	monitorFromPoint := user32.NewProc("MonitorFromPoint")
	getMonitorInfo := user32.NewProc("GetMonitorInfoW")
	getDpiForMonitor := shcore.NewProc("GetDpiForMonitor")

	monitor, _, _ := monitorFromPoint.Call(
		*(*uintptr)(unsafe.Pointer(&point{})),
		uintptr(monitorDefaultToPrimary),
	)
	if monitor == 0 {
		return Size{}
	}

	info := monitorInfo{
		Size: uint32(unsafe.Sizeof(monitorInfo{})),
	}
	result, _, _ := getMonitorInfo.Call(
		monitor,
		uintptr(unsafe.Pointer(&info)),
	)
	if result == 0 {
		return Size{}
	}

	var dpiX uint32
	var dpiY uint32
	result, _, _ = getDpiForMonitor.Call(
		monitor,
		uintptr(mdtEffectiveDPI),
		uintptr(unsafe.Pointer(&dpiX)),
		uintptr(unsafe.Pointer(&dpiY)),
	)
	if result != 0 || dpiX == 0 || dpiY == 0 {
		dpiX = 96
		dpiY = 96
	}

	width := int(info.Work.Right-info.Work.Left) * 96 / int(dpiX)
	height := int(info.Work.Bottom-info.Work.Top) * 96 / int(dpiY)

	return Size{
		Width:  width,
		Height: height,
	}
}
