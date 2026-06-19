#include "MagApi.h"

#include <loadperf.h> // for some minwin defs; harmless
#include <cstring>

namespace zoomit {

// ---- Function pointer typedefs (MinGW has no magnification.h symbols) ----
typedef BOOL(__stdcall* PFN_MagInitialize)(VOID);
typedef BOOL(__stdcall* PFN_MagUninitialize)(VOID);
typedef BOOL(__stdcall* PFN_MagSetWindowSource)(HWND, RECT);
typedef BOOL(__stdcall* PFN_MagGetWindowSource)(HWND, RECT*);
typedef BOOL(__stdcall* PFN_MagSetWindowTransform)(HWND, const MagTransform*);
typedef BOOL(__stdcall* PFN_MagSetWindowFilterList)(HWND, DWORD, int, HWND*);
typedef BOOL(__stdcall* PFN_MagSetLensUseBitmapSmoothing)(HWND, BOOL);
typedef BOOL(__stdcall* PFN_MagShowSystemCursor)(BOOL);
typedef BOOL(__stdcall* PFN_MagSetFullscreenTransform)(float, int, int);
typedef BOOL(__stdcall* PFN_MagSetFullscreenColorEffect)(const void*);
typedef BOOL(__stdcall* PFN_MagSetInputTransform)(BOOL, const RECT*, const RECT*);

// Filter mode constant (MW_FILTERMODE_EXCLUDE).
#ifndef MW_FILTERMODE_EXCLUDE
#define MW_FILTERMODE_EXCLUDE 0
#endif

struct ProcTable {
    PFN_MagInitialize                 MagInitialize{};
    PFN_MagUninitialize               MagUninitialize{};
    PFN_MagSetWindowSource            MagSetWindowSource{};
    PFN_MagSetWindowTransform         MagSetWindowTransform{};
    PFN_MagSetWindowFilterList        MagSetWindowFilterList{};
    PFN_MagSetLensUseBitmapSmoothing  MagSetLensUseBitmapSmoothing{};
    PFN_MagShowSystemCursor           MagShowSystemCursor{};
    PFN_MagSetFullscreenTransform     MagSetFullscreenTransform{};
    PFN_MagSetInputTransform          MagSetInputTransform{};
};

static ProcTable g_proc;

template <typename T>
static void load(HMODULE m, T& fn, const char* name) {
    if (!m) return;
    if (FARPROC raw = ::GetProcAddress(m, name)) {
        static_assert(sizeof(fn) == sizeof(raw));
        std::memcpy(&fn, &raw, sizeof(fn));
    }
}

bool MagApi::init() {
    if (module_) return true;
    module_ = ::LoadLibraryW(L"magnification.dll");
    if (!module_) return false;
    load(module_, g_proc.MagInitialize,                "MagInitialize");
    load(module_, g_proc.MagUninitialize,              "MagUninitialize");
    load(module_, g_proc.MagSetWindowSource,           "MagSetWindowSource");
    load(module_, g_proc.MagSetWindowTransform,        "MagSetWindowTransform");
    load(module_, g_proc.MagSetWindowFilterList,       "MagSetWindowFilterList");
    load(module_, g_proc.MagSetLensUseBitmapSmoothing, "MagSetLensUseBitmapSmoothing");
    load(module_, g_proc.MagShowSystemCursor,          "MagShowSystemCursor");
    load(module_, g_proc.MagSetFullscreenTransform,    "MagSetFullscreenTransform");
    load(module_, g_proc.MagSetInputTransform,         "MagSetInputTransform");
    if (g_proc.MagInitialize) g_proc.MagInitialize();
    return g_proc.MagInitialize != nullptr;
}

void MagApi::deinit() {
    if (!module_) return;
    if (g_proc.MagUninitialize) g_proc.MagUninitialize();
    ::FreeLibrary(module_);
    module_ = nullptr;
    g_proc = ProcTable{};
}

bool MagApi::setWindowSource(HWND mag, const RECT& rc) {
    return g_proc.MagSetWindowSource ? g_proc.MagSetWindowSource(mag, rc) : false;
}
bool MagApi::setWindowTransform(HWND mag, const MagTransform& m) {
    return g_proc.MagSetWindowTransform ? g_proc.MagSetWindowTransform(mag, &m) : false;
}
bool MagApi::setWindowFilterList(HWND mag, DWORD mode, int count, HWND* hwnds) {
    return g_proc.MagSetWindowFilterList ? g_proc.MagSetWindowFilterList(mag, mode, count, hwnds) : false;
}
bool MagApi::setLensUseBitmapSmoothing(HWND mag, bool smooth) {
    return g_proc.MagSetLensUseBitmapSmoothing ? g_proc.MagSetLensUseBitmapSmoothing(mag, smooth) : false;
}
bool MagApi::showSystemCursor(bool show) {
    return g_proc.MagShowSystemCursor ? g_proc.MagShowSystemCursor(show) : false;
}

bool MagApi::setFullscreenTransform(float level, int x, int y) {
    return g_proc.MagSetFullscreenTransform ? g_proc.MagSetFullscreenTransform(level, x, y) : false;
}
bool MagApi::clearFullscreenTransform() {
    return g_proc.MagSetFullscreenTransform ? g_proc.MagSetFullscreenTransform(1.0f, 0, 0) : false;
}
bool MagApi::enableInputTransform(const RECT& src, const RECT& dst) {
    return g_proc.MagSetInputTransform ? g_proc.MagSetInputTransform(TRUE, &src, &dst) : false;
}
bool MagApi::disableInputTransform() {
    return g_proc.MagSetInputTransform ? g_proc.MagSetInputTransform(FALSE, nullptr, nullptr) : false;
}

} // namespace zoomit
