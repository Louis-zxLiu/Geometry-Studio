cmake_minimum_required(VERSION 3.26)
project(zoomit-next LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

# ---- Globals ---------------------------------------------------------------
add_compile_definitions(
    UNICODE
    _UNICODE
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    GDIPVER=0x0110
)
if(MSVC)
    add_compile_options(/W4 /permissive- /utf-8 /Zc:__cplusplus)
    add_compile_options(/MT)            # static CRT, single self-contained exe
else()
    add_compile_options(-Wall -Wextra -Wno-unused-parameter -municode)
endif()

# ---- Sources ---------------------------------------------------------------
set(SRC
    common/Common.cpp
    core/coords/ZoomTransform.cpp
    core/settings/Settings.cpp
    core/hotkeys/HotkeyManager.cpp
    core/mode_controller/ModeController.cpp
    platform/window/Window.cpp
    platform/gdi/ScreenCanvas.cpp
    platform/magnification/MagApi.cpp
    modules/zoom/FrozenZoomLayer.cpp
    modules/live_zoom/LiveZoomLayer.cpp
    modules/draw/DrawLayer.cpp
    ui/overlay_window/OverlayWindow.cpp
    app/main.cpp
)

add_executable(zoomit WIN32 ${SRC})
target_include_directories(zoomit PRIVATE ${CMAKE_SOURCE_DIR})

# ---- Dependencies ----------------------------------------------------------
find_package(nlohmann_json CONFIG REQUIRED)
target_link_libraries(zoomit PRIVATE nlohmann_json::nlohmann_json)

target_link_libraries(zoomit PRIVATE
    gdi32 gdiplus user32 shell32 comctl32
    ole32 oleaut32 uuid shlwapi
    advapi32 dwmapi psapi
)

if(MSVC)
    target_link_options(zoomit PRIVATE /SUBSYSTEM:WINDOWS)
else()
    target_link_options(zoomit PRIVATE -mwindows -municode)
endif()
