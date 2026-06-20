// modules/zoom/IZoomLayer.h — interface for both frozen and live zoom.
#pragma once

#include "core/coords/ZoomTransform.h"
#include <windows.h>

namespace zoomit {

enum class ZoomMode { Frozen, Live };

class IZoomLayer {
public:
    virtual ~IZoomLayer() = default;
    virtual void enter() = 0;
    virtual void exit() = 0;
    virtual bool active() const = 0;
    virtual void setLevel(float level) = 0;
    virtual void stepLevel(int delta) = 0;
    virtual float level() const = 0;
    virtual void panBy(POINT delta) = 0;
    virtual void setFocus(POINT sourcePt) = 0;
    virtual ZoomTransform transform() const = 0;
    virtual ZoomMode mode() const = 0;
    // Wheel hook shared by both implementations.
    virtual void onWheel(int deltaTicks) = 0;
};

} // namespace zoomit
