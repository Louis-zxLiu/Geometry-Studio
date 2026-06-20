#include "ModeController.h"

#include "ui/overlay_window/OverlayWindow.h"
#include "modules/zoom/FrozenZoomLayer.h"
#include "modules/live_zoom/LiveZoomLayer.h"
#include "modules/draw/DrawLayer.h"
#include "modules/zoom/IZoomLayer.h"
#include "modules/draw/IDrawLayer.h"
#include "core/coords/ZoomTransform.h"
#include <optional>

namespace zoomit {

namespace {
RECT monitorRectFromPoint(POINT pt) {
    HMONITOR mon = ::MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi{};
    mi.cbSize = sizeof(mi);
    ::GetMonitorInfoW(mon, &mi);
    return mi.rcMonitor;
}

class ScopedHiddenCursor {
public:
    ScopedHiddenCursor() {
        CURSORINFO ci{};
        ci.cbSize = sizeof(ci);
        if (!::GetCursorInfo(&ci) || (ci.flags & CURSOR_SHOWING) == 0) {
            return;
        }
        while (::ShowCursor(FALSE) >= 0) {
            ++steps_;
        }
        ++steps_;
    }

    ~ScopedHiddenCursor() {
        while (steps_-- > 0) {
            ::ShowCursor(TRUE);
        }
    }

private:
    int steps_ = 0;
};

class ScopedCaptureCursorSuppression {
public:
    explicit ScopedCaptureCursorSuppression(LiveZoomLayer* live) : live_(live) {
        if (live_ && live_->active()) {
            live_->setCursorVisible(false);
        } else {
            hiddenCursor_.emplace();
        }
    }

