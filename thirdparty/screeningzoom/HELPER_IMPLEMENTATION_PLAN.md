# ScreeningZoom Helper 实施清单

以下锚点基于仓库内副本：

- `thirdparty/screeningzoom/upstream/ZoomIt/Zoomit.cpp`
- `thirdparty/screeningzoom/upstream/ZoomIt/ZoomIt.h`
- `thirdparty/screeningzoom/upstream/ZoomIt/resource.h`

## 1. 启动参数入口

位置：

- `Zoomit.cpp:11964` 附近，`wWinMain`
- `Zoomit.cpp:800` 附近，已经有 `GetCommandLine()` 使用

要做的事：

- 解析 `--plotkitycat`
- 解析 `--control-mode=stdin-json`
- 解析 `--target-hwnd=<uint64>`
- 启动时保存初始 `targetHwnd`

## 2. 控制协议入口

建议接入位置：

- `wWinMain` 初始化完成后、主消息循环前

做法：

- 启一个后台线程读 `stdin`
- 每行一条 JSON
- 解析后 `PostMessage` 到主窗口

建议新增消息：

- `WM_USER_SET_TARGET_HWND`
- `WM_USER_SET_SOURCE_RECT`
- `WM_USER_CLEAR_SOURCE_RECT`
- `WM_USER_SCREENINGZOOM_EXIT`

## 3. Source Rect 注入点

现有关键点：

- `Zoomit.cpp:11721` `WM_USER_GET_SOURCE_RECT`
- `Zoomit.cpp:11741` `WM_USER_SET_ZOOM`
- `Zoomit.cpp:11582` `pMagSetFullscreenTransform`
- `Zoomit.cpp:11583` `pMagSetInputTransform`
- `Zoomit.cpp:11777` `pMagSetFullscreenTransform`
- `Zoomit.cpp:11778` `pMagSetInputTransform`

要做的事：

- 外部传入的 rect 直接覆盖 live zoom 当前 source rect
- `clear-source-rect` 后恢复原有自动跟随逻辑

## 4. 右键菜单裁剪

现有入口：

- `Zoomit.cpp:10136` `WM_USER_TRAY_ACTIVATE`
- `Zoomit.cpp:10168` `TrackPopupMenu`

第一版保留：

- `Zoom`
- `Draw`
- `Exit`

第一版删除显示：

- `Record`
- `Break Timer`
- `Options`

## 5. 右键拖拽框选放大

现有能力：

- `Zoomit.cpp:8400` / `8401` / `8442` 一带已有 `SelectRectangle`
- `Zoomit.cpp:8375` / `8712` 一带已有 `g_LiveZoomSourceRect`
- `Zoomit.cpp:11741` 一带已有 `WM_USER_SET_ZOOM`

建议做法：

- 在 zoom/live zoom 状态下区分“右键短按”和“右键拖拽”
- 拖拽时复用 `SelectRectangle`
- 结束后把选中区域写入 `g_LiveZoomSourceRect`
- 再发送一次 `WM_USER_SET_ZOOM`

## 6. targetHwnd 的语义

要求：

- 只保留一个 helper 进程
- helper 不负责场景切换
- PlotKityCat 在切页时更新当前 `targetHwnd`

helper 内部只负责：

- 记录当前目标
- 在需要时按目标窗口范围裁剪 source rect

## 7. 输入映射

现有关键点：

- `Zoomit.cpp:11583`
- `Zoomit.cpp:11778`

结论：

- 不重写输入映射
- 优先沿用 `MagSetInputTransform`
- 如果外部传入 rect，则只替换 source rect，不替换已有映射路径
