# ScreeningZoom Helper

这个目录只承载 `screeningzoom-helper.exe` 的独立工程，不反向污染上游 `ZoomIt.vcxproj`。

当前结构：

- `ScreeningZoomHelper.vcxproj`
  - 独立 helper 工程，当前只提供 `x64` 的 `Debug/Release`
- `shims/`
  - 本地最小兼容头/源文件
  - 用来吸收上游缺失的 `Eula`、`WindowsVersions`、`logger`、`ETWTrace`、资源宏等基础依赖

工程原则：

- 不把 PlotKityCat 主程序逻辑塞进上游 `ZoomIt` 工程
- 上游能力优先保留，通过独立 helper 工程承载而不是嵌入主程序
- 所有 helper 侧新增构建依赖，优先落在这个目录
