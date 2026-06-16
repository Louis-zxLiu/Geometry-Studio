# PPT Zoom Patch Targets

这个文件只记录“从 ZoomIt 改成 PlotKityCat ScreeningZoom helper”时应该动哪几个点。

## 第一批改动点

1. `ZoomIt/Zoomit.cpp`
- 增加 `--plotkitycat`
- 增加 `--control-mode=stdin-json`
- 增加 `--target-hwnd=<uint64>`
- 增加 stdin JSON 控制循环
- 收缩右键菜单到 `Zoom / Draw / Exit`
- 增加 `set-source-rect / clear-source-rect`
- 增加右键拖拽框选后直接进入 zoom

2. `ZoomIt/ZoomIt.h`
- 增加 PlotKityCat helper 相关常量/消息定义

3. `ZoomIt/SelectRectangle.cpp`
- 复用现有区域框选逻辑
- 如有必要，增加“右键拖拽专用进入路径”

4. `ZoomIt/Zoomit.exe.manifest`
- 保留 DPI 设置，不做降级

## 暂不动

- `DemoType.*`
- `GifRecordingSession.*`
- `VideoRecordingSession.*`
- `Webcam*`
- `BackgroundBlur*`
- `NoiseSuppressor*`
- `LoopbackCapture*`
- `AudioSampleGenerator*`
- `PanoramaCapture*`
- `ZoomItSettingsInterop`
- `ZoomItModuleInterface`
