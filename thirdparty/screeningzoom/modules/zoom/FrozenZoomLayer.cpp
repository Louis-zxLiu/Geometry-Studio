#include "FrozenZoomLayer.h"

#include "ui/overlay_window/OverlayWindow.h"
#include "platform/gdi/ScreenCanvas.h"
#include "core/coords/ZoomTransform.h"

namespace zoomit {

FrozenZoomLayer::FrozenZoomLayer(const Settings& s, OverlayWindow& overlay)
    : s_(s), overlay_(overlay) {}

FrozenZoomLayer::~FrozenZoomLayer() { exit(); }

void FrozenZoomLayer::enter() {
    if (active_) return;
    active_ = true;
    t_.level = ZoomLadder::levelAt(1);
    step_ = 1;
    POINT cur{}; ::GetCursorPos(&cur);
    t_.focus = cur;
    RECT rc = overlay_.windowRect();
    cur.x -= rc.left;
    cur.y -= rc.top;
    updateViewFromCursor(cur);
    overlay_.invalidate();
}

void FrozenZoomLayer::exit() {
    if (!active_) return;
    active_ = false;
    viewX_ = viewY_ = 0;
}

void FrozenZoomLayer::setLevel(float level) {
    t_.level = std::clamp(level, 1.0f, ZoomLadder::kMax);
    step_ = ZoomLadder::stepFor(t_.level);
    POINT cur{}; ::GetCursorPos(&cur);
    RECT rc = overlay_.windowRect();
    cur.x -= rc.left;
    cur.y -= rc.top;
    updateViewFromCursor(cur);
    overlay_.invalidate();
}

void FrozenZoomLayer::stepLevel(int delta) {
    step_ = std::clamp(step_ + delta, 0, ZoomLadder::maxStep());
    if (step_ == 0) { exit(); return; }
    setLevel(ZoomLadder::levelAt(step_));
}

void FrozenZoomLayer::panBy(POINT delta) {
    viewX_ -= static_cast<int>(delta.x / t_.level);
    viewY_ -= static_cast<int>(delta.y / t_.level);
    overlay_.invalidate();
}

void FrozenZoomLayer::onWheel(int deltaTicks) {
    stepLevel(deltaTicks > 0 ? 1 : -1);
}

void FrozenZoomLayer::onMouseMove(POINT clientPt) {
    if (!active_) return;
    RECT rc = overlay_.windowRect();
    int w = rc.right - rc.left;
    int h = rc.bottom - rc.top;
    int srcW = static_cast<int>(w / t_.level);
    int srcH = static_cast<int>(h / t_.level);
    int moveW = srcW / kLiveZoomMoveRegions;
    int moveH = srcH / kLiveZoomMoveRegions;

    int cursorX = static_cast<int>(clientPt.x);
    int cursorY = static_cast<int>(clientPt.y);
    int xOffset = cursorX - viewX_;
    int yOffset = cursorY - viewY_;

    if (xOffset < moveW) {
        viewX_ = std::max(0, cursorX - moveW);
    } else if (xOffset > moveW * (kLiveZoomMoveRegions - 1)) {
        viewX_ = std::min(w - srcW, cursorX + moveW - srcW);
    }

    if (yOffset < moveH) {
        viewY_ = std::max(0, cursorY - moveH);
    } else if (yOffset > moveH * (kLiveZoomMoveRegions - 1)) {
        viewY_ = std::min(h - srcH, cursorY + moveH - srcH);
    }

    overlay_.invalidate();
}

void FrozenZoomLayer::updateViewFromCursor(POINT clientPt) {
    // clientPt is monitor-local (overlay client == monitor). If we received a
    // desktop-space point (e.g. from GetCursorPos), the controller converts it.
    RECT rc = overlay_.windowRect();
    int w = rc.right - rc.left;
    int h = rc.bottom - rc.top;
    getZoomedTopLeft(t_.level, clientPt.x, clientPt.y, w, h, viewX_, viewY_);
}

void FrozenZoomLayer::paint(HDC hdc, int w, int h) {
    if (!active_ || !hdc) return;
    // The controller has already ensured the canvas holds the right content
    // (captured desktop + optional strokes). Stretch it at the current level.
    // viewX_/viewY_ are monitor-local source coords; stretchTo expects desktop
    // coords, so add the monitor origin.
    // The canvas is owned by ModeController; we ask it to blit via the overlay.
    // (Implemented in ModeController::paintOverlay which has the canvas.)
    (void)hdc; (void)w; (void)h;
}

} // namespace zoomit
