package screening

import (
	"sync/atomic"
	"syscall"
	"unsafe"
)

var (
	userDll                     = syscall.NewLazyDLL("user32.dll")
	kernelDll                   = syscall.NewLazyDLL("kernel32.dll")
	procSetWindowsHookExW       = userDll.NewProc("SetWindowsHookExW")
	procUnhookWindowsHookEx     = userDll.NewProc("UnhookWindowsHookEx")
	procCallNextHookEx          = userDll.NewProc("CallNextHookEx")
	procGetMessageW             = userDll.NewProc("GetMessageW")
	procPostThreadMessageW      = userDll.NewProc("PostThreadMessageW")
	procWindowFromPoint         = userDll.NewProc("WindowFromPoint")
	procGetCurrentThreadId      = kernelDll.NewProc("GetCurrentThreadId")
)

const (
	WH_MOUSE_LL    = 14
	WM_RBUTTONDOWN = 0x0204
	WM_QUIT        = 0x0012
)

type winPOINT struct{ X, Y int32 }
type winMSG struct {
	Hwnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      winPOINT
}
type msllHookStruct struct {
	Pt          winPOINT
	MouseData   uint32
	Flags       uint32
	Time        uint32
	DwExtraInfo uintptr
}

type contextMenuHook struct {
	callback     atomic.Pointer[func()]
	hook         uintptr
	sceneWindows map[uintptr]bool
	hookThreadID uint32
	done         chan struct{}
}

var cmHook = &contextMenuHook{
	sceneWindows: map[uintptr]bool{},
}

func mouseHookProc(nCode int32, wParam uintptr, lParam uintptr) uintptr {
	if nCode >= 0 && wParam == WM_RBUTTONDOWN {
		cb := cmHook.callback.Load()
		if cb != nil {
			info := (*msllHookStruct)(unsafe.Pointer(lParam))
			hwnd, _, _ := procWindowFromPoint.Call(uintptr(unsafe.Pointer(&info.Pt)))
			if hwnd != 0 {
				if cmHook.sceneWindows[hwnd] {
					(*cb)()
				}
			}
		}
	}
	ret, _, _ := procCallNextHookEx.Call(0, uintptr(nCode), wParam, lParam)
	return ret
}

var mouseHookFn = syscall.NewCallback(mouseHookProc)

func (s *Service) installContextMenuHook() {
	if cmHook.hook != 0 {
		return
	}

	cmHook.done = make(chan struct{})
	go func() {
		hook, _, _ := procSetWindowsHookExW.Call(WH_MOUSE_LL, mouseHookFn, 0, 0)
		if hook == 0 {
			return
		}
		cmHook.hook = hook
		tid, _, _ := procGetCurrentThreadId.Call()
		cmHook.hookThreadID = uint32(tid)

		var msg winMSG
		for {
			ret, _, _ := procGetMessageW.Call(
				uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
			if ret == 0 {
				break
			}
		}
	}()

	cb := func() { s.emitContextMenu() }
	cmHook.callback.Store(&cb)
	s.debugf("mouse-hook installed")
}

func (s *Service) uninstallContextMenuHook() {
	if cmHook.hook == 0 {
		return
	}

	cmHook.callback.Store(nil)
	procUnhookWindowsHookEx.Call(cmHook.hook)
	if cmHook.hookThreadID != 0 {
		procPostThreadMessageW.Call(uintptr(cmHook.hookThreadID), WM_QUIT, 0, 0)
	}
	cmHook.hook = 0
	cmHook.hookThreadID = 0
	s.debugf("mouse-hook uninstalled")
}

func addSceneWindow(hwnd uintptr) {
	cmHook.sceneWindows[hwnd] = true
}

func removeSceneWindow(hwnd uintptr) {
	delete(cmHook.sceneWindows, hwnd)
}
