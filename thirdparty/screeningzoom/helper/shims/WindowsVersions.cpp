#include "WindowsVersions.h"

typedef LONG (WINAPI* RtlGetVersionPtr)(PRTL_OSVERSIONINFOW);

DWORD GetWindowsBuild(DWORD* revision)
{
    RTL_OSVERSIONINFOW versionInfo{};
    versionInfo.dwOSVersionInfoSize = sizeof(versionInfo);

    HMODULE ntdll = GetModuleHandleW(L"ntdll.dll");
    if (ntdll != nullptr)
    {
        auto rtlGetVersion = reinterpret_cast<RtlGetVersionPtr>(GetProcAddress(ntdll, "RtlGetVersion"));
        if (rtlGetVersion != nullptr && rtlGetVersion(&versionInfo) == 0)
        {
            if (revision != nullptr)
            {
                *revision = versionInfo.dwBuildNumber & 0xFFFF;
            }
            return versionInfo.dwBuildNumber;
        }
    }

    if (revision != nullptr)
    {
        *revision = 0;
    }
    return 0;
}
