// common/Common.h — shared utilities for the whole project.
#pragma once

#include <windows.h>
#include <tchar.h>
#include <string>
#include <string_view>
#include <memory>
#include <cstdint>

namespace zoomit {

// Convert between UTF-16 (wide) and UTF-8.
std::wstring Utf8ToWide(std::string_view utf8);
std::string  WideToUtf8(std::wstring_view wide);

// RAII wrapper for any handle closed via a function pointer.
template <typename Handle, auto Closer>
class UniqueHandle {
public:
    UniqueHandle() = default;
    explicit UniqueHandle(Handle h) : h_(h) {}
    ~UniqueHandle() { reset(); }
    UniqueHandle(const UniqueHandle&) = delete;
    UniqueHandle& operator=(const UniqueHandle&) = delete;
    UniqueHandle(UniqueHandle&& o) noexcept : h_(o.h_) { o.h_ = {}; }
    UniqueHandle& operator=(UniqueHandle&& o) noexcept {
        if (this != &o) { reset(); h_ = o.h_; o.h_ = {}; }
        return *this;
    }
    Handle get() const { return h_; }
    explicit operator bool() const { return h_ != Handle{}; }
    void reset(Handle h = {}) {
        if (h_ != Handle{} && h_ != h) Closer(h_);
        h_ = h;
    }
    Handle release() { Handle t = h_; h_ = {}; return t; }
private:
    Handle h_{};
};

} // namespace zoomit
