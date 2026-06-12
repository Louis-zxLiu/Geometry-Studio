# 放映模式实施计划

## 目标

为 PlotKityCat 新增一套独立的放映模式，支持：

- 从前端按用户点击顺序选择多个场景进入放映
- 默认当前场景为首选场景
- 进入放映后切换为简化主界面，并由后端接管外部 Matplotlib 窗口
- 后端维护一个默认大小为 3 的场景池
- 翻页时支持 `crossfade` 与 `slide` 两种动画入口
- 普通运行与放映运行互斥

## 设计原则

- `bridge` 统一，域内解耦
- `runner` 继续负责普通单场景运行
- 新增 `screening` 域服务负责放映会话、场景池、翻页和互斥控制
- 新增 `windowctrl` 包负责 Win32 窗口查找、样式、显示层级和动画
- 前端新增 `screening` feature，不将放映态混入现有脚本编辑状态机

## 前端改造

### 新增文件

- `frontend/src/components/ScreeningDialog.vue`
- `frontend/src/features/screening/model/useScreeningWorkspace.ts`
- `frontend/src/features/screening/services/screeningBridgeCompat.ts`
- `frontend/src/styles/components/screening-dialog.css`

### 修改文件

- `frontend/src/components/TopBar.vue`
- `frontend/src/App.vue`
- `frontend/src/features/plot/model/usePlotWorkspace.ts`
- `frontend/src/main.ts`

### 前端职责

- 弹窗选择放映顺序
- 至少保留 1 个已选场景
- 默认当前场景优先入选
- 调用 `StartScreening / NextScreeningPage / PreviousScreeningPage / StopScreening`
- 订阅 `screening:state` 事件，同步主界面的放映态
- 放映态隐藏侧边栏与顶部编辑控件，保留退出入口

## 后端改造

### 新增文件

- `internal/screening/types.go`
- `internal/screening/process.go`
- `internal/screening/service.go`
- `internal/windowctrl/windows.go`
- `internal/windowctrl/windows_stub.go`
- `internal/bridge/screening.go`

### 修改文件

- `internal/bridge/app.go`
- `internal/bridge/models.go`
- `internal/bridge/events.go`
- `internal/runner/runner.go`

### 后端职责

- 放映会话状态管理
- 普通运行与放映运行互斥
- 建立、更新、释放场景池
- 启动多个 Python 场景进程
- 接收 Matplotlib 双击事件，触发前后翻页
- 接收 Esc 退出事件，停止放映
- 在 Windows 上查找对应窗口并做样式调整

## Bridge 接口

- `StartScreening(request ScreeningStartRequest) (ScreeningSessionState, error)`
- `NextScreeningPage() (ScreeningSessionState, error)`
- `PreviousScreeningPage() (ScreeningSessionState, error)`
- `StopScreening() (ScreeningStopResult, error)`
- `GetScreeningState() (ScreeningSessionState, error)`

## 核心函数落点

1. 建立 `screen pool`
   - `internal/screening/service.go`
   - `createPoolLocked`

2. 释放普通运行占用权并建立 pool
   - `internal/screening/service.go`
   - `Start`

3. 更新 pool，从 `123 -> 234`
   - `internal/screening/service.go`
   - `reconcilePoolLocked`

4. 杀窗口函数
   - `internal/windowctrl/windows.go`
   - `CloseWindow`

5. 隐藏窗口函数
   - `internal/windowctrl/windows.go`
   - `HideWindow`

6. 最大化窗口
   - `internal/windowctrl/windows.go`
   - `MaximizeWindow`

7. 找窗口函数
   - `internal/windowctrl/windows.go`
   - `FindWindowByPID`

8. 排序 z-order
   - `internal/windowctrl/windows.go`
   - `BringWindowToFront`

9. 去除顶栏函数
   - `internal/windowctrl/windows.go`
   - `StripWindowFrame`

10. 前后端 bridge 结构体
   - `internal/bridge/models.go`

## 实施顺序

1. 落地 `screening` 与 `windowctrl` 后端骨架
2. 扩展 bridge model 与 bridge methods
3. 扩展前端 bridge compat
4. 实现放映弹窗与顺序选择
5. 实现放映态 UI 与退出入口
6. 编译验证

## 当前 MVP 范围

- 支持按顺序启动放映
- 支持默认池大小 3
- 支持双击左右半区翻页
- 支持 Esc 退出放映
- 支持 `crossfade` / `slide-left`
- 主界面进入放映态
- Windows 窗口控制优先实现，其他平台保底 no-op

## 二期可扩展项

- 放映池大小前端配置
- 多显示器定向放映
- 更细腻的颜色融合动画
- 放映顺序持久化
- 放映控制条悬浮层
