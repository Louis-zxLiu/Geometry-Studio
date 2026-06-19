#include "Window.h"

#include <map>
#include <mutex>

namespace zoomit {

namespace {
std::mutex g_mapMu;
std::map<HWND, Window*>& registry() {
    static std::map<HWND, Window*> r;
    return r;
}
void registerWin(HWND h, Window* w) {
    std::lock_guard lk(g_mapMu);
    registry()[h] = w;
}
Window* lookupWin(HWND h) {
    std::lock_guard lk(g_mapMu);
    auto it = registry().find(h);
    return it == registry().end() ? nullptr : it->second;
}
void unregisterWin(HWND h) {
    std::lock_guard lk(g_mapMu);
    registry().erase(h);
}
}

Window::~Window() { destroy(); }

bool Window::create(const CreateParams& p) {
    HINSTANCE inst = ::GetModuleHandleW(nullptr);
    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = &Window::s_wndProc;
    wc.hInstance = inst;
    wc.hCursor = ::LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = ::CreateSolidBrush(p.brush);
    wc.lpszClassName = p.className.c_str();
    classAtom_ = ::RegisterClassExW(&wc);
    if (!classAtom_) classAtom_ = ::GetClassInfoExW(inst, p.className.c_str(), &wc) ? 1 : 0;

    brush_ = wc.hbrBackground;
    hwnd_ = ::CreateWindowExW(p.exStyle, p.className.c_str(), p.title.c_str(),
                              p.style, p.x, p.y, p.w, p.h,
                              nullptr, p.menu, inst, this);
    if (!hwnd_) return false;
    registerWin(hwnd_, this);
    return true;
}

void Window::destroy() {
    if (hwnd_) {
        unregisterWin(hwnd_);
        ::DestroyWindow(hwnd_);
        hwnd_ = nullptr;
    }
    if (brush_) { ::DeleteObject(brush_); brush_ = nullptr; }
}

LRESULT Window::onMessage(UINT, WPARAM, LPARAM, bool& handled) {
    handled = false;
    return 0;
}

LRESULT CALLBACK Window::s_wndProc(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
    if (msg == WM_NCCREATE) {
        auto* cs = reinterpret_cast<CREATESTRUCTW*>(lp);
        auto* self = static_cast<Window*>(cs->lpCreateParams);
        registerWin(h, self);
    }
    auto* self = lookupWin(h);
    if (self) {
        bool handled = false;
        LRESULT r = self->onMessage(msg, wp, lp, handled);
        if (handled) return r;
    }
    return ::DefWindowProcW(h, msg, wp, lp);
}

} // namespace zoomit
