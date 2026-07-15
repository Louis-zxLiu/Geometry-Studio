# Geometry Studio

> Geometry Studio 是一个面向几何题解题、教学证明和可视化演示的 Windows 桌面工作台：支持图片或文本输入题目，通过多 agent 工作流完成题目解析、教师复核、构图、Matplotlib 代码生成、中文证明和 Markdown + MathJax 笔记。

适合数学教师、竞赛教练、几何题整理者、解题视频制作者，以及需要把几何题快速整理成“可运行图形 + 中文证明笔记”的用户。

最快上手方式：下载 release 包，解压后运行 `GeometryStudio.exe`。

```powershell
# 开发者本地构建
npm install --prefix frontend
npm run build --prefix frontend
go test ./...
wails build -clean
```

## 项目亮点

- 图片/文本双入口：可以上传题图，也可以直接输入没有配图的几何题文字；图片题会交给支持视觉输入的 MLLM 解析题干和图形关系。
- 多 agent 几何解题：题目解析、几何规格整理、教师复核、构造规划、场景生成、Matplotlib 代码生成、教学证明、运行检查、自我修正和发布分阶段执行。
- 用户可感知流程：工作流会暴露当前 agent 正在做什么；几何规格会先进入复核面板，让用户确认题干、结论、对象、条件和构造提示。
- 中文优先输出：面向用户的题干、标签、约束、证明、解答笔记和课堂提问均以中文生成；数学公式走 Markdown + MathJax，不生成完整 LaTeX 文档。
- 可运行几何图：生成的是 Python + Matplotlib 代码，包含可交互控件、中文标注和运行检查；失败时会进入自我修正。
- 三段式工作区：左侧场景/工作区，中间代码区，右侧笔记区；代码区和笔记区宽度可以拖动调整。
- 右侧笔记区支持渲染/源码切换：Markdown 笔记可直接渲染公式，也可切到源码编辑。
- 选区提问：渲染后的文字、公式和代码区选中内容都可以右键提问；关闭提问浮窗后会留下可复用角标，方便继续追问或删除。
- 源码定位：在渲染笔记中选中文字后，可通过右键菜单跳转到对应 Markdown 源码片段。
- 场景包和工作区包：支持导入/导出 `.pkc` 场景包和 `.pkcw` 工作区包，方便分发和迁移。

## 当前核心流程

1. 打开或创建一个场景。
2. 在 AI 设置中配置 OpenAI 兼容接口，图片题建议使用支持视觉输入的多模态模型。
3. 点击顶部的拍照解题入口。
4. 上传题图，或直接粘贴/输入题干文本。
5. 等待 agent 完成题目图文解析和几何规格整理。
6. 在“几何规格复核”面板确认或修改题干、结论、对象、条件和构造提示。
7. 确认后继续生成 Matplotlib 代码和中文教学证明。
8. 在代码区运行/调整生成的图形，在右侧笔记区查看 Markdown + MathJax 解题笔记。
9. 选中证明、公式或代码后右键提问；关闭提问浮窗后，可以通过角标继续追问。

## 多 agent 工作流

几何解题由 `internal/bridge/geometry_agent.py` 中的 LangGraph 工作流驱动，当前节点包括：

```text
problem_vision_parse
geometry_spec_organize
teacher_review
construction_plan
dual_scene_generate
matplotlib_code_generate
teaching_proof_generate
runtime_check
self_correct
publish
```

这些节点分别负责：

- `problem_vision_parse`：解析图片和文本题干，提取可结构化的几何规格。
- `geometry_spec_organize`：把题目信息整理成稳定 ID、对象、约束、结论和构造提示。
- `teacher_review`：暂停工作流，把规格交给用户复核。
- `construction_plan`：规划几何构造和图形表达方式。
- `dual_scene_generate`：生成内部几何场景和证明步骤。
- `matplotlib_code_generate`：生成可运行的 Matplotlib 代码。
- `teaching_proof_generate`：生成中文教学证明和右侧 Markdown 笔记。
- `runtime_check`：运行生成代码，检查是否可执行。
- `self_correct`：根据运行错误修复代码。
- `publish`：把代码和笔记写回当前场景。

## 笔记与提问

右侧笔记区采用 Markdown + MathJax 渲染，不依赖本机 LaTeX 编译器。公式约定：

