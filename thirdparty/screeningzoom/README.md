# ScreeningZoom

`ScreeningZoom` 是 PlotKityCat 放映模式使用的独立放大镜 helper。

它基于仓库内的 ZoomIt 上游副本，复用其现有的放大和标注能力。PlotKityCat 的接入面被控制在很薄的一层。

## 设计边界

- helper 是独立 `exe`，独立于 PlotKityCat 主进程
- PlotKityCat 只负责启动和停止 helper
- helper 侧的改动应局限于放映模式相关入口
- 优先复用上游能力

## 当前开发态能力

- 进入放大视角
- 退出放大视角
- 进入画笔
- 退出画笔
- Live Zoom 细粒度缩放层级
- 保留上游 DPI manifest 与其余原生能力

## 目录说明

- `upstream/`
  - ZoomIt 上游副本与 helper 实际改动点
- `helper/`
  - 独立 Visual Studio 工程与本地 shims
- `bin/`
  - 开发态已发布 helper 输出目录
- `DEVELOPER_GUIDE.md`
  - 给后续开发者的接手说明

## 运行与发布

- 开发态优先读取：
  - `thirdparty/screeningzoom/bin/screeningzoom-helper.exe`
- 打包态优先读取：
  - `resources/screeningzoom/screeningzoom-helper.exe`

构建并同步两个位置：

```powershell
.\tools\screeningzoom\build-and-publish-helper.ps1 -Configuration Release
```

只同步已有构建产物：

```powershell
.\tools\screeningzoom\publish-helper.ps1 -BuiltHelperPath <path-to-screeningzoom-helper.exe>
```

详细接手说明见 [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)。
