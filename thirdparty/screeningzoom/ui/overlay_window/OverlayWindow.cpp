#include "OverlayWindow.h"

#include <windowsx.h>
#include "core/mode_controller/ModeController.h"

namespace zoomit {

OverlayWindow::OverlayWindow() = default;
OverlayWindow::~OverlayWindow() = default;

bool OverlayWindow::create(ModeController& ctrl) {
    ctrl_ = &ctrl;
    CreateParams p;
    p.className = L"ZoomItOverlay";
    p.title     = L"ZoomIt";
    p.style     = WS_POPUP;
    p.exStyle   = WS_EX_TOPMOST | WS_EX_TOOLWINDOW;
    p.x = 0; p.y = 0;
    p.w = ::GetSystemMetrics(SM_CXSCREEN);
    p.h = ::GetSystemMetrics(SM_CYSCREEN);
    p.brush = RGB(0, 0, 0);
    return Window::create(p);
}

void OverlayWindow::show(bool takeForeground, bool takeFocus, bool captureMouse) {
    if (!hwnd_) return;
    visible_ = true;
    ::ShowWindow(hwnd_, (takeForeground || takeFocus) ? SW_SHOWNORMAL : SW_SHOWNOACTIVATE);
    if (takeForeground) {
        ::SetForegroundWindow(hwnd_);
    }
    if (takeFocus) {
        ::SetFocus(hwnd_);
    }
    if (captureMouse) {
        ::SetCapture(hwnd_);
    } else if (::GetCapture() == hwnd_) {
        ::ReleaseCapture();
    }
}
void OverlayWindow::hide() {
    if (!hwnd_) return;
    visible_ = false;
    ::ReleaseCapture();
    ::ShowWindow(hwnd_, SW_HIDE);
}

void OverlayWindow::setBounds(const RECT& bounds) {
    if (!hwnd_) return;
    ::SetWindowPos(hwnd_, HWND_TOPMOST,
                   bounds.left, bounds.top,
                   bounds.right - bounds.left,
                   bounds.bottom - bounds.top,
                   SWP_NOACTIVATE | SWP_FRAMECHANGED);
}

RECT OverlayWindow::windowRect() const {
    RECT rc{};
    if (hwnd_) ::GetWindowRect(hwnd_, &rc);
    return rc;
}

LRESULT OverlayWindow::onMessage(UINT msg, WPARAM wp, LPARAM lp, bool& handled) {
    switch (msg) {
    case WM_PAINT: {
        PAINTSTRUCT ps{};
        HDC hdc = ::BeginPaint(hwnd_, &ps);
        if (ctrl_) ctrl_->paintOverlay(hwnd_, hdc, ps.rcPaint);
        ::EndPaint(hwnd_, &ps);
        handled = true; return 0;
    }
    case WM_ERASEBKGND:
        handled = true; return 1;
    case WM_SETCURSOR:
        ::SetCursor(::LoadCursorW(nullptr, IDC_ARROW));
        handled = true; return TRUE;
    case WM_NCHITTEST:
        handled = true; return HTCLIENT;
    case WM_LBUTTONDOWN:
        if (ctrl_) ctrl_->onPointerDown({GET_X_LPARAM(lp), GET_Y_LPARAM(lp)});
        handled = true; return 0;
    case WM_MOUSEMOVE:
        if (ctrl_) ctrl_->onPointerMove({GET_X_LPARAM(lp), GET_Y_LPARAM(lp)});
        handled = true; return 0;
    case WM_LBUTTONUP:
        if (ctrl_) ctrl_->onPointerUp({GET_X_LPARAM(lp), GET_Y_LPARAM(lp)});
        handled = true; return 0;
    case WM_RBUTTONUP:
        handled = true; return 0;
    case WM_MOUSEWHEEL:
        if (ctrl_) ctrl_->onWheel(GET_WHEEL_DELTA_WPARAM(wp) / WHEEL_DELTA);
        handled = true; return 0;
    case WM_KEYDOWN:
    case WM_KEYUP:
    case WM_CHAR:
        if (ctrl_) ctrl_->onKey(msg, wp, lp);
        handled = true; return 0;
    case WM_DPICHANGED: {
        RECT* r = reinterpret_cast<RECT*>(lp);
        ::SetWindowPos(hwnd_, nullptr, r->left, r->top,
                       r->right - r->left, r->bottom - r->top,
                       SWP_NOZORDER | SWP_NOACTIVATE);
        handled = true; return 0;
    }
    }
    handled = false;
    return 0;
}

} // namespace zoomit
