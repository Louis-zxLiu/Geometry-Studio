# ScreeningZoom Helper Project

这个目录只承载 `screeningzoom-helper.exe` 的独立 Visual Studio 工程。

## 目录结构

- `ScreeningZoomHelper.vcxproj`
  - helper 工程入口
- `shims/`
  - 本地兼容层
  - 用来吸收 helper 独立构建时缺失的基础依赖

## 原则

- 不反向污染上游 `ZoomIt.vcxproj`
- 不把 PlotKityCat 主程序逻辑塞进工程配置
- helper 新增构建依赖优先收敛在这里

## 构建

```powershell
.\tools\screeningzoom\build-helper.ps1 -Configuration Release
```

完整说明见上层目录的 [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md)。
