#pragma once

namespace Shared::Trace
{
class ETWTrace
{
public:
    ETWTrace() = default;
    ~ETWTrace() = default;
};
}

namespace Trace
{
inline void RegisterProvider() {}
inline void UnregisterProvider() {}
inline void ZoomItStarted() {}
inline void ZoomItActivateZoom() {}
inline void ZoomItActivateDraw() {}
inline void ZoomItActivateBreak() {}
inline void ZoomItActivateLiveZoom() {}
inline void ZoomItActivateSnip() {}
inline void ZoomItActivateSnipOcr() {}
inline void ZoomItActivateRecord() {}
inline void ZoomItActivateDemoType() {}
}
