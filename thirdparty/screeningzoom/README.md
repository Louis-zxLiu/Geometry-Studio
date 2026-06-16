# ScreeningZoom

`ScreeningZoom` 是 PlotKityCat 放映模式使用的独立放大镜 helper。

它基于仓库内的 ZoomIt 上游副本做最小集成，目标不是重写 ZoomIt，而是复用它现有的放大和标注能力，并把 PlotKityCat 的接入面控制在很薄的一层。

## 设计边界

- helper 是独立 `exe`，不嵌入 PlotKityCat 主进程
- PlotKityCat 只负责在放映开始时启动 helper，放映结束时停止 helper
- helper 侧尽量只增加放映模式相关入口，不扩散到主程序业务层
- 上游能力优先复用，不在 Go 或前端重写放大/画笔逻辑

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
