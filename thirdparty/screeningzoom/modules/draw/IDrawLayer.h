// modules/draw/IDrawLayer.h
#pragma once

#include <windows.h>

namespace zoomit {

enum class DrawTool { Pen, Line, Rect, Ellipse, Arrow, Text };

struct PointerEvent {
    POINT client;          // overlay client coords == canvas coords
    bool  shift = false;
    bool  ctrl  = false;
    bool  tab   = false;
};

class ScreenCanvas;

class IDrawLayer {
public:
    virtual ~IDrawLayer() = default;
    virtual void enter(ScreenCanvas& canvas) = 0;
    virtual void exit() = 0;
    virtual bool active() const = 0;

    virtual void onPointerDown(const PointerEvent& e) = 0;
    virtual void onPointerMove(const PointerEvent& e) = 0;
    virtual void onPointerUp(const PointerEvent& e) = 0;

    virtual void onChar(wchar_t ch) = 0;
    virtual void onKey(UINT vk, bool down) = 0;

    virtual void setTool(DrawTool t) = 0;
    virtual void setColor(COLORREF c) = 0;
    virtual void setWidth(int w) = 0;
    virtual DrawTool tool() const = 0;
    virtual bool drawing() const = 0;
    virtual bool typing() const = 0;
};

} // namespace zoomit
