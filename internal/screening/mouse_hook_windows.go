//go:build windows

package screening

import (
	"runtime"
	"sync/atomic"
	"syscall"
	"unsafe"
)

var (
	userDll                = syscall.NewLazyDLL("user32.dll")
	kernelDll              = syscall.NewLazyDLL("kernel32.dll")
	procSetWindowsHookExW  = userDll.NewProc("SetWindowsHookExW")
	procUnhookWindowsHookEx = userDll.NewProc("UnhookWindowsHookEx")
	procCallNextHookEx     = userDll.NewProc("CallNextHookEx")
	procGetMessageW        = userDll.NewProc("GetMessageW")
	procPostThreadMessageW = userDll.NewProc("PostThreadMessageW")
	procWindowFromPoint    = userDll.NewProc("WindowFromPoint")
	procGetAncestor        = userDll.NewProc("GetAncestor")
	procGetCurrentThreadId = kernelDll.NewProc("GetCurrentThreadId")
	procCreateWindowExW    = userDll.NewProc("CreateWindowExW")
	procDestroyWindow      = userDll.NewProc("DestroyWindow")
	procDefWindowProcW     = userDll.NewProc("DefWindowProcW")
	procTranslateMessage   = userDll.NewProc("TranslateMessage")
	procDispatchMessageW   = userDll.NewProc("DispatchMessageW")
	procRegisterClassExW   = userDll.NewProc("RegisterClassExW")
	procPostMessageW       = userDll.NewProc("PostMessageW")
	procGetModuleHandleW   = kernelDll.NewProc("GetModuleHandleW")
)

const (
	WH_MOUSE_LL          = 14
	WM_RBUTTONDOWN       = 0x0204
	WM_QUIT              = 0x0012
	WM_USER_CONTEXT_MENU = 0x0400 + 100
	GA_ROOT              = 2

	HWND_MESSAGE  = ^uintptr(2) // -3
	WS_OVERLAPPED = 0x00000000
	CW_USEDEFAULT = 0x80000000
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
	svc          atomic.Pointer[Service]
	hook         uintptr
	hookThreadID uint32

	menuWnd      uintptr
	menuThreadID uint32

	sceneWindows map[uintptr]bool
}

var cmHook = &contextMenuHook{
	sceneWindows: map[uintptr]bool{},
}

// pointAsValue packs a POINT into a single uintptr. WindowFromPoint takes
// POINT BY VALUE (8 bytes, one x64 register). Passing &pt would feed the struct
// address as if it were coordinates and always return 0.
func pointAsValue(pt winPOINT) uintptr {
	return *(*uintptr)(unsafe.Pointer(&pt))
}

// rootWindowAtPoint climbs from the deepest child window under the cursor to
// its top-level root, because the screening pool only knows top-level hwnds.
func rootWindowAtPoint(pt winPOINT) uintptr {
	hwnd, _, _ := procWindowFromPoint.Call(pointAsValue(pt))
	if hwnd == 0 {
		return 0
	}
	root, _, _ := procGetAncestor.Call(hwnd, GA_ROOT)
	if root == 0 {
		return hwnd
	}
	return root
}

// ---- mouse hook (detect right-click) ---------------------------------------

