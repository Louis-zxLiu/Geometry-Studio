// platform/gdi/ScreenCanvas.h
// A single GDI back-buffer holding a screenshot of one monitor, plus a
// StretchBlt path to render it zoomed onto the overlay window's DC. This is
// the original Sysinternals ZoomIt rendering pipeline: hdcScreenCompat holds
// the frozen desktop, WM_PAINT StretchBlts it at the current zoom level, and
// drawing tools paint directly onto hdcScreenCompat (so strokes scale with
// the desktop). No Direct2D, no layered transparency, no undo snapshots.
#pragma once

#include <ocidl.h>
#include <windows.h>
#include <gdiplus.h>
#include <memory>

namespace zoomit {

class ScreenCanvas {
public:
    ScreenCanvas() = default;
    ~ScreenCanvas();
    ScreenCanvas(const ScreenCanvas&) = delete;
    ScreenCanvas& operator=(const ScreenCanvas&) = delete;

    // Capture the monitor containing `pt` into the back buffer.
    bool capture(POINT pt);

    // Discard everything (called on mode exit).
    void discard();

    // Stretch the captured buffer onto `hdcWindow` at `level`x, sampling from
    // desktop-space point (srcX, srcY). dstW/dstH = window client size.
    // Coordinates: srcX/srcY are absolute desktop coords; they are mapped
    // into the buffer's monitor-local space internally.
    void stretchTo(HDC hdcWindow, float level, int srcX, int srcY,
                   int dstW, int dstH, bool smooth);

    HDC compatDC() const { return hdcCompat_; }
    int  width()   const { return width_; }
    int  height()  const { return height_; }
    int  originX() const { return originX_; }
    int  originY() const { return originY_; }
    bool valid()   const { return hdcCompat_ != nullptr; }
private:
    HDC    hdcSrc_    = nullptr; // DC for "DISPLAY" of the captured monitor
    HDC    hdcCompat_ = nullptr; // compatible DC holding hbmp_
    HBITMAP hbmp_     = nullptr;
    HBITMAP hbmpOld_  = nullptr;
    int    width_  = 0;
    int    height_ = 0;
    int    originX_ = 0;
    int    originY_ = 0;
};

// RAII GDI+ session for the process lifetime.
class GdiplusSession {
public:
    GdiplusSession();
    ~GdiplusSession();
    GdiplusSession(const GdiplusSession&) = delete;
};

} // namespace zoomit
