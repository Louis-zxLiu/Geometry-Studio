// app/main.cpp — thin assembly point.
#include "core/settings/Settings.h"
#include "core/events/EventBus.h"
#include "core/hotkeys/HotkeyManager.h"
#include "core/mode_controller/ModeController.h"
#include "ui/overlay_window/OverlayWindow.h"
#include "modules/zoom/IZoomLayer.h"
#include "platform/gdi/ScreenCanvas.h"

using namespace zoomit;

namespace {
struct App {
    SettingsService settings;
    EventBus bus;
    std::unique_ptr<OverlayWindow> overlay;
    std::unique_ptr<ModeController> controller;
    std::unique_ptr<HotkeyManager> hotkeys;
    HWND hiddenOwner = nullptr;
    GdiplusSession gdiplus;
};

App* g_app = nullptr;
HHOOK g_mouseHook = nullptr;
HHOOK g_keyboardHook = nullptr;

// The live-zoom host is WS_EX_TRANSPARENT (input passes through to the
// desktop, like the original), so it never sees the wheel or Escape. We
// intercept those globally here. Left/right clicks and mouse motion are
// left alone so the user can interact with the live desktop beneath.
LRESULT CALLBACK mouseHookProc(int code, WPARAM wp, LPARAM lp) {
    if (code == HC_ACTION && g_app) {
        auto* info = reinterpret_cast<MSLLHOOKSTRUCT*>(lp);
        if (wp == WM_MOUSEWHEEL &&
            g_app->controller->liveZoomActive() &&
            !g_app->controller->drawActive()) {
            short delta = static_cast<short>(HIWORD(info->mouseData));
            // Forward to the controller on the main thread (the hook runs on
            // the thread that installed it, but we keep it simple and call
            // directly — the LL hook runs on the message-loop thread).
            g_app->controller->onWheel(delta / WHEEL_DELTA);
            return 1; // swallow so the desktop doesn't also scroll
        }
    }
    return ::CallNextHookEx(nullptr, code, wp, lp);
}

LRESULT CALLBACK keyboardHookProc(int code, WPARAM wp, LPARAM lp) {
    if (code == HC_ACTION && wp == WM_KEYDOWN && g_app) {
        auto* kb = reinterpret_cast<KBDLLHOOKSTRUCT*>(lp);
        // Esc exits plain live zoom (during draw the overlay handles Esc
        // itself, so don't interfere).
        if (kb->vkCode == VK_ESCAPE &&
            g_app->controller->liveZoomActive() &&
            !g_app->controller->drawActive()) {
            g_app->controller->toggleLiveZoom();
            return 1; // swallow
        }
    }
    return ::CallNextHookEx(nullptr, code, wp, lp);
}

LRESULT CALLBACK ownerProc(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
    if (g_app && g_app->hotkeys && msg == WM_HOTKEY) {
        g_app->hotkeys->onHotkey(static_cast<int>(wp));
        return 0;
    }
    return ::DefWindowProcW(h, msg, wp, lp);
}

HWND createHiddenOwner() {
    WNDCLASSW wc{};
    wc.lpfnWndProc = &ownerProc;
    wc.hInstance = ::GetModuleHandleW(nullptr);
    wc.lpszClassName = L"ZoomItOwner";
    ::RegisterClassW(&wc);
    return ::CreateWindowExW(0, L"ZoomItOwner", L"ZoomIt", 0,
                             0, 0, 0, 0, nullptr, nullptr,
                             ::GetModuleHandleW(nullptr), nullptr);
}

void onHotkeyAction(HotkeyManager::Action a) {
    switch (a) {
    case HotkeyManager::Action::Zoom:
        g_app->controller->toggleZoom();
        break;
    case HotkeyManager::Action::LiveZoom:
        g_app->controller->toggleLiveZoom();
        break;
    case HotkeyManager::Action::Draw:
        g_app->controller->toggleDraw();
        break;
    }
}
} // namespace

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE, LPWSTR, int) {
    ::CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    ::SetProcessDPIAware();

    App app;
    g_app = &app;
    app.hiddenOwner = createHiddenOwner();

    app.overlay   = std::make_unique<OverlayWindow>();
    app.controller = std::make_unique<ModeController>(app.settings, app.bus);
    app.controller->init(*app.overlay);
    app.overlay->create(*app.controller);

    app.hotkeys = std::make_unique<HotkeyManager>(app.hiddenOwner);
    app.hotkeys->registerAll(app.settings.current(), onHotkeyAction);

    g_mouseHook = ::SetWindowsHookExW(WH_MOUSE_LL, mouseHookProc, nullptr, 0);
    g_keyboardHook = ::SetWindowsHookExW(WH_KEYBOARD_LL, keyboardHookProc, nullptr, 0);

    ::SetTimer(app.hiddenOwner, 1, 16, nullptr);
    MSG m{};
    while (::GetMessageW(&m, nullptr, 0, 0) > 0) {
        ::TranslateMessage(&m);
        ::DispatchMessageW(&m);
        if (m.message == WM_TIMER && m.hwnd == app.hiddenOwner) {
            if (m.wParam == 1) app.controller->tick();
        }
    }

    app.hotkeys->unregisterAll();
    if (g_mouseHook) ::UnhookWindowsHookEx(g_mouseHook);
    if (g_keyboardHook) ::UnhookWindowsHookEx(g_keyboardHook);
    ::CoUninitialize();
    return 0;
}
