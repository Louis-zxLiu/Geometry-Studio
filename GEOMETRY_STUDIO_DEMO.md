# Geometry Studio Hackathon Demo

## 环境准备

```powershell
powershell -ExecutionPolicy Bypass -File tools/prepare-geometry-runtime.ps1
```

PyPI 慢时可以加：

```powershell
powershell -ExecutionPolicy Bypass -File tools/prepare-geometry-runtime.ps1 -IndexUrl https://pypi.tuna.tsinghua.edu.cn/simple
```

如需给另一台机器带走 runtime，再加 `-CreateArchive` 生成 `resources/runtime/runtime.7z`。

## LLM API 放哪里

在应用左侧底部打开 `AI 模型服务商`，选择 `自定义 OpenAI 兼容 API`，填写：

- `URL`：例如 `https://api.openai.com/v1`
- `KEY`：你的 API Key
- `MODEL`：支持图片输入的多模态模型

保存后会写入 `config/ai-settings.json`。代码 AI、设计卡和 `拍照解题` 会共用这份配置。

## 3 分钟演示流程

1. 打开 `build/bin/GeometryStudio-wails.exe` 或开发版 `build/bin/GeometryStudio-dev.exe`。
2. 确认 AI 设置里已经填好多模态模型。
3. 选择空白场景，点击顶部 `拍照解题`。
4. 上传几何题截图，或粘贴网络奥数几何题题干。
5. 复核弹窗出现后检查点、线、圆、条件和结论，确认继续。
6. 应用内 SVG 预览出现，展示 `geometry-scene.json` 的双端场景。
7. 等待 `main.py` 运行检查通过，展示 Matplotlib 交互模型。
8. 打开笔记区，展示自动生成的题面、识别条件、教学证明和课堂提问。
9. 导出 `.pkc` 后重新导入，确认 `main.py`、`note.md`、`geometry-spec.json`、`geometry-scene.json` 和源图仍在。

## 演示话术

- PlotKityCat 原能力保留：代码编辑、AI 绘图、笔记、设计卡、场景包、放映模式。
- Geometry Studio 新增主线：几何截图/题干 -> 多智能体解题 -> 教师复核 -> 双端交互展示 -> 教学证明。
- Python worker 是完整 LangGraph 节点图：题面视觉解析、几何规格整理、教师复核、构造规划、双端场景生成、Matplotlib 代码生成、教学证明生成、运行检查、自我修正、发布。
- 生成结果由同一份 `GeometryScene` 驱动应用内 SVG 预览和 Python 交互模型。

## 内置示例

- 三角形中位线：`resources/geometry-examples/triangle-midline.geometry-scene.json`
- 圆周角：`resources/geometry-examples/circle-angle.geometry-scene.json`

## 网络抓取测试题

已从 IMO 官方 shortlist PDF 抓取 2020 年几何题：

- JSON：`resources/geometry-examples/crawled/imo-shortlist-geometry.json`
- Markdown：`resources/geometry-examples/crawled/imo-shortlist-geometry.md`
- 来源 PDF：`resources/geometry-examples/crawled/pdf/IMO2020SL.pdf`
- 原始 URL：`https://www.imo-official.org/problems/IMO2020SL.pdf`

重新抓取：

```powershell
runtime\Scripts\python.exe tools\crawl-olympiad-geometry.py --years 2020
```

演示时建议先复制 `IMO 2020 Shortlist G1` 或 `G2` 的题干到 `拍照解题`，它们对象清晰，适合展示规格复核、SVG 预览、Matplotlib 交互模型和教学证明。
