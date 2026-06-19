#include "HotkeyManager.h"

namespace zoomit {

bool HotkeyManager::registerAll(const Settings& s, Trigger t) {
    unregisterAll();
    trigger_ = std::move(t);
    idToAction_.clear();
    conflict_.clear();

    struct { Action a; const Hotkey& k; } list[3] = {
        {Action::Zoom,     s.zoomHotkey},
        {Action::LiveZoom, s.liveZoomHotkey},
        {Action::Draw,     s.drawHotkey},
    };

    for (int i = 0; i < 3; ++i) {
        if (!tryRegister(kBase + i, list[i].k)) {
            describeConflict(list[i].k);
            return false;
        }
        idToAction_.push_back(list[i].a);
    }
    return true;
}

void HotkeyManager::unregisterAll() {
    for (int i = 0; i < 3; ++i) {
        ::UnregisterHotKey(owner_, kBase + i);
    }
    idToAction_.clear();
}

bool HotkeyManager::tryRegister(int id, const Hotkey& k) {
    if (k.vk == 0) return true; // unbound hotkey — silently skip
    return ::RegisterHotKey(owner_, id, k.modifiers | MOD_NOREPEAT, k.vk) != 0;
}

void HotkeyManager::onHotkey(int id) {
    int idx = id - kBase;
    if (idx < 0 || idx >= static_cast<int>(idToAction_.size())) return;
    if (trigger_) trigger_(idToAction_[idx]);
}

void HotkeyManager::describeConflict(const Hotkey& k) {
    conflict_ = L"ZoomIt: hotkey conflict (mods=" + std::to_wstring(k.modifiers) +
                L", vk=" + std::to_wstring(k.vk) + L"). Another app owns it.";
}

} // namespace zoomit
