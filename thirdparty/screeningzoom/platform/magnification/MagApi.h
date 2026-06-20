// platform/magnification/MagApi.h — RAII over the Magnification API.
// Loaded dynamically because MinGW headers do not declare the Mag functions
// (and the magnification.h shim is empty). Mirrors the original Sysinternals
// ZoomIt approach: function-pointer typedefs + LoadLibrary.
//
// We use the Magnification *Control* (host window + WC_MAGNIFIER child +
// MagSetWindowTransform/Source), which is what the original uses by default.
// MagSetFullscreenTransform is retained for completeness but not used.
#pragma once

#include <windows.h>

namespace zoomit {

// MAGTRANSFORM (3x3 float affine), as declared by the Magnification API.
struct MagTransform {
    float v[3][3];
};

class MagApi {
public:
    bool init();
    void deinit();

    // ---- Magnification Control (host + magnifier child) ----
    bool setWindowSource(HWND mag, const RECT& rc);
    bool setWindowTransform(HWND mag, const MagTransform& m);
    bool setWindowFilterList(HWND mag, DWORD mode, int count, HWND* hwnds);
    bool setLensUseBitmapSmoothing(HWND mag, bool smooth);
    bool showSystemCursor(bool show);

    // ---- Fullscreen transform (not used by default path) ----
    bool setFullscreenTransform(float level, int xOffset, int yOffset);
    bool clearFullscreenTransform();
    bool enableInputTransform(const RECT& src, const RECT& dst);
    bool disableInputTransform();

    bool initialized() const { return module_ != nullptr; }

private:
    HMODULE module_ = nullptr;
};

} // namespace zoomit
