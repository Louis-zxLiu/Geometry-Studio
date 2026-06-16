# ZoomIt — 屏幕放大、标注与录屏工具

本仓库是 **Microsoft PowerToys** 中 ZoomIt 模块的源代码，源自 Mark Russinovich 的 Sysinternals 经典工具。

> **源码来源**: https://github.com/microsoft/PowerToys/tree/main/src/modules/ZoomIt  
> **许可证**: MIT License

---

## 项目结构

```
ZoomIt/
├── ZoomIt/                          # 主程序 (PowerToys.ZoomIt.exe)
│   ├── Zoomit.cpp                   # 核心逻辑 ~12k 行
│   ├── ZoomIt.h                     # 全局定义、常量、热键
│   ├── ZoomItSettings.h             # 所有配置项 + 注册表读写表
│   ├── Registry.h                   # 通用注册表读写类
│   ├── DemoType.cpp/.h              # 演示模式：模拟键盘输入脚本
│   ├── SelectRectangle.cpp/.h       # 屏幕区域选择交互
│   ├── Utility.cpp/.h               # 杂项工具函数
│   ├── VersionHelper.cpp/.h         # 版本检测
│   │
│   ├── 录制相关
│   │   ├── GifRecordingSession.cpp/.h       # GIF 录制
│   │   ├── VideoRecordingSession.cpp/.h     # MP4 视频录制（含裁剪UI）
│   │   ├── PanoramaCapture.cpp/.h           # 全景截图（滚动捕捉）
│   │   ├── CaptureFrameWait.cpp/.h          # 帧等待同步
│   │   ├── AudioSampleGenerator.cpp/.h      # 音频采样生成（录制提示音）
│   │   ├── LoopbackCapture.cpp/.h           # 系统音频环回捕捉
│   │   └── NoiseSuppressor.cpp/.h           # 音频降噪封装
│   │
│   ├── 摄像头画中画
│   │   ├── WebcamCapture.cpp/.h             # 摄像头帧捕获
│   │   ├── WebcamPreviewWindow.cpp/.h       # 画中画预览窗口
│   │   ├── WebcamComposite.hlsl             # 合成着色器
│   │   ├── WebcamCompositePS.h / VS.h       # 像素/顶点着色器字节码
│   │   └── selfie_segmentation.onnx         # 人像分割 ONNX 模型
│   │
│   ├── 背景模糊
│   │   ├── BackgroundBlur.cpp/.h            # 背景模糊实现
│   │   ├── BoxBlurCS.h / BoxBlurCS.hlsl     # 盒式模糊计算着色器
│   │
│   ├── rnnoise/                             # RNNoise 音频降噪库
│   │   ├── denoise.c/h                      # 降噪核心
│   │   ├── rnn.c/h / nnet.c/h               # 循环神经网络推理
│   │   ├── kiss_fft.c/h                     # FFT 实现
│   │   ├── pitch.c/h / celt_lpc.c/h         # 音高估计 + LPC 分析
│   │   ├── rnnoise_data.h / _little.c       # 预训练模型权重
│   │   ├── x86/                             # SSE4.1 / AVX2 加速
│   │   └── COPYING                          # BSD 3-Clause 许可证
│   │
│   ├── 资源文件
│   │   ├── ZoomIt.rc / binres.rc / resource.h   # 资源脚本
│   │   ├── appicon.ico / icon1.ico              # 图标
│   │   ├── cursor1.cur / drawingc.cur           # 光标
│   │   ├── Zoomit.exe.manifest                  # 清单文件
│   │   ├── ZoomIt.idc                           # 远程调试配置
│   │   ├── PowerToys/branding.h                 # PowerToys 品牌信息
│   │   ├── makefile                             # NMake 构建入口
│   │   ├── packages.config                      # NuGet 依赖
│   │   └── ZoomIt.vcxproj / .filters            # VS 项目文件
│   │
│   └── pch.cpp / pch.h                          # 预编译头
│
├── ZoomItBreak/                      # 屏幕保护程序 (ZoomItBreak.scr)
│   ├── ZoomItBreakScr.cpp            # 屏幕保护主逻辑
│   ├── BreakTimer.cpp/.h             # 休息计时器
│   ├── ZoomItBreak.rc / .manifest    # 资源 + 清单
│   └── ZoomItBreak.vcxproj / .filters
│
├── ZoomItModuleInterface/            # PowerToys 模块接口 DLL
│   ├── dllmain.cpp                   # DLL 入口, COM 注册/注销
│   ├── trace.cpp/.h                  # ETW 事件追踪
│   ├── pch.cpp / pch.h               # 预编译头
│   └── ZoomItModuleInterface.vcxproj / .filters / .rc
│
└── ZoomItSettingsInterop/            # WinRT 设置互操作 DLL
    ├── ZoomItSettings.cpp/.h/.idl    # WinRT 组件定义
    ├── ZoomItSettingsInterop.def     # DLL 导出定义
    ├── PropertySheet.props           # 属性配置
    └── ZoomItSettingsInterop.vcxproj / .filters / .rc
```

