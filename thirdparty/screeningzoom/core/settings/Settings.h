// core/settings/Settings.h
// Only three user-tunable settings: auto-start, pen width, and the three
// hotkeys. Everything else is hardcoded to match the original ZoomIt.
#pragma once

#include <windows.h>
#include <string>

namespace zoomit {

struct Hotkey {
    DWORD modifiers = 0;   // MOD_CONTROL/MOD_ALT/MOD_SHIFT/MOD_WIN
    UINT  vk = 0;
    bool operator==(const Hotkey&) const = default;
};

struct Settings {
    // Behaviour
    bool  autoStart   = false;
    int   penWidth    = 5;          // 2..40 (original PEN_WIDTH/MAX_PEN_WIDTH)

    // Hotkeys
    Hotkey zoomHotkey     {MOD_CONTROL, '1'};  // static (frozen) zoom
    Hotkey liveZoomHotkey {MOD_CONTROL, '2'};  // live zoom (magnification)
    Hotkey drawHotkey     {MOD_CONTROL, '3'};  // screenshot-based draw mode
};

// Loads/saves %APPDATA%/zoomit/settings.json and applies auto-start.
class SettingsService {
public:
    SettingsService();
    const Settings& current() const { return s_; }
    void set(const Settings& s);
    void reload();
private:
    void load();
    void save();
    void applyAutoStart();
    Settings s_;
    std::wstring path_;
};

} // namespace zoomit
