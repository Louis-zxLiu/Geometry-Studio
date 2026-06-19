// modules/draw/DrawLayer.h
// Draws directly onto the ScreenCanvas back-buffer (hdcScreenCompat), exactly
// like the original Sysinternals ZoomIt: freehand/line/rect/ellipse/arrow use
// GDI+ on the canvas, shapes rubber-band with R2_NOT, text uses DrawText.
// No shape list, no undo, no snapshots — strokes are permanent pixels on the
// canvas and exit() just drops the canvas.
#pragma once

#include "IDrawLayer.h"
#include "core/settings/Settings.h"

namespace zoomit {

class ScreenCanvas;

class DrawLayer : public IDrawLayer {
public:
    DrawLayer(SettingsService& settings);
    ~DrawLayer() override;

    void enter(ScreenCanvas& canvas) override;
    void exit() override;
    bool active() const override { return active_; }

    void onPointerDown(const PointerEvent& e) override;
    void onPointerMove(const PointerEvent& e) override;
    void onPointerUp(const PointerEvent& e) override;

    void onChar(wchar_t ch) override;
    void onKey(UINT vk, bool down) override;

    void setTool(DrawTool t) override { tool_ = t; }
    void setColor(COLORREF c) override { color_ = c; }
    void setWidth(int w) override { width_ = w; }
    DrawTool tool() const override { return tool_; }
    bool drawing() const override { return drawing_; }
    bool typing() const override { return typing_; }

    void startText(POINT client);

private:
    void drawFreehandSegment(POINT a, POINT b);
    void rubberShape(POINT cur, bool erase);
    void drawShape(POINT a, POINT b);
    void commitTextChar(wchar_t ch);
    void invalidate();

    SettingsService& settings_;
    ScreenCanvas* canvas_ = nullptr;
    bool active_ = false;

    DrawTool tool_  = DrawTool::Pen;
    COLORREF color_ = RGB(255, 0, 0);
    int     width_  = 5;

    bool    drawing_ = false;   // mouse button held
    bool    tracing_ = false;   // freehand stroke in progress
    POINT   prev_{};
    POINT   anchor_{};          // shape anchor (mouse-down point)
    RECT    shapeRect_{};       // current rubber-band rect (for erase)

    // Text mode
    bool    typing_ = false;
    POINT   textPt_{};
    HFONT   font_ = nullptr;
    HFONT   oldFont_ = nullptr;
};

} // namespace zoomit
