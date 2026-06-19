// platform/window/Window.h — minimal Win32 window RAII with message routing.
#pragma once

#include <windows.h>
#include <functional>
#include <string>

namespace zoomit {

class Window {
public:
    struct CreateParams {
        std::wstring className;
        std::wstring title;
        DWORD style = WS_POPUP;
        DWORD exStyle = 0;
        int x = CW_USEDEFAULT, y = CW_USEDEFAULT;
        int w = CW_USEDEFAULT, h = CW_USEDEFAULT;
        HMENU menu = nullptr;
        COLORREF brush = RGB(0, 0, 0);
    };

    Window() = default;
    virtual ~Window();

    bool create(const CreateParams& p);
    void destroy();
    HWND hwnd() const { return hwnd_; }

    // Subclass hook: override to handle messages. Return true and set
    // *result to "handled".
    virtual LRESULT onMessage(UINT msg, WPARAM wp, LPARAM lp, bool& handled);

protected:
    HWND hwnd_ = nullptr;
    HBRUSH brush_ = nullptr;
    ATOM classAtom_ = 0;

    static LRESULT CALLBACK s_wndProc(HWND, UINT, WPARAM, LPARAM);
};

} // namespace zoomit
