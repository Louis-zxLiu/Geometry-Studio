#include "LiveZoomLayer.h"

#include "core/coords/ZoomTransform.h"
#include <windowsx.h>
#include <algorithm>

namespace zoomit {

#ifndef MS_SHOWMAGNIFIEDCURSOR
#define MS_SHOWMAGNIFIEDCURSOR 0x0001L
#endif

// ---- LiveZoomHost ----
LRESULT LiveZoomHost::onMessage(UINT msg, WPARAM wp, LPARAM lp, bool& handled) {
    switch (msg) {
    case WM_ERASEBKGND:
        handled = true; return 1;
    // The host is WS_EX_TRANSPARENT (input passes through to the desktop,
    // matching the original Sysinternals ZoomIt live-zoom host which is
    // WS_EX_LAYERED|WS_EX_TRANSPARENT + EnableWindow(FALSE)). It therefore
    // does NOT receive mouse button or key messages. Wheel and Escape are
    // handled globally (low-level hooks) by the controller. Nothing to do
    // here.
    }
    handled = false;
    return 0;
}

// ---- LiveZoomLayer ----
LiveZoomLayer::LiveZoomLayer(const Settings& s, MagApi& mag)
    : s_(s), mag_(mag) {}

LiveZoomLayer::~LiveZoomLayer() { exit(); }

void LiveZoomLayer::enter() {
    if (active_) return;
    if (!mag_.initialized() && !mag_.init()) return;

    POINT cur{}; ::GetCursorPos(&cur);
    HMONITOR hmon = ::MonitorFromPoint(cur, MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi{};
    mi.cbSize = sizeof(mi);
    ::GetMonitorInfoW(hmon, &mi);
    mon_ = mi.rcMonitor;
    int w = mon_.right - mon_.left;
    int h = mon_.bottom - mon_.top;

    level_ = ZoomLadder::levelAt(1);
    step_  = 1;

    // Initial source rect: centre on the cursor using the same mapping as
    // static zoom (cursor's relative position in the monitor = relative
    // position in the source rect), with edge dead-zone.
    int cx = cur.x - mon_.left;
    int cy = cur.y - mon_.top;
    int vx = 0, vy = 0;
    getZoomedTopLeft(level_, cx, cy, w, h, vx, vy);
    src_.left   = mon_.left + vx;
    src_.top    = mon_.top  + vy;
    src_.right  = src_.left + static_cast<int>(w / level_);
    src_.bottom = src_.top  + static_cast<int>(h / level_);
    clampSource();
    lastCursor_ = cur;

    // Host: topmost, tool-window, INPUT-TRANSPARENT. The original's live
    // zoom host is WS_EX_LAYERED|WS_EX_TRANSPARENT + EnableWindow(FALSE):
    // mouse/keyboard pass straight through to the desktop so the user can
    // interact with (click) the live desktop beneath, exactly like the
    // original. We do NOT grab focus or capture. The magnifier child still
    // paints the magnified content; the magnified cursor (MS_SHOWMAGNIFIED
    // CURSOR) is the only visible cursor (system cursor hidden below).
    host_ = std::make_unique<LiveZoomHost>();
    host_->bind(this);
    Window::CreateParams p;
    p.className = L"ZoomItLiveZoomHost";
    p.title     = L"ZoomIt Live Zoom";
    p.style     = WS_POPUP;
    p.exStyle   = WS_EX_TOOLWINDOW | WS_EX_TOPMOST | WS_EX_LAYERED | WS_EX_TRANSPARENT;
    p.x = mon_.left; p.y = mon_.top; p.w = w; p.h = h;
    p.brush = RGB(0, 0, 0);
    host_->create(p);
    HWND hostHwnd = host_->hwnd();
    // Disable so neither the host nor its magnifier child grab input — clicks
    // fall through to the desktop beneath. Mirrors EnableWindow(g_hWndLiveZoom, FALSE).
    ::EnableWindow(hostHwnd, FALSE);

    // Magnifier child fills the host.
    magWnd_ = ::CreateWindowExW(0, L"Magnifier", L"MagnifierWindow",
        WS_CHILD | MS_SHOWMAGNIFIEDCURSOR | WS_VISIBLE,
        0, 0, w, h, hostHwnd, nullptr, ::GetModuleHandleW(nullptr), nullptr);

    mag_.setLensUseBitmapSmoothing(magWnd_, true);

    ::ShowWindow(hostHwnd, SW_SHOWNA);

    active_ = true;
    applyTransform();
    // Hide the real system cursor; the magnifier draws a magnified one so we
    // only see a single cursor.
    mag_.showSystemCursor(false);
}

void LiveZoomLayer::exit() {
    if (!active_) return;
    active_ = false;
    mag_.showSystemCursor(true);
    if (magWnd_) { ::DestroyWindow(magWnd_); magWnd_ = nullptr; }
    if (host_)   { host_->destroy(); host_.reset(); }
    level_ = 1.0f; step_ = 1;
    src_ = {};
}

void LiveZoomLayer::setCursorVisible(bool visible) {
    if (!magWnd_) return;
    mag_.showSystemCursor(false);
    LONG style = ::GetWindowLongW(magWnd_, GWL_STYLE);
    if (visible) style |= MS_SHOWMAGNIFIEDCURSOR;
    else style &= ~MS_SHOWMAGNIFIEDCURSOR;
    ::SetWindowLongW(magWnd_, GWL_STYLE, style);
    ::InvalidateRect(magWnd_, nullptr, TRUE);
    ::UpdateWindow(magWnd_);
}

void LiveZoomLayer::setLevel(float level) {
    level_ = std::clamp(level, 1.0f, ZoomLadder::kMax);
    step_ = ZoomLadder::stepFor(level_);
    // Keep the current centre, rebuild source rect sized for the new level.
    POINT c{ (src_.left + src_.right) / 2, (src_.top + src_.bottom) / 2 };
    int w = mon_.right - mon_.left, h = mon_.bottom - mon_.top;
    int zw = static_cast<int>(w / level_);
    int zh = static_cast<int>(h / level_);
    src_.left = c.x - zw / 2; src_.top = c.y - zh / 2;
    src_.right = src_.left + zw; src_.bottom = src_.top + zh;
    clampSource();
    applyTransform();
}

void LiveZoomLayer::stepLevel(int delta) {
    int ns = std::clamp(step_ + delta, 0, ZoomLadder::maxStep());
    if (ns == 0) { exit(); return; }
    step_ = ns;
    setLevel(ZoomLadder::levelAt(ns));
}

void LiveZoomLayer::onWheel(int deltaTicks) {
    stepLevel(deltaTicks > 0 ? 1 : -1);
}

void LiveZoomLayer::clampSource() {
    int zw = src_.right - src_.left;
    int zh = src_.bottom - src_.top;
    if (src_.left < mon_.left) { src_.left = mon_.left; src_.right = src_.left + zw; }
    if (src_.top  < mon_.top)  { src_.top  = mon_.top;  src_.bottom = src_.top + zh; }
    if (src_.right  > mon_.right)  { src_.right  = mon_.right;  src_.left = src_.right - zw; }
    if (src_.bottom > mon_.bottom) { src_.bottom = mon_.bottom; src_.top  = src_.bottom - zh; }
}

void LiveZoomLayer::applyTransform() {
    // Mirror the original Sysinternals ZoomIt path EXACTLY: drive the
    // magnifier control with MagSetWindowTransform only (the offset in the
    // matrix selects which slice of the screen is shown), then force a
    // redraw so the contents stay live. The original NEVER calls
    // MagSetWindowSource for live zoom — calling it as well makes the
    // control render the (small) source rect 1:1, leaving black bars on the
    // right/bottom and freezing the view (no InvalidateRect => stale frame,
    // which is also why dismissed menus left a ghost).
    if (!magWnd_) return;
    MagTransform m{};
    m.v[0][0] = level_;
    m.v[0][2] = -static_cast<float>(src_.left) * level_;
    m.v[1][1] = level_;
    m.v[1][2] = -static_cast<float>(src_.top)  * level_;
    m.v[2][2] = 1.0f;
    mag_.setWindowTransform(magWnd_, m);
    ::InvalidateRect(magWnd_, nullptr, TRUE);
}

void LiveZoomLayer::update() {
    if (!active_ || !magWnd_) return;

    if (host_) {
        ::SetWindowPos(host_->hwnd(), HWND_TOPMOST, 0, 0, 0, 0,
                       SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE);
    }

    POINT cur{}; ::GetCursorPos(&cur);
    lastCursor_ = cur;

    int w = mon_.right - mon_.left;
    int h = mon_.bottom - mon_.top;
    int srcW = src_.right - src_.left;
    int srcH = src_.bottom - src_.top;
    int moveW = srcW / kLiveZoomMoveRegions;
    int moveH = srcH / kLiveZoomMoveRegions;

    // Mirror the original WM_TIMER path: compute the source-space point that
    // should sit at the centre (zoomCenterPos), then derive the source rect.
    // In the edge bands the centre shifts toward the cursor; otherwise it
    // stays where it was.
    POINT center{ (src_.left + src_.right) / 2, (src_.top + src_.bottom) / 2 };
    int xOffset = cur.x - src_.left;
    int yOffset = cur.y - src_.top;
    if (xOffset < moveW)
        center.x = src_.left + srcW / 2 - (moveW - xOffset);
    else if (xOffset > moveW * (kLiveZoomMoveRegions - 1))
        center.x = src_.left + srcW / 2 + (xOffset - moveW * (kLiveZoomMoveRegions - 1));
    if (yOffset < moveH)
        center.y = src_.top + srcH / 2 - (moveH - yOffset);
    else if (yOffset > moveH * (kLiveZoomMoveRegions - 1))
        center.y = src_.top + srcH / 2 + (yOffset - moveH * (kLiveZoomMoveRegions - 1));

    int zw = static_cast<int>(w / level_);
    int zh = static_cast<int>(h / level_);
    RECT ns{};
    ns.left   = center.x - zw / 2;
    ns.top    = center.y - zh / 2;
    ns.right  = ns.left + zw;
    ns.bottom = ns.top  + zh;

    // Don't scroll outside monitor area.
    if (ns.left < mon_.left)              ns.left  = mon_.left;
    else if (ns.left > mon_.right - zw)   ns.left  = mon_.right - zw;
    ns.right = ns.left + zw;
    if (ns.top  < mon_.top)               ns.top   = mon_.top;
    else if (ns.top  > mon_.bottom - zh)  ns.top   = mon_.bottom - zh;
    ns.bottom = ns.top + zh;

    // Always (re)apply the transform + invalidate this tick, matching the
    // original which calls MagSetWindowTransform + InvalidateRect every
    // WM_TIMER. Skipping the refresh when the source didn't move is what
    // made the magnified image freeze (looked like a static screenshot) and
    // left dismissed-menu pixels on screen.
    src_ = ns;
    applyTransform();
}

} // namespace zoomit
