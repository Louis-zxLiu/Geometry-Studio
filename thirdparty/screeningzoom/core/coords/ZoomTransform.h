// core/coords/ZoomTransform.h
// Single source of truth for the SourceSpace<->ScreenSpace mapping and the
// shared zoom-level ladder. No module may roll its own zoom math.
#pragma once

#include <windows.h>
#include <cmath>
#include <algorithm>

namespace zoomit {

struct ZoomTransform {
    float  level = 1.0f;
    POINT  focus = {};          // SourceSpace point centered on screen
    POINT  screenOrigin = {};   // top-left of target monitor (desktop coords)
    SIZE   screenSize = {};     // target monitor size (px)
    bool identity() const { return level <= 1.0001f; }
};

// Discrete zoom ladder: 1.25x start, x1.1 per step, up to 32x (~30 steps).
// Index 0 == 1.0x (no zoom).
struct ZoomLadder {
    static constexpr float kStart = 1.25f;
    static constexpr float kStep  = 1.1f;
    static constexpr float kMax   = 32.0f;

    static int maxStep() {
        int n = 0;
        for (float v = kStart; v <= kMax + 0.001f; v *= kStep) ++n;
        return n;
    }
    static float levelAt(int step) {
        if (step <= 0) return 1.0f;
        return std::min(kMax, kStart * std::pow(kStep, static_cast<float>(step - 1)));
    }
    static int stepFor(float level) {
        if (level <= 1.0001f) return 0;
        return std::max(1, static_cast<int>(std::round(
            std::log(level / kStart) / std::log(kStep))) + 1);
    }
};

// Original LIVEZOOM_MOVE_REGIONS: the magnified view is divided into 8 bands
// per axis; the cursor in the center 6 bands does not pan, only the edge
// bands trigger panning.
constexpr int kLiveZoomMoveRegions = 8;

// Original GetZoomedTopLeftCoordinates + AdjustToMoveBoundary: given the
// cursor in monitor-local screen px and the monitor size, return the
// SourceSpace top-left to sample from for a centered, edge-dead-zone view.
inline void getZoomedTopLeft(float level, int cursorX, int cursorY,
                             int monW, int monH, int& outX, int& outY) {
    int scaledW = static_cast<int>(monW / level);
    int scaledH = static_cast<int>(monH / level);
    int x = cursorX - static_cast<int>((static_cast<float>(cursorX) / monW) * scaledW);
    int y = cursorY - static_cast<int>((static_cast<float>(cursorY) / monH) * scaledH);
    x = std::max(0, std::min(monW - scaledW, x));
    y = std::max(0, std::min(monH - scaledH, y));

    // AdjustToMoveBoundary: dead-zone at edges so the view only pans when the
    // cursor is within one band of the boundary.
    int bandW = scaledW / kLiveZoomMoveRegions;
    int bandH = scaledH / kLiveZoomMoveRegions;
    int leftDist   = cursorX - x;
    int rightDist  = (x + scaledW) - cursorX;
    int topDist    = cursorY - y;
    int bottomDist = (y + scaledH) - cursorY;
    if (leftDist  < bandW)       x = std::max(0, cursorX - bandW);
    else if (rightDist  < bandW) x = std::min(monW - scaledW, cursorX + bandW - scaledW);
    if (topDist   < bandH)       y = std::max(0, cursorY - bandH);
    else if (bottomDist < bandH) y = std::min(monH - scaledH, cursorY + bandH - scaledH);

    outX = x; outY = y;
}

} // namespace zoomit
