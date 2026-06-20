// core/mode_controller/ModeController.h
// Orchestrates static zoom, live zoom, and screenshot-based drawing.
// Frozen zoom owns one captured canvas; draw owns a separate screenshot
// canvas so entering draw never mutates or discards an existing zoom state.
#pragma once

#include "core/settings/Settings.h"
#include "core/events/EventBus.h"
#include "platform/gdi/ScreenCanvas.h"
#include "platform/magnification/MagApi.h"

#include <memory>

namespace zoomit {

class OverlayWindow;
class FrozenZoomLayer;
class LiveZoomLayer;
class DrawLayer;
class IZoomLayer;
class IDrawLayer;

class ModeController {
public:
    ModeController(SettingsService& settings, EventBus& bus);
    ~ModeController();

    bool init(OverlayWindow& overlay);

    void toggleZoom();      // static (frozen) zoom
    void toggleLiveZoom();  // live zoom (magnification control)
    void toggleDraw();      // screenshot + draw

    bool zoomActive() const;
    bool drawActive() const;
    bool liveZoomActive() const;

    void onPointerDown(POINT client);
    void onPointerMove(POINT client);
    void onPointerUp(POINT client);
    void onWheel(int deltaTicks);
    void onKey(UINT msg, WPARAM wp, LPARAM lp);
    void onChar(wchar_t ch) ;

    void tick();  // ~60Hz: drives live-zoom cursor polling.

    // Paint hook called from OverlayWindow::WM_PAINT.
    void paintOverlay(HWND hwnd, HDC hdc, const RECT& rcPaint);

    IZoomLayer* zoomLayer() const;
    IDrawLayer* drawLayer() const;

private:
    void reconfigureOverlay();
    void syncOverlayBounds();
    POINT clientToDesktop(POINT p) const;
    POINT desktopToClient(POINT p) const;

    SettingsService& settings_;
    EventBus& bus_;
    MagApi mag_;
    OverlayWindow* overlay_ = nullptr;

    std::unique_ptr<FrozenZoomLayer> frozen_;
    std::unique_ptr<LiveZoomLayer>  live_;
    IZoomLayer* zoomLayer_ = nullptr;   // frozen_ or live_
    std::unique_ptr<DrawLayer> draw_;

    ScreenCanvas canvas_;
    ScreenCanvas drawCanvas_;
    bool restoreLiveZoomAfterDraw_ = false;
    float restoreLiveZoomLevel_ = 1.0f;
};

} // namespace zoomit
