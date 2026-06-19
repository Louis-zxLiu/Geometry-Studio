// core/events/EventBus.h — tiny type-safe pub/sub, replaces WM_USER sprawl.
#pragma once

#include <functional>
#include <unordered_map>
#include <vector>
#include <typeindex>
#include <any>
#include <cstdint>

namespace zoomit {

class EventBus {
public:
    template <typename E>
    using Handler = std::function<void(const E&)>;

    template <typename E>
    std::size_t subscribe(Handler<E> h) {
        auto& vec = handlers_[std::type_index(typeid(E))];
        auto id = nextId();
        vec.push_back({id, [h = std::move(h)](const std::any& a) {
                           h(std::any_cast<const E&>(a));
                       }});
        return id;
    }

    void unsubscribe(std::size_t id) {
        for (auto& [_, vec] : handlers_) {
            std::erase_if(vec, [id](const Entry& e) { return e.id == id; });
        }
    }

    template <typename E>
    void publish(const E& e) {
        auto it = handlers_.find(std::type_index(typeid(E)));
        if (it == handlers_.end()) return;
        // Copy in case a handler subscribes/unsubscribes during dispatch.
        auto copy = it->second;
        for (const auto& entry : copy) entry.fn(e);
    }

private:
    struct Entry {
        std::size_t id{};
        std::function<void(const std::any&)> fn;
    };
    std::unordered_map<std::type_index, std::vector<Entry>> handlers_;
    std::size_t next_ = 1;
    std::size_t nextId() { return next_++; }
};

} // namespace zoomit
