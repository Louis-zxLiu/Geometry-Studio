# Geometry Studio 分发说明

## 现在的 exe 还依赖本机环境吗

单独的 `GeometryStudio.exe` 不是完整发行物。

它已经内嵌了 Go 后端和前端 `frontend/dist`，所以运行时不需要目标电脑安装 Go、Node.js、npm、Wails 或开发依赖。

几何绘图和 agent 工作流也不需要目标电脑安装系统 Python，但前提是 exe 同级目录里带上项目的便携 runtime 资源：

```text
GeometryStudio.exe
resources/runtime/runtime.7z
resources/runtime/7zip/7za.exe
resources/runtime/7zip/7za.dll
```

首次启动时，应用会把 `resources/runtime/runtime.7z` 解压成同级的 `runtime/` 目录。正确的 release runtime 是 Python embeddable 形态，解压后应包含 `runtime/python.exe`、`runtime/python312.zip` 和 `runtime/Lib/site-packages/`；不要用普通 venv 打包，因为 venv 的 `pyvenv.cfg` 可能记录构建机上的 Python 路径。

仍然需要注意两类外部条件：

- Windows WebView2 Runtime：Wails 应用依赖 WebView2。Win11 和多数 Win10 机器通常已经有；一键便携构建脚本默认用 `-WebView2Strategy embed`，会把 WebView2 安装引导嵌入 exe。
- AI 网络与配置：AI 功能仍需要网络访问和 API/subscription 配置。

## 推荐分发方式：GitHub Releases 上传便携 zip

不要只上传根目录的 `GeometryStudio.exe`。应该上传完整 zip：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-portable-release.ps1
```

生成结果：

```text
build/release/GeometryStudio-v<version>.zip
build/release/GeometryStudio-v<version>.zip.sha256
```

把 `GeometryStudio-v<version>.zip` 上传到 GitHub Releases。用户下载后整包解压，再双击 `GeometryStudio.exe` 即可。

默认便携包不包含本地 `Scripts/` 工作区数据，避免把开发机上的测试场景一起发出去。如果确实要把样例脚本随包发布，构建时显式加 `-IncludeScripts`。

如果希望把 WebView2 安装引导嵌进 exe：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-portable-release.ps1 -WebView2Strategy embed
```

如果 runtime 包需要重新生成：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-portable-release.ps1 -RefreshRuntimeArchive -TrimRuntimeArchive
```

如果要从零重建 runtime：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-portable-release.ps1 -RecreateRuntime -TrimRuntimeArchive
```

也可以只重建 portable runtime 包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\prepare-geometry-runtime.ps1 -RuntimeKind portable -Recreate -CreateArchive -TrimArchiveForRelease
```

打包脚本会校验 `resources/runtime/runtime.7z`：它必须包含根目录 `python.exe` 和 `pythonXY.zip`，并且不能包含 `pyvenv.cfg`。校验失败时，需要先重建 portable runtime。

## 为什么不建议直接把 exe 和 runtime 提交到普通 Git 仓库

当前 `.gitignore` 会忽略 `*.exe`、`*.dll`、`*.zip` 和 `resources/runtime/runtime.7z`。更重要的是，`runtime.7z` 当前约 112 MB，已经超过 GitHub 普通单文件 100 MB 限制。

如果一定要让源码仓库 clone/download 后直接包含二进制，需要使用 Git LFS，并在 GitHub 仓库设置里确认源码 archive 会包含 LFS 对象。但这会让仓库变重，也容易让用户拿到 LFS pointer 而不是实际文件。

所以更稳的方案是：

1. 源码仓库保存代码和打包脚本。
2. GitHub Releases 保存 `GeometryStudio-v<version>.zip`。
3. README 的下载入口指向 Releases，而不是让用户 clone 仓库后找 exe。
