#include "Settings.h"
#include "common/Common.h"

#include <nlohmann/json.hpp>
#include <shlwapi.h>
#include <fstream>
#include <sstream>

namespace zoomit {

using json = nlohmann::json;

namespace {
std::wstring appDataDir() {
    wchar_t buf[MAX_PATH]{};
    ::GetEnvironmentVariableW(L"APPDATA", buf, MAX_PATH);
    return std::wstring(buf) + L"\\zoomit";
}
std::wstring settingsPath() { return appDataDir() + L"\\settings.json"; }

Hotkey hotkeyFromJson(const json& j, const Hotkey& def) {
    Hotkey k = def;
    k.modifiers = j.value("mods", def.modifiers);
    k.vk        = j.value("vk",   def.vk);
    return k;
}
json hotkeyToJson(const Hotkey& k) { return {{"mods", k.modifiers}, {"vk", k.vk}}; }

void ensureDir(const std::wstring& d) {
    if (::CreateDirectoryW(d.c_str(), nullptr) || ::GetLastError() == ERROR_ALREADY_EXISTS)
        return;
    // create parent first
    std::wstring parent = d;
    auto pos = parent.find_last_of(L'\\');
    if (pos != std::wstring::npos) ensureDir(parent.substr(0, pos));
    ::CreateDirectoryW(d.c_str(), nullptr);
}
} // namespace

SettingsService::SettingsService() {
    path_ = settingsPath();
    ensureDir(appDataDir());
    load();
    applyAutoStart();
}

void SettingsService::load() {
    std::ifstream in(WideToUtf8(path_), std::ios::binary);
    if (!in) return;
    try {
        json j; in >> j;
        s_.autoStart      = j.value("autoStart",  s_.autoStart);
        s_.penWidth       = j.value("penWidth",   s_.penWidth);
        s_.zoomHotkey     = hotkeyFromJson(j.value("zoomHotkey",     hotkeyToJson(s_.zoomHotkey)),     s_.zoomHotkey);
        s_.liveZoomHotkey = hotkeyFromJson(j.value("liveZoomHotkey", hotkeyToJson(s_.liveZoomHotkey)), s_.liveZoomHotkey);
        s_.drawHotkey     = hotkeyFromJson(j.value("drawHotkey",     hotkeyToJson(s_.drawHotkey)),     s_.drawHotkey);
    } catch (...) {}
    if (s_.penWidth < 2)  s_.penWidth = 2;
    if (s_.penWidth > 40) s_.penWidth = 40;
}

void SettingsService::save() {
    json j;
    j["autoStart"]      = s_.autoStart;
    j["penWidth"]       = s_.penWidth;
    j["zoomHotkey"]     = hotkeyToJson(s_.zoomHotkey);
    j["liveZoomHotkey"] = hotkeyToJson(s_.liveZoomHotkey);
    j["drawHotkey"]     = hotkeyToJson(s_.drawHotkey);
    std::ofstream out(WideToUtf8(path_), std::ios::binary);
    out << j.dump(2);
}

void SettingsService::set(const Settings& s) {
    s_ = s;
    if (s_.penWidth < 2)  s_.penWidth = 2;
    if (s_.penWidth > 40) s_.penWidth = 40;
    save();
    applyAutoStart();
}

void SettingsService::reload() { load(); applyAutoStart(); }

void SettingsService::applyAutoStart() {
    HKEY hKey = nullptr;
    const wchar_t* kRun = L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";
    const wchar_t* kVal = L"ZoomIt";
    wchar_t exe[MAX_PATH]{};
    ::GetModuleFileNameW(nullptr, exe, MAX_PATH);
    if (s_.autoStart) {
        if (::RegCreateKeyExW(HKEY_CURRENT_USER, kRun, 0, nullptr, 0,
                              KEY_SET_VALUE, nullptr, &hKey, nullptr) == ERROR_SUCCESS) {
            std::wstring cmd = std::wstring(L"\"") + exe + L"\"";
            ::RegSetValueExW(hKey, kVal, 0, REG_SZ,
                             reinterpret_cast<const BYTE*>(cmd.c_str()),
                             static_cast<DWORD>((cmd.size() + 1) * sizeof(wchar_t)));
            ::RegCloseKey(hKey);
        }
    } else {
        if (::RegOpenKeyExW(HKEY_CURRENT_USER, kRun, 0, KEY_SET_VALUE, &hKey) == ERROR_SUCCESS) {
            ::RegDeleteValueW(hKey, kVal);
            ::RegCloseKey(hKey);
        }
    }
}

} // namespace zoomit
