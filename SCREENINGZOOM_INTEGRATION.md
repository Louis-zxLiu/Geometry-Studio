# PlotKityCat ScreeningZoom 集成说明

## 目标

把 ZoomIt 作为独立 helper 引入 PlotKityCat 放映模式，并在不重写其核心能力的前提下补齐主程序接入口。

本次集成不重写 ZoomIt 的缩放、画笔、Esc 退出、输入映射逻辑。PlotKityCat 只负责：

- 在放映模式期间启动 helper
- 把当前目标窗口 `targetHwnd` 传给 helper
- 在需要时把框选得到的区域 `sourceRect` 传给 helper

helper 负责：

- 复用 ZoomIt 现有放大/Live Zoom/画笔/输入映射能力
- 新增右键拖拽框选放大
- 保留最小右键菜单：`Zoom / Draw / Exit`

## 明确不做

- 不把 ZoomIt 整体嵌入 PlotKityCat 主进程
- 不在 PlotKityCat 里重写一套放大镜逻辑
- 不在第一阶段主动删除录屏、GIF、摄像头、OCR、倒计时、DemoType、PowerToys 设置面板相关能力
- 不让一个场景窗口绑定一个 helper 进程
- 不因为 helper 缺失或异常而阻断原有放映流程

## 业务规则

1. helper 只在放映会话期间工作。
2. 一个放映会话只保留一个 helper 进程。
3. helper 不是窗口池管理器。PlotKityCat 只把“当前目标窗口”和“可选源区域”告诉它。
4. `targetHwnd` 采用“两阶段”传递：
   - 启动 helper 时传初始值
   - 放映切页或目标窗口变化时，再通过桥接命令更新
5. `sourceRect` 统一使用屏幕绝对坐标。
6. 框选行为以当前目标窗口为语义目标；如果底层拿到的是屏幕坐标，helper 内部负责裁剪到目标窗口可用区域。
7. `Esc` 语义保持分层退出：
   - 先退出画笔
   - 再退出 zoom
   - 最后回到原有放映流程
8. 右键短按弹出原生菜单；右键拖拽直接完成框选并进入 zoom。
9. PlotKityCat 不新增复杂前端交互，不新增新的放映业务状态。
10. helper 不可用时，PlotKityCat 继续正常放映，只记录诊断日志。

## 模块边界

### PlotKityCat 主程序

负责：

- 发现当前放映窗口 `HWND`
- 启动/停止 helper
- 把 `targetHwnd` 和后续控制命令发给 helper
- 处理 helper 缺席、崩溃、通信失败时的降级

不负责：

- 缩放算法
- 鼠标输入变换
- 画笔绘制
- 区域放大后的渲染

### ScreeningZoom Helper

负责：

- 基于 ZoomIt 现有能力完成渲染和交互
- 接收 `targetHwnd`
- 接收 `sourceRect`
- 执行右键框选、Zoom、Draw、Exit

不负责：

- 放映场景调度
- 场景池
- Python 窗口发现
- PlotKityCat 业务状态持久化

## 仓库结构

为了避免污染现有功能，新增目录独立放置：

- `internal/screeningzoom/`
  - helper 进程管理
  - helper 协议定义
  - helper 路径发现
- `internal/screeningzoombridge/`
  - PlotKityCat 放映生命周期到 helper 的桥接层
- `thirdparty/screeningzoom/`
  - 外部 helper 的来源说明、集成约束、期望输出位置

现有 `internal/screening/` 只允许增加极薄的回调接线，不写 helper 逻辑。

## Go 桥接层设计

### 目标

让 `screening` 不直接依赖具体 helper 实现。

### 方案

定义独立桥接层：

- `screening` 只发出两个信号：
  - 当前展示目标窗口变了
  - 放映结束了
- `screeningzoombridge` 订阅这些信号
- `screeningzoom` 负责 helper 进程与协议

依赖方向：

`screening -> callbacks -> screeningzoombridge -> screeningzoom`

反向依赖禁止出现：

- `screening` 不能 import `thirdparty/screeningzoom`
- `screening` 不能知道 helper 命令行细节
- `screening` 不能直接写 helper 协议

## helper 协议

第一版只保留最小命令集，采用 stdin JSON lines 即可：

- `set-target`
  - 更新当前 `targetHwnd`
- `set-source-rect`
  - 更新当前放大源区域
- `exit`
  - 请求 helper 退出

建议消息格式：

```json
{"type":"set-target","targetHwnd":123456}
{"type":"set-source-rect","rect":{"left":100,"top":100,"right":800,"bottom":600}}
{"type":"exit"}
```

## helper 启动策略

默认查找顺序：

1. `resources/screeningzoom/screeningzoom-helper.exe`
2. `thirdparty/screeningzoom/bin/screeningzoom-helper.exe`

这样可以同时覆盖：

- 打包后运行
- 仓库内开发运行

## ZoomIt 侧改动范围

允许改：

- 增加 `targetHwnd` 启动参数
- 增加 stdin/IPC 控制入口
- 增加 `sourceRect` 设置入口
- 增加右键拖拽框选并直接进入 zoom
- 收缩菜单到 `Zoom / Draw / Exit`

不建议现在就删的文件：

- 先不要大面积物理删除源文件
- 先通过新 helper 工程只编译需要的那部分
- 等 helper 稳定后，再决定是否从副本中继续清理

原因：

- ZoomIt 核心高度集中在 `Zoomit.cpp`
- 现在直接“删代码”更容易删坏条件分支和消息流程
- 第一阶段应该先做“裁剪编译路径”，不是“全仓硬删文件”

## 风险边界

1. helper 缺失：放映继续，记录日志。
2. helper 启动失败：放映继续，记录日志。
3. helper 在运行中退出：放映继续，提示轻量错误或日志。
4. `targetHwnd` 失效：helper 忽略本次 zoom 请求，等待下一次目标更新。
5. `sourceRect` 越界：helper 内部裁剪，不把错误抛回放映主流程。

## 第一阶段实施范围

本仓库第一阶段只做：

- 新增独立 `screeningzoom` Go 模块
- 新增 `screeningzoombridge` 桥接层
- 在放映窗口切换时把 `targetHwnd` 发给 helper
- 在放映结束时关闭 helper
- 约定 helper 路径和 JSON 协议

本阶段不做：

- PlotKityCat 前端新增按钮或复杂 UI
- 在主程序中直接处理框选
- 在 Go 侧实现 Zoom 渲染
