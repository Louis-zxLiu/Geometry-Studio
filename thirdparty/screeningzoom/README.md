# ScreeningZoom Helper

这个目录用于放置从 ZoomIt 引入并做 PlotKityCat 集成改造的独立 helper。

约束：

- 目标是独立 exe，不嵌入 PlotKityCat 主进程
- 维持上游 ZoomIt 能力，新增 PlotKityCat 放映接入口
- PlotKityCat 通过一个很薄的 Go 桥接层与之通信

当前期望输出位置：

- 开发态：`thirdparty/screeningzoom/bin/screeningzoom-helper.exe`
- 打包态：`resources/screeningzoom/screeningzoom-helper.exe`

保留能力：

- Zoom
- Live Zoom
- Draw
- 区域框选
- Esc 退出
- DPI manifest

当前额外集成目标：

- `targetHwnd` 启动参数与更新命令
- `sourceRect` 外部传入与清理命令
- 右键短按菜单、右键拖拽框选放大
