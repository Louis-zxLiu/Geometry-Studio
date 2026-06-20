#include "ScreenCanvas.h"

#include <algorithm>

namespace zoomit {

ScreenCanvas::~ScreenCanvas() { discard(); }

void ScreenCanvas::discard() {
    if (hdcCompat_) {
        if (hbmpOld_) { ::SelectObject(hdcCompat_, hbmpOld_); hbmpOld_ = nullptr; }
        ::DeleteDC(hdcCompat_);
        hdcCompat_ = nullptr;
    }
    if (hbmp_) { ::DeleteObject(hbmp_); hbmp_ = nullptr; }
    if (hdcSrc_) { ::DeleteDC(hdcSrc_); hdcSrc_ = nullptr; }
    width_ = height_ = 0;
    originX_ = originY_ = 0;
}

bool ScreenCanvas::capture(POINT pt) {
    HMONITOR hmon = ::MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
    MONITORINFO mi{};
    mi.cbSize = sizeof(mi);
    ::GetMonitorInfoW(hmon, &mi);
    int w = mi.rcMonitor.right - mi.rcMonitor.left;
    int h = mi.rcMonitor.bottom - mi.rcMonitor.top;
    if (w <= 0 || h <= 0) return false;

    discard();

    hdcSrc_ = ::CreateDCW(L"DISPLAY", nullptr, nullptr, nullptr);
    if (!hdcSrc_) return false;
    hdcCompat_ = ::CreateCompatibleDC(hdcSrc_);
    if (!hdcCompat_) { discard(); return false; }
    hbmp_ = ::CreateCompatibleBitmap(hdcSrc_, w, h);
    if (!hbmp_) { discard(); return false; }
    hbmpOld_ = static_cast<HBITMAP>(::SelectObject(hdcCompat_, hbmp_));

    if (!::BitBlt(hdcCompat_, 0, 0, w, h, hdcSrc_,
                  mi.rcMonitor.left, mi.rcMonitor.top, SRCCOPY | CAPTUREBLT)) {
        discard();
        return false;
    }

    width_ = w; height_ = h;
    originX_ = mi.rcMonitor.left;
    originY_ = mi.rcMonitor.top;
    return true;
}

void ScreenCanvas::stretchTo(HDC hdcWindow, float level, int srcX, int srcY,
                             int dstW, int dstH, bool smooth) {
    if (!hdcCompat_ || level <= 0.0001f) return;
    int sw = static_cast<int>(dstW / level);
    int sh = static_cast<int>(dstH / level);
    int bx = srcX - originX_;
    int by = srcY - originY_;
    bx = std::max(0, std::min(width_  - sw, bx));
    by = std::max(0, std::min(height_ - sh, by));

    int oldMode = ::SetStretchBltMode(hdcWindow,
                                      smooth ? HALFTONE : COLORONCOLOR);
    ::SetBrushOrgEx(hdcWindow, 0, 0, nullptr);
    ::StretchBlt(hdcWindow, 0, 0, dstW, dstH,
                 hdcCompat_, bx, by, sw, sh, SRCCOPY);
    ::SetStretchBltMode(hdcWindow, oldMode);
}

GdiplusSession::GdiplusSession() {
    ULONG_PTR token = 0;
    Gdiplus::GdiplusStartupInput input;
    Gdiplus::GdiplusStartup(&token, &input, nullptr);
}
GdiplusSession::~GdiplusSession() = default;

} // namespace zoomit
