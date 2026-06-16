#pragma once

#include <windows.h>

typedef enum DLL_LOAD_LOCATION
{
    DLL_LOAD_LOCATION_DEFAULT = 0,
    DLL_LOAD_LOCATION_SYSTEM = 1,
} DLL_LOAD_LOCATION;

static inline HMODULE LoadLibrarySafe(PCWSTR moduleName, DLL_LOAD_LOCATION loadLocation)
{
    if (loadLocation == DLL_LOAD_LOCATION_SYSTEM)
    {
        HMODULE module = LoadLibraryExW(moduleName, nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
        if (module != nullptr)
        {
            return module;
        }
    }

    return LoadLibraryW(moduleName);
}
