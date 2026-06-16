# ScreeningZoom Developer Guide

这份文档说明 `ScreeningZoom` 在 PlotKityCat 仓库中的定位、开发方式和边界约束。

## 1. 它是什么

`ScreeningZoom` 是一个独立 helper，可执行文件名固定为 `screeningzoom-helper.exe`。

它的职责很窄：

- 放映开始时被 PlotKityCat 启动
- 放映结束时被 PlotKityCat 停止
- 在 helper 内部复用 ZoomIt 的放大和画笔能力
- 通过右键菜单暴露放映时需要的几个动作


## 2. 运行链路

当前链路很薄：

1. PlotKityCat 进入放映
2. Go 侧调用 `internal/screeningzoom/service.go`
3. 启动 `screeningzoom-helper.exe --plotkitycat`
4. helper 在内部开启 ScreeningZoom 分支逻辑
5. 放映结束时 Go 侧直接结束 helper 进程


## 3. 仓库中的关键位置

- `internal/screeningzoom/service.go`
  - Go 侧最薄启动/停止入口
- `internal/paths/paths.go`
  - helper 路径解析，优先 `resources/`，其次 `thirdparty/.../bin/`
- `thirdparty/screeningzoom/upstream/ZoomIt/Zoomit.cpp`
  - helper 的主要行为改动都集中在这里
- `thirdparty/screeningzoom/upstream/ZoomIt/ZoomIt.h`
  - 自定义消息和常量
- `thirdparty/screeningzoom/upstream/ZoomIt/pch.h`
  - 需要的头文件补充
- `thirdparty/screeningzoom/helper/ScreeningZoomHelper.vcxproj`
  - 独立 helper 工程
- `tools/screeningzoom/build-helper.ps1`
  - 构建 helper
- `tools/screeningzoom/publish-helper.ps1`
  - 发布 helper 到开发态与打包态目录

## 4. 现在已经定下来的边界

- 不在 Go 层新增复杂控制协议
- 不在前端维护 helper 的模式状态
- 不把 PlotKityCat 业务逻辑塞进 ZoomIt 工程文件
- 不为了一个交互去重写 ZoomIt 原生放大/画笔路径
- 优先复用 ZoomIt 现有消息、热键和窗口过程

如果后续要加功能，优先顺序应当是：

1. 先找 ZoomIt 原生入口
2. 找不到，再补一层很薄的 helper 内桥接
3. 最后才考虑扩散到 Go 或前端

## 5. 当前放映模式语义

右键菜单目前是 4 个动作：

- `进入放大视角`
- `退出放大视角`
- `进入画笔`
- `退出画笔`

约束：

- 用户 `Esc` 仍保留给 PlotKityCat 的结束放映语义
- helper 内部若需要退出模式，走内部入口，不抢用户全局 `Esc`
- Live Zoom 的缩放层级已经改为更细的多档位

## 6. 如何构建

前提：

- Windows
- Visual Studio Build Tools / Visual Studio 2022
- MSBuild 可用

命令：

```powershell
.\tools\screeningzoom\build-and-publish-helper.ps1 -Configuration Release
```

这会做两件事：

- 编译 `thirdparty/screeningzoom/helper/ScreeningZoomHelper.vcxproj`
- 把产物同步到：
  - `thirdparty/screeningzoom/bin/screeningzoom-helper.exe`
  - `resources/screeningzoom/screeningzoom-helper.exe`

## 7. 开发时该改哪里

如果是放映交互逻辑：

- 优先改 `thirdparty/screeningzoom/upstream/ZoomIt/Zoomit.cpp`

如果是 helper 构建或依赖问题：

- 改 `thirdparty/screeningzoom/helper/`
- 改 `tools/screeningzoom/`

如果只是 PlotKityCat 如何启动 helper：

- 改 `internal/screeningzoom/service.go`
- 必要时改 `internal/paths/paths.go`

边界约束：

- 不把 helper 状态透传到前端
- 改动收敛在少数必要层，不分散到多处

## 8. 调试建议

- helper 的标准输出可直接用来观察放映期行为
- 如果改的是右键、滚轮、退出链路，先验证 helper 是否真的收到事件
- 如果改的是放映生命周期，先看 Go 侧是否正确启动/停止 helper

## 9. 提交建议

和 `ScreeningZoom` 相关的提交，尽量按这三类拆：

1. `helper runtime`
   - Go 启停逻辑
   - 路径解析
   - 打包产物接入
2. `helper behavior`
   - `Zoomit.cpp` / `ZoomIt.h` / `pch.h`
   - 右键、退出、滚轮、菜单语义
3. `developer docs`
   - 本目录文档
   - 构建与接手说明

这样回滚和后续维护都会更稳。
