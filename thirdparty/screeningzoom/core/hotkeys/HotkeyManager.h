// core/hotkeys/HotkeyManager.h
// Owns RegisterHotKey lifecycle for the message-pumping thread and reports
// conflicts. Borrowed from the original ZoomIt approach but RAII + typed.
#pragma once

#include "core/settings/Settings.h"
#include <windows.h>
#include <functional>
#include <vector>
#include <cstdint>

namespace zoomit {

class HotkeyManager {
public:
    enum class Action { Zoom, LiveZoom, Draw };

    using Trigger = std::function<void(Action)>;

    explicit HotkeyManager(HWND owner) : owner_(owner) {}

    // Register the three configured hotkeys. Returns false if a conflict
    // prevented registration of any of them; conflictMsg() describes it.
    bool registerAll(const Settings& s, Trigger t);
    void unregisterAll();

    // Called from the owner window's WndProc for WM_HOTKEY.
    void onHotkey(int id);

    const std::wstring& conflictMsg() const { return conflict_; }

private:
    bool tryRegister(int id, const Hotkey& k);
    void describeConflict(const Hotkey& k);

    HWND owner_{};
    Trigger trigger_{};
    std::vector<Action> idToAction_; // index = hotkey id - base
    std::wstring conflict_;
    static constexpr int kBase = 0x5A00;
};

} // namespace zoomit