func mouseHookProc(nCode int32, wParam uintptr, lParam uintptr) uintptr {
	if nCode >= 0 && wParam == WM_RBUTTONDOWN {
		info := (*msllHookStruct)(unsafe.Pointer(lParam))
		root := rootWindowAtPoint(info.Pt)
		matched := root != 0 && cmHook.sceneWindows[root]
		svc := cmHook.svc.Load()

		// Draw mode: ZoomIt owns the fullscreen mouse capture, our menu can't
		// show. Exit draw mode directly on right-click instead. Swallow this
		// right-click (return 1) so it doesn't fall through to the scene window
		// and immediately re-trigger our own context-menu flow the moment draw
		// mode releases the capture.
		if svc != nil && svc.callbacks.DrawActive != nil && svc.callbacks.DrawActive() {
			if svc.callbacks.ExitDraw != nil {
				svc.callbacks.ExitDraw()
			}
			return 1
		}

		if matched && cmHook.menuWnd != 0 {
			procPostMessageW.Call(cmHook.menuWnd, WM_USER_CONTEXT_MENU, root, 0)
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
	cmHook.svc.Store(s)

	startMenuWindow()

	// WH_MOUSE_LL is owned by the calling thread and dispatched through its
	// message queue, so the goroutine MUST be pinned to one OS thread.
	hookReady := make(chan struct{})
	hookDone := make(chan struct{})
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()

		hook, _, _ := procSetWindowsHookExW.Call(WH_MOUSE_LL, mouseHookFn, 0, 0)
		if hook == 0 {
			close(hookDone)
			return
		}
		cmHook.hook = hook
		tid, _, _ := procGetCurrentThreadId.Call()
		cmHook.hookThreadID = uint32(tid)
		close(hookReady)

		var msg winMSG
		for {
			ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
			if ret == 0 || ret == uintptr(^uint32(0)) {
				break
			}
		}
		_, _, _ = procUnhookWindowsHookEx.Call(cmHook.hook)
		cmHook.hook = 0
		cmHook.hookThreadID = 0
		close(hookDone)
	}()

	select {
	case <-hookReady:
	case <-hookDone:
	}
}

func (s *Service) uninstallContextMenuHook() {
	if cmHook.hook == 0 && cmHook.menuWnd == 0 {
		return
	}
	cmHook.svc.Store(nil)

	if cmHook.hookThreadID != 0 {
		procPostThreadMessageW.Call(uintptr(cmHook.hookThreadID), WM_QUIT, 0, 0)
	}
	if cmHook.menuThreadID != 0 {
		procPostThreadMessageW.Call(uintptr(cmHook.menuThreadID), WM_QUIT, 0, 0)
	}
	cmHook.menuThreadID = 0
	cmHook.menuWnd = 0
}

// ---- menu window (dedicated GUI thread, owns TrackPopupMenu) ---------------

var menuWndClassRegistered bool

func menuWndProc(hwnd uintptr, msg uint32, wParam uintptr, lParam uintptr) uintptr {
	if msg == WM_USER_CONTEXT_MENU {
		svc := cmHook.svc.Load()
		if svc != nil {
			svc.emitContextMenu(wParam, hwnd)
		}
		return 0
	}
	ret, _, _ := procDefWindowProcW.Call(hwnd, uintptr(msg), wParam, lParam)
	return ret
}

var menuWndProcFn = syscall.NewCallback(menuWndProc)

type wndClassExW struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     uintptr
	HIcon         uintptr
	HCursor       uintptr
	HbrBackground uintptr
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       uintptr
}

func startMenuWindow() {
	if cmHook.menuWnd != 0 {
		return
	}
	ready := make(chan struct{})
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()

		hinst, _, _ := procGetModuleHandleW.Call(0)

		if !menuWndClassRegistered {
			className, _ := syscall.UTF16PtrFromString("PlotKityCatMenuHost")
			wc := wndClassExW{
				CbSize:        uint32(unsafe.Sizeof(wndClassExW{})),
				LpfnWndProc:   menuWndProcFn,
				HInstance:     hinst,
				LpszClassName: className,
			}
			procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
			menuWndClassRegistered = true
		}

		className, _ := syscall.UTF16PtrFromString("PlotKityCatMenuHost")
		hwnd, _, _ := procCreateWindowExW.Call(
			0,
			uintptr(unsafe.Pointer(className)),
			0,
			WS_OVERLAPPED,
			CW_USEDEFAULT, CW_USEDEFAULT, CW_USEDEFAULT, CW_USEDEFAULT,
			HWND_MESSAGE, 0, hinst, 0,
		)
		if hwnd == 0 {
			close(ready)
			return
		}
		cmHook.menuWnd = hwnd
		tid, _, _ := procGetCurrentThreadId.Call()
		cmHook.menuThreadID = uint32(tid)
		close(ready)

		var msg winMSG
		// Standard message loop: GetMessage -> TranslateMessage -> DispatchMessage.
		// DispatchMessage is what routes posted messages to menuWndProc; calling
		// DefWindowProc directly here (as an earlier version did) bypasses the
		// window procedure entirely, so WM_USER_CONTEXT_MENU never arrived and
		// the menu never opened.
		for {
			ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
			if ret == 0 || ret == uintptr(^uint32(0)) {
				break
			}
			procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
			procDispatchMessageW.Call(uintptr(unsafe.Pointer(&msg)))
		}
		if cmHook.menuWnd != 0 {
			_, _, _ = procDestroyWindow.Call(cmHook.menuWnd)
			cmHook.menuWnd = 0
		}
	}()
	<-ready
}

func addSceneWindow(hwnd uintptr) {
	cmHook.sceneWindows[hwnd] = true
}

func removeSceneWindow(hwnd uintptr) {
	delete(cmHook.sceneWindows, hwnd)
}
