#include <wchar.h>

#include "eula.h"

int ShowEula(const wchar_t* appName, void* reserved1, void* reserved2)
{
    (void)appName;
    (void)reserved1;
    (void)reserved2;
    return 1;
}
