# PlotKityCat Development

## 环境

- Windows
- Go 1.21+
- Node.js 18+
- Wails v2

首次准备：

```powershell
cd frontend
npm install
cd ..
```

开发启动：

```powershell
wails dev
```

## 版本

应用版本唯一来源：

- `version.json`

相关脚本都会默认读取这里的 `appVersion`。

## Runtime

项目运行依赖便携 Python runtime：

- 发布输入：`resources/runtime/runtime.zip`
- 本地展开目录：`runtime/`
- 临时展开目录：`runtime.tmp/`
- 元数据文件：`runtime.version.json`

准备 runtime 压缩包：

```powershell
.\tools\prepare-runtime.ps1 -SourceRuntimeDir <你的 runtime 目录>
```

当前默认应保留的核心库：

- Python 标准库
- numpy
- matplotlib
- scipy
- PyQt5

`runtime.version.json` 应同步填写实际 Python 与核心库版本，不要长期保留 `pending`。

## 打包入口

构建 exe：

```powershell
.\tools\build-versioned-app.ps1
```

生成发布 zip：

```powershell
.\tools\package-release.ps1
```

生成自动更新发布物：

```powershell
.\tools\prepare-update-release.ps1
```

如果要覆盖默认版本：

```powershell
.\tools\build-versioned-app.ps1 -Version 0.0.1
.\tools\package-release.ps1 -Version 0.0.1
.\tools\prepare-update-release.ps1 -Version 0.0.1
```

## 发布前检查

- 确认 `version.json` 版本正确
- 确认 `resources/runtime/runtime.zip` 存在
- 确认 `runtime.version.json` 已填写真实版本
- 确认 `Scripts/` 中示例内容就是准备随包分发的内容
- 确认 `config/` 没有本机账号、缓存、更新状态等脏数据

## 仓库约定

应跟踪：

- `internal/`
- `frontend/`
- `tools/`
- `build/windows/`
- `resources/` 下需要随项目维护的静态资源
- `README.md`
- `DEVELOPMENT.md`
- `version.json`
- `runtime.version.json`

不应跟踪：

- `config/`
- `runtime/`
- `runtime.tmp/`
- `Scripts/`
- `build/bin/`
- `build/release/`
- `build/update/`
- `packaging/`
