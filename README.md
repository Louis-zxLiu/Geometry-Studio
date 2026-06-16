<p align="center">
  <a href="https://github.com/Wingflow/PlotKityCat">
    <img src="logoandapp.svg" alt="PlotKityCat Logo" width="180">
  </a>
</p>

<h1 align="center">PlotKityCat</h1>

<p align="center">
  一款专为数学老师打造的 AI-native 可视化教学工具。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Wails-v2-red?style=flat-square" alt="Wails">
  <img src="https://img.shields.io/badge/Vue-3-4fc08d?style=flat-square" alt="Vue">
  <img src="https://img.shields.io/badge/Go-1.21+-00add8?style=flat-square" alt="Go">
  <img src="https://img.shields.io/badge/Python-3.13+-3776ab?style=flat-square" alt="Python">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License">
</p>

## 简介

PlotKityCat 是一个面向数学教学场景的 AI-native 可视化工具。它基于 Matplotlib 执行绘图代码，支持自然语言生成可视化，并以便携式 runtime 支撑课堂演示与离线分发。

## 视频介绍

https://github.com/user-attachments/assets/df8167a7-d1e9-4f6a-a42d-de15596a4456

## 开发初衷

PlotKityCat 源于对 GGBPuppy 开发过程中 GGB Web API 封闭性的反思。我们转向 Matplotlib，为初高中数学可视化提供 AI-native 方案。

> 那天，我在研究 GGB 的 webapi，AI 总是写下错误的 GGB 代码，让我的另外一个项目 GGBPuppy 很受挫折。我突然发现一个 GGB 的 api 接口不完整，于是以开发者的口吻发了一封信给他们团队，结果收到了他们希望我付钱的要求......好吧，那天晚上关掉它肮脏线条和色彩的窗口，我梦见了 Jobs.....

1. **开源**：好的工具应该像太阳一样，太阳是闭源的吗？
2. **美**：拒绝 GGB 沉闷的色彩与线条。
3. **AI 原生**：通过 AI 直接生成可视化代码，无需老师学习编程。

PlotKityCat 支持优盘便携，旨在让老师将其带入教室、讲台及学生手中。

## 设计原则

1. **开源**：以可审查、可扩展的技术栈承载教学工具。
2. **美感**：避免传统数学软件沉闷的视觉体验。
3. **AI 原生**：让老师通过自然语言驱动可视化生成，而不是先学编程。

## 功能特性

- **AI 绘图**：通过自然语言描述数学概念，由 AI 生成 Matplotlib 绘图代码。
- **笔记系统**：集成 Markdown 与 LaTeX 公式渲染，绑定代码，看到可视化的结果，更看到可视化的设计。
- **便携运行**：依赖便携 Python runtime，适合 U 盘和教室环境分发。
- **场景包导入导出**：支持 `.pck` 场景包的交换与复用。

## 技术栈

- **前端**: Vue 3, TypeScript, Vite
- **后端**: Go, Wails Framework
- **运行时**: WinPython (NumPy, Matplotlib, SciPy, PyQt5)
- **AI 接口**: OpenAI API / 自定义兼容接口

## 快速开始

1. 下载便携版压缩包。
2. 配置 AI 服务商 API Key。
3. 启动应用并新建场景。
4. 在笔记区输入描述后运行可视化或可视化设计。

## 开发入口

- **Windows**
- **Go**: 1.22+
- **Node.js**: 18+
- **Wails**: v2.x

开发启动：

```powershell
cd frontend
npm install
cd ..
wails dev
```

runtime 打包入口：

```powershell
.\tools\prepare-runtime.ps1 -SourceRuntimeDir <你的 runtime 目录>
```

应用打包入口：

```powershell
.\tools\build-versioned-app.ps1
.\tools\package-release.ps1
.\tools\prepare-update-release.ps1
```

## 文档索引

- 开发与构建总说明： [DEVELOPMENT.md](D:/projects/plotkitycat/DEVELOPMENT.md)
- runtime 分发与重建： [RUNTIME_BUILD.md](D:/projects/plotkitycat/RUNTIME_BUILD.md)
- 在线更新与发布： [UPDATE_RELEASE.md](D:/projects/plotkitycat/UPDATE_RELEASE.md)

## 致谢

- [Matplotlib](https://matplotlib.org/): 本项目核心渲染引擎。
- [ManimCat](https://github.com/Wing900/ManimCat): 提供了开发的基础和灵感。
- [ZoomIt (PowerToys)](https://github.com/microsoft/PowerToys/tree/main/src/modules/ZoomIt): 放映模式辅助功能的实现基础。
## 愿景

期待更多的可视化资源可以被开发、开源、开放，打破教育资源长期以来的垄断，让教育越来越清晰、越来越公平。期待有一天能够建立一个 PlotKityCat 交流社区。