---

## 编译产物

| 项目 | 类型 | 输出 | 说明 |
|------|------|------|------|
| **ZoomIt** | EXE | `PowerToys.ZoomIt.exe` | 主程序——放大、绘图、计时、录制、截图等全部功能 |
| **ZoomItBreak** | SCR | `ZoomItBreak.scr` (Win32) / `ZoomItBreak64.scr` (x64) | 休息提醒屏幕保护程序（本质是重命名的 .exe） |
| **ZoomItModuleInterface** | DLL | `PowerToys.ZoomItModuleInterface.dll` | PowerToys 插件接口，负责 COM 注册/注销 |
| **ZoomItSettingsInterop** | DLL | `PowerToys.ZoomItSettingsInterop.dll` | WinRT 组件，供 PowerToys 设置页读写配置 |

---

## 核心功能

### 1. 屏幕放大 (Zoom)
- 热键全局激活，实时放大屏幕区域
- 缩放级别 1×–32×，支持平滑过渡和实时缩放（Live Zoom）
- 支持 XBox 手柄模拟鼠标操作

### 2. 屏幕绘图 (Draw)
- 在放大画面上自由绘制（红、绿、蓝、橙、黄、粉、模糊笔）
- 可调笔刷宽度，支持直线/矩形/椭圆/箭头等形状
- 撤销/重做，支持文字输入（可调字体、字号）

### 3. 休息倒计时 (Break)
- 全屏倒计时提醒，支持自定义超时时间
- 可配置背景图片/颜色、透明度、位置
- 支持播放提示音、锁定工作站

### 4. 演示模式 (DemoType)
- 从脚本文件自动模拟键盘输入，适合演讲时逐步展示代码

### 5. 屏幕录制
- **GIF 录制**：输出为 GIF 动画
- **MP4 录制**：包含视频裁剪/编辑界面，支持暂停
- **全景截图**：滚动窗口长截图

### 6. 摄像头画中画 (Webcam Overlay)
- 录制时叠加摄像头画面
- 可调位置（四角）、大小、形状（方形/圆角/圆形）
- **背景模糊/替换**：基于 ONNX 人像分割模型 + DirectCompute 模糊
- 支持亮度调节

### 7. 音频功能
- 系统音频环回捕捉（LoopbackCapture）
- 麦克风录制（单声道混音）
- **RNNoise 神经网络降噪**（含 SSE4.1/AVX2 加速）

### 8. 截图
- 区域截图（Snip）、全景截图、OCR 文字识别截图
- 截图可保存或复制到剪贴板

---

## 关键编译开关

### `__ZOOMIT_POWERTOYS__`

代码中使用此宏区分两种构建模式：

| 状态 | 含义 | 依赖 |
|------|------|------|
| **已定义**（默认） | PowerToys 集成版 | 需要 PowerToys 公共库（`common/logger`, `common/Telemetry`, `common/utils` 等） |
| **未定义** | 独立版（经典 Sysinternals 模式） | 纯 Win32，无外部依赖 |

差异行为：
- 🟢 独立版：启动时自动显示设置对话框，使用注册表 `HKCU\Software\Sysinternals\ZoomIt` 存储配置
- 🔵 PowerToys 版：静默启动，通过 PowerToys 设置页管理，启用 ETW 追踪、日志、GPO 策略

### 其他宏
| 宏 | 说明 |
|----|------|
| `__ZOOMIT_SCREENSAVER__` | ZoomItBreak 屏幕保护版本 |
| `_WIN64` | 32/64 位自动切换（32 位版自动启动 64 位子进程） |

---

## 构建说明

### 前置条件
- **Visual Studio 2022**（v143/v145 工具集）
- **Windows SDK 10.0.26100.0** 或更新
- **NuGet 包**（自动还原）：
  - `Microsoft.Windows.CppWinRT` (2.0.250303.1)
  - `Microsoft.Windows.ImplementationLibrary` (1.0.260126.7)
  - `robmikh.common` (0.0.23-beta)

### 在 PowerToys 仓库内构建
```cmd
# 从 PowerToys 根目录
msbuild src\modules\ZoomIt\ZoomIt\ZoomIt.vcxproj /p:Configuration=Release /p:Platform=x64
```

### 构建立即独立版
要去掉 PowerToys 依赖编译独立版，需要：
1. 在 `.vcxproj` 中删除或注释掉 `ProjectReference` 到公共库的三行
2. 删除预处理器定义中的 `__ZOOMIT_POWERTOYS__`
3. 由于所有 PowerToys 代码都在 `#ifdef` 块中，删掉宏即可跳过所有依赖

---

## 数据来源与致谢

- **RNNoise** © 2017 Mozilla Corporation — [github.com/xiph/rnnoise](https://github.com/xiph/rnnoise)（BSD 3-Clause）
- **selfie_segmentation.onnx** — MediaPipe 自拍人像分割模型（Apache 2.0）
- 原作者 **Mark Russinovich** © Sysinternals
- 本版本由 Microsoft PowerToys 团队维护并集成到 PowerToys 中