```markdown
行内公式使用 $AB=AC$

块级公式使用：

$$
\angle ABC = 60^\circ
$$
```

选区交互：

- 渲染态文字和公式可以直接拖选。
- 选中后右键可以提问。
- 选中后右键可以跳转到对应 Markdown 源码。
- 代码区选中代码后也可以右键提问。
- 提问窗口是浮动窗口，可拖动。
- 关闭提问窗口后会生成一个角标；点击角标可复用上下文继续问，点击角标上的关闭按钮可删除。

## 安装与运行

### 使用 release 包

1. 从 GitHub Releases 下载最新的 `GeometryStudio-v*.zip`。
2. 解压到本地目录。
3. 运行 `GeometryStudio.exe`。
4. 首次启动会使用随包携带的 runtime 资源准备 Python 运行环境。

正式入口：

- 仓库地址：https://github.com/Louis-zxLiu/Geometry-Studio
- Releases：https://github.com/Louis-zxLiu/Geometry-Studio/releases

### AI 配置

应用支持自定义 OpenAI 兼容服务和订阅服务两种模式。配置会写入：

```text
config/ai-settings.json
```

图片题需要模型支持多模态图片输入；纯文本几何题可以只使用文本模型，但建议仍使用推理能力较强的模型。

## 开发环境

推荐环境：

- Windows 10/11
- Go 1.22 或更高版本
- Wails v2.10.2
- Node.js + npm
- Python runtime 由项目工具准备或由 release 包携带

确认命令可用：

```powershell
go version
wails version
node --version
npm --version
```

安装前端依赖并构建：

```powershell
npm install --prefix frontend
npm run build --prefix frontend
```

运行 Go 测试：

```powershell
go test ./...
```

本地 Wails 构建：

```powershell
wails build -clean
```

如果只是前端或非导出 Go 接口发生变化，也可以在已有绑定基础上跳过绑定生成：

```powershell
wails build -clean -skipbindings
```

## Runtime 与打包

准备几何解题 runtime：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\prepare-geometry-runtime.ps1
```

版本化构建：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\build-versioned-app.ps1
```

生成 release 包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\package-release.ps1
```

打包脚本会读取 `version.json` 中的 `appVersion`，生成：

```text
build/release/GeometryStudio-v<version>.zip
```

注意：如果 `resources/screeningzoom/zoomit.exe` 不存在，打包脚本会给出 warning，并在不包含该资源的情况下继续打包；这不影响几何解题主流程。

## 项目结构

```text
.
├── frontend/                 # Vue + Vite 前端
│   ├── src/components/        # 通用 UI、代码区、笔记区、提问浮窗
│   ├── src/features/geometry/ # 拍照/文本几何解题 UI 与工作流状态
│   ├── src/features/notebook/ # Markdown 笔记、公式渲染和图片块
│   ├── src/features/plot/     # 主工作区编排
│   └── wailsjs/               # Wails 绑定
├── internal/                  # Go 后端
│   ├── ai/                    # AI 服务、提问、生成、优化、修复
│   ├── aicode/                # AI 代码工作流和补丁应用
│   ├── bridge/                # Wails 暴露接口和几何 agent 桥接
│   ├── files/                 # 场景、笔记、图片资源存储
│   ├── runner/                # Python/Matplotlib 运行器
│   └── workspaces/            # 工作区管理
├── resources/                 # runtime 等发布资源
├── tools/                     # runtime 准备、验证、构建和打包脚本
├── wails.json                 # Wails 配置
├── version.json               # 应用版本
└── runtime.version.json       # runtime 版本说明
```

## 验证

常用验证命令：

```powershell
npm run build --prefix frontend
go test ./...
python -m py_compile internal\bridge\geometry_agent.py
```

如果 runtime 已准备好，可以运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\verify-geometry-studio.ps1
```

## 设计原则

- 拍照解题和文本解题是核心入口，不把图形预览或辅助功能放在主流程前面。
- 多 agent 做什么要让用户看得见，关键中间结果必须能复核。
- 面向用户的内容以中文输出，公式使用 Markdown + MathJax。
- 生成的可视化代码应尽量简洁、可运行、可教学，不堆砌无关图例和说明框。
- 右侧笔记区是证明和提问的主要承载，不提供额外导出按钮，优先保证阅读、渲染和追问体验。

## License

本项目使用仓库中的 `LICENSE` 文件授权。
