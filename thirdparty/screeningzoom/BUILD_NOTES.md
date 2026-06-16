# ScreeningZoom Helper Build Notes

目标：

- 从本机 `D:\projects\ZoomIt` 引入独立 helper 工程
- 输出名固定为 `screeningzoom-helper.exe`
- 放到 `thirdparty/screeningzoom/bin/`

## 第一阶段要求

- 保留 Zoom / Live Zoom / Draw / SelectRectangle / Esc / DPI manifest
- 保留原生右键菜单，但第一版只显示 `Zoom / Draw / Exit`
- 新增启动参数：
  - `--plotkitycat`
  - `--control-mode=stdin-json`
  - `--target-hwnd=<uint64>`
- 新增 stdin JSON lines 控制协议
- 支持命令：
  - `set-target`
  - `set-source-rect`
  - `clear-source-rect`
  - `exit`

## 不建议第一阶段直接做的事

- 不要先物理删除大量源文件
- 不要在 PlotKityCat 主进程里重写 ZoomIt 功能
- 不要把 helper 做成按场景多实例

## 建议做法

1. 使用 `helper/ScreeningZoomHelper.vcxproj` 作为独立工程
2. 先去掉 `__ZOOMIT_POWERTOYS__` 依赖
3. 优先保持上游能力可编译，只把 PlotKityCat 接口收敛到单独入口
4. 把 PlotKityCat 协议入口包在单独文件中
5. 保持对 `Zoomit.cpp` 的修改尽量集中、可追踪

## 当前落地

- 工程文件：`thirdparty/screeningzoom/helper/ScreeningZoomHelper.vcxproj`
- shim 依赖：`thirdparty/screeningzoom/helper/shims/`
- 构建脚本：`tools/screeningzoom/build-helper.ps1`

当前阶段的目标不是一次性编通，而是：

1. 让 helper 在独立工程里编译
2. 把第一批缺失依赖收敛到 `helper/shims`
3. 再逐步整理 `Zoomit.cpp` / `pch.h` 中剩余的上游耦合点，但不先删功能
