// ui/overlay_window/OverlayWindow.h
// Fullscreen topmost window hosting frozen zoom or screenshot-based draw.
// WM_PAINT delegates the actual blit to ModeController::paintOverlay.
#pragma once

#include "platform/window/Window.h"

namespace zoomit {

class ModeController;

class OverlayWindow : public Window {
public:
    OverlayWindow();
    ~OverlayWindow() override;

    bool create(ModeController& ctrl);

    void invalidate() { if (hwnd_) ::InvalidateRect(hwnd_, nullptr, FALSE); }
    void show(bool takeForeground = true, bool takeFocus = true, bool captureMouse = true);
    void hide();
    bool visible() const { return visible_; }
    void setBounds(const RECT& bounds);
    RECT windowRect() const;

protected:
    LRESULT onMessage(UINT msg, WPARAM wp, LPARAM lp, bool& handled) override;

private:
    ModeController* ctrl_ = nullptr;
    bool visible_ = false;
};

} // namespace zoomit
