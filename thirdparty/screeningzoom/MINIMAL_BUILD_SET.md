# ScreeningZoom 最小编译集

目标不是先把 `ZoomIt.vcxproj` 直接改通，而是先定义一个最小 helper 工程应当保留哪些文件。

## 预计必须保留

源文件：

- `ZoomIt/Zoomit.cpp`
- `ZoomIt/pch.cpp`
- `ZoomIt/SelectRectangle.cpp`
- `ZoomIt/Utility.cpp`
- `ZoomIt/VersionHelper.cpp`
- `ZoomItBreak/BreakTimer.cpp`

头文件：

- `ZoomIt/pch.h`
- `ZoomIt/ZoomIt.h`
- `ZoomIt/ZoomItSettings.h`
- `ZoomIt/SelectRectangle.h`
- `ZoomIt/Utility.h`
- `ZoomIt/VersionHelper.h`
- `ZoomIt/Registry.h`
- `ZoomIt/resource.h`
- `ZoomItBreak/BreakTimer.h`

资源：

- `ZoomIt/ZoomIt.rc`
- `ZoomIt/Zoomit.exe.manifest`
- `ZoomIt/appicon.ico`
- `ZoomIt/icon1.ico`
- `ZoomIt/cursor1.cur`
- `ZoomIt/drawingc.cur`

## 第一阶段明确剔除

不进入 helper 最小工程：

- `AudioSampleGenerator.*`
- `LoopbackCapture.*`
- `GifRecordingSession.*`
- `VideoRecordingSession.*`
- `PanoramaCapture.*`
- `NoiseSuppressor.*`
- `BackgroundBlur.*`
- `WebcamCapture.*`
- `WebcamPreviewWindow.*`
- `DemoType.*`
- `ZoomItModuleInterface/*`
- `ZoomItSettingsInterop/*`
- `rnnoise/*`

## 构建层风险

即使不编这些文件，`pch.h` 和 `Zoomit.cpp` 里仍然可能残留它们的包含关系。

所以 helper 工程真正要做的是：

1. 新建一个独立的最小 `.vcxproj`
2. 先只引用上面列出的最小编译集
3. 再逐步把 `pch.h` / `Zoomit.cpp` 里无关 include 和调用裁掉

## 结论

不要继续在原 `ZoomIt.vcxproj` 上做“排除式删减”。

应该新建：

- `thirdparty/screeningzoom/helper/ScreeningZoomHelper.vcxproj`

让 helper 工程只承载教学放映所需能力。
