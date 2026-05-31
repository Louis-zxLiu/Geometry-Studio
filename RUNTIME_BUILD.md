# PlotKityCat Runtime Build

## 目标

这份文档描述两件事：

- 如何给别人分发现成的 Python runtime
- 如何从零重建 `resources/runtime/runtime.zip`

本项目的 runtime 是发布制品，不是源码仓库资产。

结论先说清楚：

- `resources/runtime/runtime.zip` 默认不提交到 Git
- 仓库只跟踪 runtime 构建脚本、版本元数据和第三方补丁源码
- 现成 runtime 应通过 GitHub Release asset、对象存储或内部制品库分发

## 仓库里有什么

仓库中与 runtime 相关的内容：

- `runtime.version.json`
- `tools/prepare-runtime.ps1`
- `tools/extract_winpython.py`
- `thirdparty/matplotlib_surface_fastpath/`
- `resources/runtime/.gitkeep`

仓库中默认不会跟踪：

- `resources/runtime/runtime.zip`
- `runtime/`
- `runtime.tmp/`

## 给别人交付现成 runtime

如果只是让接手者继续打包发布，不要求他从零重建 runtime，最简单的交付方式是：

1. 把本地现成的 `resources/runtime/runtime.zip` 上传为 GitHub Release asset，或放到稳定下载地址
2. 告诉接手者把该文件放回：

```text
resources/runtime/runtime.zip
```

3. 接手者即可继续运行：

```powershell
.\tools\build-versioned-app.ps1
.\tools\package-release.ps1
.\tools\prepare-update-release.ps1
```

## 从零重建 runtime

### 1. 前置条件

- Windows
- PowerShell 5.1+ 或 PowerShell 7+
- 一个可用的 WinPython runtime 目录，版本需与 `runtime.version.json` 一致
- 如需从 WinPython 安装包提取目录，需要 Python 环境并安装 `py7zr`

当前仓库记录的目标 runtime 元数据见：

- `runtime.version.json`

当前版本要求：

- distribution: `WinPython`
- distributionVersion: `3.13.11.0 slim`
- pythonVersion: `3.13.11`

### 2. 获取 WinPython runtime 目录

你需要先拿到一个已经解压好的 WinPython 目录，目录内应至少包含：

- `python.exe`
- `Lib/`
- `DLLs/`
- `Lib/site-packages/`

如果你手里只有 WinPython 的 `.exe` 安装包，可用仓库脚本提取其内嵌 7z：

```powershell
python .\tools\extract_winpython.py --exe <WinPython安装包.exe> --archive <临时输出.7z> --dest <解压目标目录>
```

注意：

- 这个脚本依赖 `py7zr`
- 仓库不会自动帮你安装 `py7zr`

### 3. 确认 runtime 版本元数据

打开：

- `runtime.version.json`

确保里面的版本与准备注入的 runtime 实际一致，尤其是：

- `pythonVersion`
- `numpy`
- `matplotlib`
- `scipy`
- `PyQt5`

`tools/prepare-runtime.ps1` 会根据 `pythonVersion` 选择 ABI 对应的扩展文件名，例如：

- `cp313` 对应 `_surface_fastpath.cp313-win_amd64.pyd`

### 4. 注入 PlotKityCat 的 Matplotlib surface fastpath

`tools/prepare-runtime.ps1` 会自动把以下内容注入 runtime：

- `thirdparty/matplotlib_surface_fastpath/src/mpl_surface_fastpath/`
- ABI 匹配的 `_surface_fastpath.cp<abi>-win_amd64.pyd`
- `thirdparty/matplotlib_surface_fastpath/vendor/win-amd64/` 下的 3 个 DLL

这一步不要求接手者自行编译扩展，前提是仓库里已有目标 ABI 的 `.pyd`：

- 当前仓库内已有 `cp312` 和 `cp313` 版本

如果未来升级 Python 小版本但 ABI 发生变化，必须同步补齐匹配的 `.pyd`。

### 5. 生成 runtime.zip

在仓库根目录执行：

```powershell
.\tools\prepare-runtime.ps1 -SourceRuntimeDir <你的WinPython目录>
```

执行结果：

- 生成 `resources/runtime/runtime.zip`
- staging 目录默认使用 `.runtime-pack/`

### 6. 人工验收

至少做这几项检查：

1. 解压生成的 `resources/runtime/runtime.zip`
2. 确认存在：
   `Lib/site-packages/mpl_surface_fastpath/`
3. 确认存在：
   `DLLs/libgomp-1.dll`
   `DLLs/libstdc++-6.dll`
   `DLLs/libgcc_s_seh-1.dll`
4. 确认扩展 ABI 与 `runtime.version.json` 的 `pythonVersion` 一致

## 发布建议

`runtime.zip` 不要放进普通 Git 提交历史。

建议的分发方式：

- GitHub Release assets
- 对象存储
- 私有制品库

推荐约定：

- 每次 runtime 发生变化，都发布到对应版本的 GitHub Release
- 当前使用的资产名是 `runtime.zip`
- 在 release 说明里注明对应的 `runtime.version.json`

当前下载地址格式：

```text
https://github.com/Wing900/PlotKityCat/releases/download/v版本号/runtime.zip
```

当前示例：

```text
https://github.com/Wing900/PlotKityCat/releases/download/v0.0.2.6/runtime.zip
```

## 常见误区

### 误区 1：仓库里应该直接提交 `runtime.zip`

不建议。这个文件体积大、变更频率低、二进制 diff 意义弱，更适合作为发布制品管理。

### 误区 2：只要有 `prepare-runtime.ps1`，别人就一定能重建 runtime

不对。别人还需要：

- 正确版本的 WinPython 源目录
- 与 `pythonVersion` 匹配的 fastpath `.pyd`
- 明确的分发和验收规则

### 误区 3：运行时依赖开发者本机 DLL 路径

不应该。runtime 必须只依赖它自身携带的 `DLLs/` 和包目录内容。
