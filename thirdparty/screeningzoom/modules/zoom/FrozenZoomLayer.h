// modules/zoom/FrozenZoomLayer.h
// Static (frozen) zoom: captures the desktop into a GDI back-buffer and
// StretchBlts it onto the overlay window at the current zoom level, exactly
// like the original Sysinternals ZoomIt WM_PAINT path. The canvas is owned by
// ModeController so the draw layer can paint strokes onto the same buffer.
#pragma once

#include "IZoomLayer.h"
#include "core/settings/Settings.h"

namespace zoomit {

class OverlayWindow;
class ScreenCanvas;

class FrozenZoomLayer : public IZoomLayer {
public:
    FrozenZoomLayer(const Settings& s, OverlayWindow& overlay);
    ~FrozenZoomLayer() override;

    void enter() override;
    void exit() override;
    bool active() const override { return active_; }
    void setLevel(float level) override;
    void stepLevel(int delta) override;
    float level() const override { return t_.level; }
    void panBy(POINT delta) override;
    void setFocus(POINT sourcePt) override { t_.focus = sourcePt; }
    ZoomTransform transform() const override { return t_; }
    ZoomMode mode() const override { return ZoomMode::Frozen; }
    void onWheel(int deltaTicks) override;
    void onMouseMove(POINT clientPt);
    void paint(HDC hdc, int w, int h);

    int viewX() const { return viewX_; }
    int viewY() const { return viewY_; }

private:
    void updateViewFromCursor(POINT clientPt);

    const Settings& s_;
    OverlayWindow& overlay_;
    bool active_ = false;
    ZoomTransform t_{};
    int step_ = 1;
    // Source-space top-left to sample, in monitor-local coords.
    int viewX_ = 0, viewY_ = 0;
};

} // namespace zoomit
