#pragma once

#include <windows.h>

#define BUILD_WINDOWS_SERVER_2022 20348
#define BUILD_WINDOWS_11_21H2 22000
#define BUILD_WINDOWS_11_22H2 22621

#ifdef __cplusplus
extern "C" {
#endif

DWORD GetWindowsBuild(DWORD* revision);

#ifdef __cplusplus
}
#endif