    ~ScopedCaptureCursorSuppression() {
        if (live_ && live_->active()) {
            live_->setCursorVisible(true);
        }
    }

private:
    LiveZoomLayer* live_ = nullptr;
    std::optional<ScopedHiddenCursor> hiddenCursor_;
};
}

ModeController::ModeController(SettingsService& settings, EventBus& bus)
    : settings_(settings), bus_(bus) {}

ModeController::~ModeController() = default;

bool ModeController::init(OverlayWindow& overlay) {
    overlay_ = &overlay;
    mag_.init();
    frozen_ = std::make_unique<FrozenZoomLayer>(settings_.current(), overlay);
    live_   = std::make_unique<LiveZoomLayer>(settings_.current(), mag_);
    draw_   = std::make_unique<DrawLayer>(settings_);
    // The live-zoom host is input-transparent (mouse/keys pass through to
    // the desktop, like the original). It therefore cannot route Esc or a
    // right-click menu. Escape + wheel are handled globally via low-level
    // hooks in main.cpp; there is intentionally NO context menu during
    // plain live zoom (faithful to the original).
    return true;
}

// Capture the current monitor into the frozen canvas. With hotkey-only entry
// we no longer need to stall the UI thread waiting for menus to dismiss.
static void captureCurrentMonitor(ScreenCanvas& canvas, LiveZoomLayer* live = nullptr) {
    ScopedCaptureCursorSuppression cursorSuppression(live);
    POINT cur{}; ::GetCursorPos(&cur);
    canvas.capture(cur);
}

IZoomLayer* ModeController::zoomLayer() const { return zoomLayer_; }
IDrawLayer* ModeController::drawLayer() const { return draw_.get(); }
bool ModeController::zoomActive() const  { return zoomLayer_ && zoomLayer_->active(); }
bool ModeController::drawActive() const  { return draw_ && draw_->active(); }
bool ModeController::liveZoomActive() const {
    return zoomLayer_ == live_.get() && live_->active();
}

POINT ModeController::desktopToClient(POINT p) const {
    RECT rc = overlay_ ? overlay_->windowRect() : RECT{};
    p.x -= rc.left;
    p.y -= rc.top;
    return p;
}

POINT ModeController::clientToDesktop(POINT p) const {
    RECT rc = overlay_ ? overlay_->windowRect() : RECT{};
    p.x += rc.left;
    p.y += rc.top;
    return p;
}

void ModeController::syncOverlayBounds() {
    if (!overlay_) return;

    RECT target{};
    if (drawActive() && drawCanvas_.valid()) {
        target.left = drawCanvas_.originX();
        target.top = drawCanvas_.originY();
        target.right = drawCanvas_.originX() + drawCanvas_.width();
        target.bottom = drawCanvas_.originY() + drawCanvas_.height();
    } else if (liveZoomActive()) {
        target = live_->monitorRect();
    } else if (canvas_.valid()) {
        target.left = canvas_.originX();
        target.top = canvas_.originY();
        target.right = canvas_.originX() + canvas_.width();
        target.bottom = canvas_.originY() + canvas_.height();
    } else {
        POINT cur{};
        ::GetCursorPos(&cur);
        target = monitorRectFromPoint(cur);
    }

    overlay_->setBounds(target);
}

// ---- Mode toggles ----
void ModeController::toggleZoom() {
    if (drawActive()) return;
    if (zoomLayer_ == frozen_.get() && frozen_->active()) {
        frozen_->exit();
        zoomLayer_ = nullptr;
        canvas_.discard();
        overlay_->hide();
    } else {
        if (live_->active()) { live_->exit(); zoomLayer_ = nullptr; }
        captureCurrentMonitor(canvas_);
        zoomLayer_ = frozen_.get();
        frozen_->enter();
        reconfigureOverlay();
    }
}

void ModeController::toggleLiveZoom() {
    if (drawActive()) return;
    if (live_->active()) {
        live_->exit();
        zoomLayer_ = nullptr;
        overlay_->hide();
    } else {
        if (frozen_->active()) { frozen_->exit(); canvas_.discard(); }
        live_->enter();
        zoomLayer_ = live_.get();
        overlay_->hide();
    }
}

void ModeController::toggleDraw() {
    if (draw_->active()) {
        draw_->exit();
        drawCanvas_.discard();
        if (restoreLiveZoomAfterDraw_) {
            restoreLiveZoomAfterDraw_ = false;
            live_->enter();
            live_->setLevel(restoreLiveZoomLevel_);
            zoomLayer_ = live_.get();
            overlay_->hide();
        } else if (frozen_->active()) {
            reconfigureOverlay();
        } else {
            overlay_->hide();
        }
    } else {
        captureCurrentMonitor(drawCanvas_, live_.get());
        if (!drawCanvas_.valid()) {
            return;
        }
        restoreLiveZoomAfterDraw_ = false;
        if (live_->active()) {
            restoreLiveZoomAfterDraw_ = true;
            restoreLiveZoomLevel_ = live_->level();
            live_->exit();
            zoomLayer_ = nullptr;
        }
        draw_->enter(drawCanvas_);
        reconfigureOverlay();
    }
}

void ModeController::reconfigureOverlay() {
    syncOverlayBounds();
    if (drawActive()) {
        overlay_->show(false, true, false);
    } else {
        overlay_->show(false, false, false);
    }
    overlay_->invalidate();
}

// ---- Input ----
void ModeController::onPointerDown(POINT client) {
    if (drawActive()) {
        PointerEvent e{client,
                       (GetKeyState(VK_SHIFT) & 0x8000) != 0,
                       (GetKeyState(VK_CONTROL) & 0x8000) != 0,
                       (GetKeyState(VK_TAB) & 0x8000) != 0};
        draw_->onPointerDown(e);
        overlay_->invalidate();
    }
}

void ModeController::onPointerMove(POINT client) {
    if (drawActive()) {
        PointerEvent e{client,
                       (GetKeyState(VK_SHIFT) & 0x8000) != 0,
                       (GetKeyState(VK_CONTROL) & 0x8000) != 0,
                       (GetKeyState(VK_TAB) & 0x8000) != 0};
        draw_->onPointerMove(e);
    } else if (zoomLayer_ == frozen_.get() && frozen_->active()) {
        frozen_->onMouseMove(client);
    }
    overlay_->invalidate();
}

void ModeController::onPointerUp(POINT client) {
    if (drawActive()) {
        PointerEvent e{client,
                       (GetKeyState(VK_SHIFT) & 0x8000) != 0,
                       (GetKeyState(VK_CONTROL) & 0x8000) != 0,
                       (GetKeyState(VK_TAB) & 0x8000) != 0};
        draw_->onPointerUp(e);
        overlay_->invalidate();
    }
}

void ModeController::onWheel(int deltaTicks) {
    if (drawActive()) return;
    if (zoomActive()) {
        zoomLayer_->onWheel(deltaTicks);
        if (!zoomLayer_->active()) {
            zoomLayer_ = nullptr;
            canvas_.discard();
            overlay_->hide();
        }
    }
    overlay_->invalidate();
}

void ModeController::onChar(wchar_t ch) {
    if (drawActive()) draw_->onChar(ch);
}

void ModeController::onKey(UINT msg, WPARAM wp, LPARAM lp) {
    if (msg == WM_CHAR) { onChar(static_cast<wchar_t>(wp)); return; }
    if (msg != WM_KEYDOWN) return;
    if (!drawActive()) {
        if (wp == VK_ESCAPE) {
            if (zoomActive()) {
                if (liveZoomActive()) toggleLiveZoom(); else toggleZoom();
            }
        }
        return;
    }
    // Drawing-mode hotkeys (align with original ZoomIt).
    bool ctrl = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
    switch (wp) {
    case 'R': draw_->setColor(RGB(255,0,0)); break;
    case 'G': draw_->setColor(RGB(0,255,0)); break;
    case 'B': draw_->setColor(RGB(0,0,255)); break;
    case 'Y': draw_->setColor(RGB(255,255,0)); break;
    case 'O': draw_->setColor(RGB(255,128,0)); break;
    case 'P': draw_->setColor(RGB(255,128,255)); break;
    case 'W': draw_->setColor(RGB(255,255,255)); break;
    case 'K': draw_->setColor(RGB(0,0,0)); break;
    case 'T': /* start text mode handled below */ break;
    case VK_ESCAPE:
        if (draw_->typing()) { /* DrawLayer clears typing */ }
        else { toggleDraw(); }
        break;
    }
    if (wp == 'T' && !draw_->typing()) {
        POINT cur{}; ::GetCursorPos(&cur);
        draw_->startText(desktopToClient(cur));
    }
    draw_->onKey(static_cast<UINT>(wp), true);
    (void)ctrl; (void)lp;
    overlay_->invalidate();
}

void ModeController::tick() {
    if (liveZoomActive()) live_->update();
}

// ---- Paint ----
void ModeController::paintOverlay(HWND hwnd, HDC hdc, const RECT& rcPaint) {
    if (!hdc) return;
    (void)hwnd;
    int w = rcPaint.right  - rcPaint.left;
    int h = rcPaint.bottom - rcPaint.top;
    if (w <= 0 || h <= 0) {
        RECT client{};
        ::GetClientRect(hwnd, &client);
        w = client.right - client.left;
        h = client.bottom - client.top;
    }

    if (drawActive() && drawCanvas_.valid()) {
        ::BitBlt(hdc, 0, 0, drawCanvas_.width(), drawCanvas_.height(),
                 drawCanvas_.compatDC(), 0, 0, SRCCOPY);
    } else if (frozen_->active() && canvas_.valid()) {
        // Static zoom: stretch the canvas (desktop + strokes) at the level.
        canvas_.stretchTo(hdc, frozen_->level(),
                          frozen_->viewX(), frozen_->viewY(),
                          w, h, true);
    } else {
        RECT r{0, 0, w, h};
        HBRUSH br = ::CreateSolidBrush(RGB(0, 0, 0));
        ::FillRect(hdc, &r, br);
        ::DeleteObject(br);
    }
}

} // namespace zoomit
