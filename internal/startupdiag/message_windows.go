//go:build windows

package startupdiag

import (
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	mbIconError = 0x00000010
	mbOK        = 0x00000000
)

func ShowStartupError(title string, message string) {
	user32 := windows.NewLazySystemDLL("user32.dll")
	messageBoxW := user32.NewProc("MessageBoxW")
	if err := user32.Load(); err != nil {
		return
	}

	titlePtr, _ := syscall.UTF16PtrFromString(title)
	messagePtr, _ := syscall.UTF16PtrFromString(message)
	_, _, _ = messageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(messagePtr)),
		uintptr(unsafe.Pointer(titlePtr)),
		uintptr(mbOK|mbIconError),
	)
}

func StartupErrorMessage(err error) string {
	message := "PlotKityCat failed to start."
	if err != nil {
		message = fmt.Sprintf("%s\n\nError: %v", message, err)
	}
	return message
}
