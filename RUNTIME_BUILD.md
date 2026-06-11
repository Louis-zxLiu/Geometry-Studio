# PlotKityCat Runtime Build

## 目标

这份文档只描述两件事：

- 如何分发现成的 Python runtime
- 如何从零重建 `resources/runtime/runtime.7z`

当前项目不再注入任何 Matplotlib C++ fastpath 补丁，runtime 仅使用原生 Python 包内容。

## 仓库约定

仓库中与 runtime 相关的内容：

- `runtime.version.json`
- `tools/prepare-runtime.ps1`
- `tools/extract_winpython.py`
- `resources/runtime/.gitkeep`

仓库中默认不会跟踪：

- `resources/runtime/runtime.7z`
- `runtime/`
- `runtime.tmp/`

## 给别人交付现成 runtime

如果只是继续打包发布，不要求从零重建 runtime，最简单的交付方式是：

1. 把本地现成的 `resources/runtime/runtime.7z` 上传为 GitHub Release asset，或放到稳定下载地址
2. 让接手者把该文件放回 `resources/runtime/runtime.7z`
3. 接手者继续执行：

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

当前 runtime 目标元数据见 `runtime.version.json`。

当前版本要求：

- distribution: `WinPython`
- distributionVersion: `3.13.11.0 slim`
- pythonVersion: `3.13.11`
- matplotlib: `3.11.0rc2`

### 2. 获取 WinPython runtime 目录

你需要先拿到一个已经解压好的 WinPython 目录，目录内至少包含：

- `python.exe`
- `Lib/`
- `DLLs/`
- `Lib/site-packages/`

如果你手里只有 WinPython 的 `.exe` 安装包，可用仓库脚本提取其内嵌 7z：

```powershell
python .\tools\extract_winpython.py --exe <WinPython安装包.exe> --archive <临时输出.7z> --dest <解压目标目录>
```

### 3. 确认 runtime 版本元数据

打开 `runtime.version.json`，确保其中版本和准备打包的 runtime 实际一致，至少核对：

- `pythonVersion`
- `numpy`
- `matplotlib`
- `scipy`
- `PyQt5`

### 4. 生成 runtime.7z

在仓库根目录执行：

```powershell
.\tools\prepare-runtime.ps1 -SourceRuntimeDir <你的WinPython目录>
```

如果要生成当前推荐的瘦身版 runtime，请显式打开裁剪开关：

```powershell
.\tools\prepare-runtime.ps1 `
  -SourceRuntimeDir <你的WinPython目录> `
  -TrimQtForRelease `
  -TrimUnusedPythonPackagesForRelease `
  -TrimOptionalScientificPackagesForRelease `
  -TrimAIPythonPackagesForRelease `
  -TrimQtOptionalUiForRelease `
  -TrimPythonPackagingToolsForRelease `
  -TrimPythonRuntimeClutterForRelease `
  -TrimSuspiciousPythonPackagesForRelease
```

这些开关只作用于 staging 目录 `.runtime-pack/runtime`，不会修改原始 `SourceRuntimeDir`。

执行结果：

- 生成 `resources/runtime/runtime.7z`
- staging 目录默认使用 `.runtime-pack/`
- 默认使用仓库内 `tools/7zip/extra/x64/7za.exe` 生成 7z 压缩包

### 5. 裁剪开关含义

- `-TrimQtForRelease`
  删除 Qt 第一、第二梯队，例如 WebEngine、Designer、Multimedia、Location 及边缘平台插件
- `-TrimUnusedPythonPackagesForRelease`
  删除 Jupyter、IPython、格式化工具、额外绘图库等低风险开发环境包
- `-TrimOptionalScientificPackagesForRelease`
  删除 `cvxpy/scs/osqp/networkx/xarray/seaborn` 等非主链科学计算包
- `-TrimAIPythonPackagesForRelease`
  删除 `langchain/google_genai/huggingface_hub/tiktoken` 等 Python AI 生态包
- `-TrimQtOptionalUiForRelease`
  删除 `qml/`、边缘 Qt 插件，以及除中文外的大部分 Qt 翻译资源
- `-TrimPythonPackagingToolsForRelease`
  删除 `pip/setuptools/wheel/pkg_resources`
- `-TrimPythonRuntimeClutterForRelease`
  删除 `__pycache__`、`testing/tests/examples/docs` 和 `PyQt5/Qt5/qsci`
- `-TrimSuspiciousPythonPackagesForRelease`
  删除 `ipympl/pydantic_ai/github/cryptography/lxml`

### 6. 人工验收

至少做这几项检查：

1. 使用 7-Zip 解压生成的 `resources/runtime/runtime.7z`
2. 确认存在 `Lib/site-packages/matplotlib/`
3. 确认 `runtime.version.json` 中的核心版本与实际包内容一致
4. 确认 runtime 内不包含额外的本地开发补丁或外部编译依赖

## 发布建议

`runtime.7z` 不要放进普通 Git 提交历史。

建议的分发方式：

- GitHub Release assets
- 对象存储
- 私有制品库

推荐约定：

- 每次 runtime 发生变化，都发布到对应版本的 GitHub Release
- 当前使用的资产名是 `runtime.7z`
- 在 release 说明里注明对应的 `runtime.version.json`

当前下载地址格式：

```text
https://github.com/Wing900/PlotKityCat/releases/download/v版本号/runtime.7z
```

当前示例：

```text
https://github.com/Wing900/PlotKityCat/releases/download/v0.0.3.1/runtime.7z
```
