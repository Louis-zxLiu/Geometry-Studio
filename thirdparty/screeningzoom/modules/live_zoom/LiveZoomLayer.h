// modules/live_zoom/LiveZoomLayer.h
// Live zoom via the Magnification control in an input-transparent topmost
// host window. The overlay stays hidden while this mode is active.
#pragma once

#include "../zoom/IZoomLayer.h"
#include "platform/magnification/MagApi.h"
#include "platform/window/Window.h"
#include "core/settings/Settings.h"

#include <memory>
#include <functional>

namespace zoomit {

class LiveZoomLayer;

// Host window: opaque fullscreen container that owns the magnifier child and
// routes input. Forwards interesting messages to its LiveZoomLayer.
class LiveZoomHost : public Window {
public:
    LiveZoomHost() = default;
    void bind(LiveZoomLayer* layer) { layer_ = layer; }
protected:
    LRESULT onMessage(UINT msg, WPARAM wp, LPARAM lp, bool& handled) override;
private:
    LiveZoomLayer* layer_ = nullptr;
};

class LiveZoomLayer : public IZoomLayer {
public:
    LiveZoomLayer(const Settings& s, MagApi& mag);
    ~LiveZoomLayer() override;

    void enter() override;
    void exit() override;
    bool active() const override { return active_; }
    void setLevel(float level) override;
    void stepLevel(int delta) override;
    float level() const override { return level_; }
    void panBy(POINT) override {}
    void setFocus(POINT) override {}
    ZoomTransform transform() const override { return {}; }
    ZoomMode mode() const override { return ZoomMode::Live; }
    void onWheel(int deltaTicks) override;
    void update();  // ~60Hz cursor polling

    RECT sourceRect() const { return src_; }
    RECT monitorRect() const { return mon_; }
    HWND hostHwnd() const { return host_ ? host_->hwnd() : nullptr; }
    void setCursorVisible(bool visible);

private:
    void applyTransform();
    void clampSource();

    const Settings& s_;
    MagApi& mag_;

    std::unique_ptr<LiveZoomHost> host_;
    HWND magWnd_ = nullptr;

    bool  active_ = false;
    float level_ = 1.0f;
    int   step_  = 1;
    RECT  mon_{};
    RECT  src_{};
    POINT lastCursor_{};
};

} // namespace zoomit
