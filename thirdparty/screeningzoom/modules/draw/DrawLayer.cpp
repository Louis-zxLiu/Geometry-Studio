#include "DrawLayer.h"

#include "platform/gdi/ScreenCanvas.h"

#include <gdiplus.h>
#include <algorithm>
#include <cmath>

namespace zoomit {

DrawLayer::DrawLayer(SettingsService& s) : settings_(s) {}
DrawLayer::~DrawLayer() { exit(); }

void DrawLayer::enter(ScreenCanvas& canvas) {
    if (active_) return;
    canvas_ = &canvas;
    active_ = true;
    width_  = settings_.current().penWidth;
    color_  = RGB(255, 0, 0);
    tool_   = DrawTool::Pen;
    drawing_ = tracing_ = typing_ = false;
    invalidate();
}

void DrawLayer::exit() {
    if (!active_ && !font_ && !canvas_) return;
    if (font_) { if (canvas_ && canvas_->compatDC() && oldFont_)
                     ::SelectObject(canvas_->compatDC(), oldFont_);
                 ::DeleteObject(font_); font_ = nullptr; oldFont_ = nullptr; }
    canvas_ = nullptr;
    active_ = false;
    drawing_ = tracing_ = typing_ = false;
}

void DrawLayer::invalidate() {
    // Draw paints permanent pixels into an already prepared backing canvas.
    // Re-pulling the current screen here would overwrite strokes and would
    // also break the controller's "capture once, then freeze" draw mode.
    (void)canvas_;
}

// ---- Freehand ----
void DrawLayer::drawFreehandSegment(POINT a, POINT b) {
    if (!canvas_) return;
    HDC hdc = canvas_->compatDC();
    Gdiplus::Graphics g(hdc);
    g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
    Gdiplus::Pen pen(Gdiplus::Color(255, GetRValue(color_), GetGValue(color_), GetBValue(color_)),
                     static_cast<Gdiplus::REAL>(width_));
    pen.SetLineCap(Gdiplus::LineCapRound, Gdiplus::LineCapRound, Gdiplus::DashCapRound);
    g.DrawLine(&pen, static_cast<INT>(a.x), static_cast<INT>(a.y),
                     static_cast<INT>(b.x), static_cast<INT>(b.y));
}

// ---- Shape rubber-banding (R2_NOT, hollow brush) ----
void DrawLayer::drawShape(POINT a, POINT b) {
    if (!canvas_) return;
    HDC hdc = canvas_->compatDC();
    int x1 = std::min(a.x, b.x), y1 = std::min(a.y, b.y);
    int x2 = std::max(a.x, b.x), y2 = std::max(a.y, b.y);
    switch (tool_) {
    case DrawTool::Rect:
        ::Rectangle(hdc, x1, y1, x2, y2); break;
    case DrawTool::Ellipse:
        ::Ellipse(hdc, x1, y1, x2, y2); break;
    case DrawTool::Line:
        ::MoveToEx(hdc, a.x, a.y, nullptr); ::LineTo(hdc, b.x, b.y); break;
    case DrawTool::Arrow: {
        ::MoveToEx(hdc, a.x, a.y, nullptr); ::LineTo(hdc, b.x, b.y);
        // arrowhead
        float dx = b.x - a.x, dy = b.y - a.y;
        float len = std::sqrt(dx*dx + dy*dy);
        if (len > 1) { dx/=len; dy/=len; int h = std::max(width_*3, 12);
            ::LineTo(hdc, b.x - (int)(dx*h - dy*h*0.4f), b.y - (int)(dy*h + dx*h*0.4f));
            ::MoveToEx(hdc, b.x, b.y, nullptr);
            ::LineTo(hdc, b.x - (int)(dx*h + dy*h*0.4f), b.y - (int)(dy*h - dx*h*0.4f)); }
        break;
    }
    default: break;
    }
}

void DrawLayer::rubberShape(POINT cur, bool erase) {
    if (!canvas_) return;
    HDC hdc = canvas_->compatDC();
    int oldRop = ::SetROP2(hdc, R2_NOT);
    HBRUSH oldBr = static_cast<HBRUSH>(::SelectObject(hdc, ::GetStockObject(NULL_BRUSH)));
    HPEN pen = ::CreatePen(PS_SOLID, width_, color_);
    HPEN oldPen = static_cast<HPEN>(::SelectObject(hdc, pen));
    if (erase && (shapeRect_.left != shapeRect_.right || shapeRect_.top != shapeRect_.bottom))
        drawShape(anchor_, POINT{shapeRect_.right, shapeRect_.bottom});
    // new rect
    if (tool_ == DrawTool::Line || tool_ == DrawTool::Arrow) {
        shapeRect_.right = cur.x; shapeRect_.bottom = cur.y;
    } else {
        shapeRect_.left = std::min(anchor_.x, cur.x); shapeRect_.top = std::min(anchor_.y, cur.y);
        shapeRect_.right = std::max(anchor_.x, cur.x); shapeRect_.bottom = std::max(anchor_.y, cur.y);
    }
    drawShape(anchor_, cur);
    ::SelectObject(hdc, oldPen); ::DeleteObject(pen);
    ::SelectObject(hdc, oldBr);
    ::SetROP2(hdc, oldRop);
}

void DrawLayer::onPointerDown(const PointerEvent& e) {
    if (!active_ || !canvas_) return;
    if (typing_) return;

    drawing_ = true;
    prev_ = e.client;
    anchor_ = e.client;
    shapeRect_ = {e.client.x, e.client.y, e.client.x, e.client.y};

    if (e.ctrl && e.shift)      tool_ = DrawTool::Arrow;
    else if (e.ctrl)            tool_ = DrawTool::Rect;
    else if (e.shift)           tool_ = DrawTool::Line;
    else if (e.tab)             tool_ = DrawTool::Ellipse;
    else                        tool_ = DrawTool::Pen;

    if (tool_ == DrawTool::Pen) {
        tracing_ = true;
        drawFreehandSegment(prev_, prev_); // dot
    }
}

void DrawLayer::onPointerMove(const PointerEvent& e) {
    if (!active_ || !drawing_ || !canvas_) return;
    if (typing_) return;

    if (tool_ == DrawTool::Pen) {
        drawFreehandSegment(prev_, e.client);
        prev_ = e.client;
    } else {
        rubberShape(e.client, true);
    }
}

void DrawLayer::onPointerUp(const PointerEvent& e) {
    if (!active_ || !drawing_) return;
    drawing_ = false;
    if (tool_ != DrawTool::Pen && !typing_) {
        // commit final shape in normal ink (not R2_NOT)
        HDC hdc = canvas_->compatDC();
        HBRUSH oldBr = static_cast<HBRUSH>(::SelectObject(hdc, ::GetStockObject(NULL_BRUSH)));
        HPEN pen = ::CreatePen(PS_SOLID, width_, color_);
        HPEN oldPen = static_cast<HPEN>(::SelectObject(hdc, pen));
        drawShape(anchor_, e.client);
        ::SelectObject(hdc, oldPen); ::DeleteObject(pen);
        ::SelectObject(hdc, oldBr);
    }
    tracing_ = false;
}

// ---- Text mode ----
void DrawLayer::startText(POINT client) {
    if (!canvas_) return;
    typing_ = true;
    textPt_ = client;
    if (!font_) {
        int h = canvas_->height();
        font_ = ::CreateFontW(std::max(h / 15, 20), 0, 0, 0, FW_NORMAL,
                              FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                              OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                              ANTIALIASED_QUALITY, DEFAULT_PITCH | FF_SWISS,
                              L"Arial");
        oldFont_ = static_cast<HFONT>(::SelectObject(canvas_->compatDC(), font_));
    }
}
void DrawLayer::commitTextChar(wchar_t ch) {
    if (!canvas_) return;
    HDC hdc = canvas_->compatDC();
    ::SetTextColor(hdc, color_);
    ::SetBkMode(hdc, TRANSPARENT);
    RECT rc{textPt_.x, textPt_.y, textPt_.x + 1000, textPt_.y + 1000};
    ::DrawTextW(hdc, &ch, 1, &rc, DT_CALCRECT);
    ::DrawTextW(hdc, &ch, 1, &rc, DT_LEFT);
    textPt_.x += rc.right - rc.left;
}

void DrawLayer::onChar(wchar_t ch) {
    if (!active_ || !typing_) return;
    if (ch == L'\r') { typing_ = false; return; }
    commitTextChar(ch);
}

void DrawLayer::onKey(UINT vk, bool down) {
    if (!active_) return;
    if (!down) return;
    if (typing_) {
        if (vk == VK_ESCAPE) typing_ = false;
        return;
    }
    // Tool/colour hotkeys handled by controller; here only text start.
}

} // namespace zoomit
