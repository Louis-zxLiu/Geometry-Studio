from __future__ import annotations

import json
import re
import sys
import traceback
from typing import Any, Dict, List, Optional, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ConfigDict, Field


GRAPH_NODES = [
    "problem_vision_parse",
    "geometry_spec_organize",
    "teacher_review",
    "construction_plan",
    "dual_scene_generate",
    "matplotlib_code_generate",
    "teaching_proof_generate",
    "runtime_check",
    "self_correct",
    "publish",
]


MATPLOTLIB_TEXT_SYMBOL_REPLACEMENTS = (
    ("\\u2713", "正确"),
    ("\\U00002713", "正确"),
    ("✓", "正确"),
    ("\\u2714", "通过"),
    ("\\U00002714", "通过"),
    ("✔", "通过"),
    ("\\u2705", "通过"),
    ("\\U00002705", "通过"),
    ("✅", "通过"),
    ("\\u2717", "错误"),
    ("\\U00002717", "错误"),
    ("✗", "错误"),
    ("\\u2718", "错误"),
    ("\\U00002718", "错误"),
    ("✘", "错误"),
    ("\\u274c", "错误"),
    ("\\U0000274C", "错误"),
    ("\\U0000274c", "错误"),
    ("❌", "错误"),
    ("\\u2611", "是"),
    ("\\U00002611", "是"),
    ("☑", "是"),
    ("\\u2612", "否"),
    ("\\U00002612", "否"),
    ("☒", "否"),
    ("\\ufe0f", ""),
    ("\ufe0f", ""),
)


MATHJAX_MARKDOWN_RULES = r"""
输出会直接进入 Geometry Studio 右侧笔记区，由 markdown-it 与 markdown-it-mathjax3 渲染。
请严格遵守：
- 只输出 Markdown 片段，不输出完整 LaTeX 文档。
- 允许使用标题、段落、有序/无序列表、简单表格、粗体，以及 `$...$`、`$$...$$` 公式。
- 禁止使用 `\documentclass`、`\usepackage`、`\begin{document}`、`\end{document}`、TeX 导言区、代码围栏、HTML、Mermaid、SVG。
- 行内短公式使用 `$AB=AC$`，推导链或关键等式使用 `$$...$$`。
- 公式内只放数学符号、字母、数字和 LaTeX 数学命令；中文必须放在公式外。
- 禁止 `\text{中文}`、`$S_{面积}$`、`$\angle A 是直角$` 这类把中文放进数学环境的写法。
- 需要表达中文含义时写成普通中文加公式，例如“阴影面积记为 $S$”，不要写 `$S_{阴影}$`。
- 常用几何符号优先使用 `\angle ABC`、`\triangle ABC`、`\perp`、`\parallel`、`\cong`、`\sim`、`\frac{}`、`^\circ`。
- JSON 字符串中的 LaTeX 反斜杠必须转义，例如 `\\angle ABC`、`\\frac{1}{2}`。
""".strip()


def sanitize_matplotlib_text_symbols(text: str) -> str:
    sanitized = text
    for old, new in MATPLOTLIB_TEXT_SYMBOL_REPLACEMENTS:
        sanitized = sanitized.replace(old, new)
    return sanitized


def sanitize_mathjax_markdown(markdown: str, fallback_heading: str = "") -> str:
    text = (markdown or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    text = strip_wrapping_markdown_fence(text)
    text = strip_latex_document_markup(text)
    text = strip_markdown_fence_markers(text)
    text = normalize_markdown_math_delimiters(text)
    text = sanitize_mathjax_segments(text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if text and fallback_heading and not re.search(r"(?m)^#{1,6}\s+", text):
        text = f"## {fallback_heading}\n\n{text}"
    return text


def strip_wrapping_markdown_fence(text: str) -> str:
    stripped = text.strip()
    while True:
        fenced = re.fullmatch(r"```[^\n`]*\n?(.*?)```", stripped, flags=re.S)
        if not fenced:
            return stripped
        next_text = fenced.group(1).strip()
        if next_text == stripped:
            return stripped
        stripped = next_text


def strip_latex_document_markup(markdown: str) -> str:
    text = markdown
    text = re.sub(r"\\section\*?\{([^{}\n]+)\}", r"## \1", text)
    text = re.sub(r"\\subsection\*?\{([^{}\n]+)\}", r"### \1", text)
    text = re.sub(r"\\subsubsection\*?\{([^{}\n]+)\}", r"#### \1", text)
    text = re.sub(
        r"(?im)^\s*\\(?:documentclass|usepackage|geometry|pagestyle|thispagestyle|title|author|date|maketitle|tableofcontents|newcommand|renewcommand|setlength)\b[^\n]*(?:\n|$)",
        "",
        text,
    )
    text = re.sub(
        r"(?im)^\s*\\(?:begin|end)\{(?:document|proof|solution|abstract|center|flushleft|flushright|enumerate|itemize)\}\s*(?:\n|$)",
        "",
        text,
    )
    text = re.sub(r"(?m)^\s*\\item\s+", "- ", text)
    return text


def strip_markdown_fence_markers(markdown: str) -> str:
    return re.sub(r"(?m)^\s*```[^\n`]*\s*$", "", markdown)


def normalize_markdown_math_delimiters(markdown: str) -> str:
    text = re.sub(
        r"\\\[(.*?)\\\]",
        lambda match: "\n$$\n" + match.group(1).strip() + "\n$$\n",
        markdown,
        flags=re.S,
    )
    return re.sub(
        r"\\\((.*?)\\\)",
        lambda match: "$" + match.group(1).strip() + "$",
        text,
        flags=re.S,
    )


def sanitize_mathjax_segments(markdown: str) -> str:
    placeholders: List[tuple[str, str]] = []

    def replace_display(match: re.Match[str]) -> str:
        body = sanitize_mathjax_body(match.group(1))
        token = f"\u0000DISPLAY_MATH_{len(placeholders)}\u0000"
        if body:
            placeholders.append((token, "$$\n" + body + "\n$$"))
        else:
            placeholders.append((token, ""))
        return token

    text = re.sub(r"\$\$(.*?)\$\$", replace_display, markdown, flags=re.S)

    def replace_inline(match: re.Match[str]) -> str:
        body = sanitize_mathjax_body(match.group(1))
        return f"${body}$" if body else ""

    text = re.sub(r"(?<!\$)\$([^$\n]+?)\$(?!\$)", replace_inline, text)
    for token, value in placeholders:
        text = text.replace(token, value)
    return text


def sanitize_mathjax_body(body: str) -> str:
    text = body.strip()
    text = re.sub(
        r"\\(?:text|mbox)\{([^{}]*)\}",
        lambda match: "" if contains_cjk(match.group(1)) else r"\mathrm{" + match.group(1).strip() + "}",
        text,
    )
    text = re.sub(r"[\u3400-\u9fff\uf900-\ufaff]+", "", text)
    text = re.sub(r"[_^]\{\s*\}", "", text)
    dangling_relation = r"(?:=|<|>|\\(?:le|leq|ge|geq|approx|sim)(?![A-Za-z]))"
    text = re.sub(r"\s*" + dangling_relation + r"\s*$", "", text)
    text = re.sub(r"^\s*" + dangling_relation + r"\s*", "", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def contains_cjk(text: str) -> bool:
    return re.search(r"[\u3400-\u9fff\uf900-\ufaff]", text) is not None


def sanitize_inline_markdown_text(text: str) -> str:
    return sanitize_mathjax_markdown(text).replace("\n", " ").strip()


def sanitize_proof_steps(steps: List[GeometryProofStepModel]) -> List[Dict[str, Any]]:
    sanitized: List[Dict[str, Any]] = []
    for index, step in enumerate(steps, start=1):
        item = step.model_dump()
        item["id"] = str(item.get("id") or f"p{index}").strip() or f"p{index}"
        item["claim"] = sanitize_inline_markdown_text(str(item.get("claim") or ""))
        item["reason"] = sanitize_inline_markdown_text(str(item.get("reason") or ""))
        item["depends"] = [str(dep).strip() for dep in item.get("depends") or [] if str(dep).strip()]
        if item["claim"] or item["reason"]:
            sanitized.append(item)
    return sanitized


def sanitize_classroom_questions(questions: List[str]) -> List[str]:
    sanitized: List[str] = []
    for question in questions:
        text = sanitize_inline_markdown_text(str(question))
        if text:
            sanitized.append(text)
    return sanitized


def sanitize_geometry_spec_markdown(spec: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(spec)
    cleaned["problemText"] = sanitize_mathjax_markdown(str(cleaned.get("problemText") or ""))
    cleaned["goalText"] = sanitize_mathjax_markdown(str(cleaned.get("goalText") or ""))
    cleaned["constructionHints"] = [
        sanitize_inline_markdown_text(str(hint))
        for hint in cleaned.get("constructionHints") or []
        if sanitize_inline_markdown_text(str(hint))
    ]

    entities: List[Dict[str, Any]] = []
    for entity in cleaned.get("entities") or []:
        if not isinstance(entity, dict):
            continue
        next_entity = dict(entity)
        next_entity["label"] = sanitize_inline_markdown_text(str(next_entity.get("label") or ""))
        attributes = next_entity.get("attributes") or {}
        if isinstance(attributes, dict):
            next_entity["attributes"] = {
                str(key): sanitize_inline_markdown_text(str(value))
                for key, value in attributes.items()
            }
        entities.append(next_entity)
    cleaned["entities"] = entities

    constraints: List[Dict[str, Any]] = []
    for constraint in cleaned.get("constraints") or []:
        if not isinstance(constraint, dict):
            continue
        next_constraint = dict(constraint)
        next_constraint["text"] = sanitize_mathjax_markdown(str(next_constraint.get("text") or ""))
        constraints.append(next_constraint)
    cleaned["constraints"] = constraints
    return cleaned


class GeometryEntityModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: str
    label: str
    attributes: Dict[str, str] = Field(default_factory=dict)


class GeometryConstraintModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    args: List[str] = Field(default_factory=list)
    text: str
    confidence: float = Field(ge=0.0, le=1.0)


class GeometrySpecModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    problemText: str
    goalText: str
    entities: List[GeometryEntityModel] = Field(default_factory=list)
    constraints: List[GeometryConstraintModel] = Field(default_factory=list)
    constructionHints: List[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


class GeometryPointModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    x: float
    y: float
    fixed: bool = False


class GeometrySegmentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    from_: str = Field(alias="from")
    to: str
    label: str = ""
    style: str = ""


class GeometryCircleModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    center: str
    radius: float = 0.0
    through: str = ""
    label: str = ""
    style: str = ""


class GeometryPolygonModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    points: List[str] = Field(default_factory=list)
    label: str = ""
    fill: str = ""


class GeometryControlModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    kind: str
    min: float
    max: float
    value: float
    step: float
    target: str = ""
    binding: str = ""


class GeometryMeasurementModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    kind: str
    args: List[str] = Field(default_factory=list)
    value: str = ""


class GeometryAnnotationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    text: str
    x: float
    y: float


class GeometryProofStepModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    claim: str
    reason: str
    depends: List[str] = Field(default_factory=list)


class GeometrySceneModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    version: int = 1
    title: str
    sourceImage: str = ""
    points: List[GeometryPointModel] = Field(default_factory=list)
    segments: List[GeometrySegmentModel] = Field(default_factory=list)
    circles: List[GeometryCircleModel] = Field(default_factory=list)
    polygons: List[GeometryPolygonModel] = Field(default_factory=list)
    controls: List[GeometryControlModel] = Field(default_factory=list)
    measurements: List[GeometryMeasurementModel] = Field(default_factory=list)
    constraints: List[GeometryConstraintModel] = Field(default_factory=list)
    annotations: List[GeometryAnnotationModel] = Field(default_factory=list)
    proofSteps: List[GeometryProofStepModel] = Field(default_factory=list)


class ConstructionPlanModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: str
    teachingFocus: List[str] = Field(default_factory=list)


class CodeResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pythonCode: str


class ProofResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    proofMarkdown: str = Field(
        description=(
            "中文 Markdown 片段，用于右侧笔记区渲染。只允许 Markdown 与 "
            "$...$/$$...$$ MathJax 公式，不得包含完整 LaTeX 文档、TeX 导言区或代码围栏。"
        )
    )
    proofSteps: List[GeometryProofStepModel] = Field(
        default_factory=list,
        description="中文结构化证明步骤，claim 写结论，reason 写理由，depends 写依赖步骤 id。",
    )
    classroomQuestions: List[str] = Field(
        default_factory=list,
        description="中文课堂追问列表，每条问题都应服务于发现关键条件、辅助构造或证明转折。",
    )


class NoteResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    noteMarkdown: str = Field(
        description=(
            "中文课堂笔记 Markdown 片段，用于 markdown-it + markdown-it-mathjax3 渲染。"
            "不得包含完整 LaTeX 文档、TeX 导言区、导出指令或代码围栏。"
        )
    )


class RepairResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pythonCode: str
    repairNotes: List[str] = Field(default_factory=list)


class GeometryState(TypedDict, total=False):
    sessionId: str
    sceneName: str
    imageDataUrl: str
    problemText: str
    currentCode: str
    maxAttempts: int
    settings: Dict[str, str]
    spec: Dict[str, Any]
    reviewedSpec: Dict[str, Any]
    constructionPlan: str
    scene: Dict[str, Any]
    code: str
    proofMarkdown: str
    noteMarkdown: str
    classroomQuestions: List[str]
    diagnostics: List[str]
    attempt: int
    probeResult: Dict[str, Any]
    workflowStatus: str
    errorText: str


def emit(event: Dict[str, Any]) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def read_command() -> Optional[Dict[str, Any]]:
    line = sys.stdin.readline()
    if not line:
        return None
    return json.loads(line)


def normalize_openai_base_url(value: str) -> str:
    base_url = (value or "").strip().rstrip("/")
    suffix = "/chat/completions"
    if base_url.endswith(suffix):
        base_url = base_url[: -len(suffix)]
    return base_url


def model_from_settings(settings: Dict[str, str]) -> ChatOpenAI:
    base_url = normalize_openai_base_url(settings.get("baseUrl", ""))
    api_key = (settings.get("apiKey") or "").strip()
    model = (settings.get("model") or "").strip()
    if not base_url or not api_key or not model:
        raise RuntimeError("Geometry workflow needs baseUrl, apiKey, and model")
    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key,
        model=model,
        temperature=0.2,
        timeout=300,
    )


def response_text(value: Any) -> str:
    content = getattr(value, "content", value)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text))
            else:
                parts.append(str(item))
        return "\n".join(parts).strip()
    return str(content).strip()


def extract_json_object(text: str) -> Dict[str, Any]:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)```", stripped, flags=re.S | re.I)
    if fenced:
        stripped = fenced.group(1).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError as exc:
        if "Invalid \\escape" not in str(exc):
            raise
        return json.loads(escape_invalid_json_string_backslashes(stripped))


def escape_invalid_json_string_backslashes(text: str) -> str:
    result: List[str] = []
    in_string = False
    index = 0
    valid_escapes = {'"', "\\", "/", "b", "f", "n", "r", "t"}

    while index < len(text):
        char = text[index]

        if not in_string:
            result.append(char)
            if char == '"':
                in_string = True
            index += 1
            continue

        if char == '"':
            result.append(char)
            in_string = False
            index += 1
            continue

        if char != "\\":
            result.append(char)
            index += 1
            continue

        if index + 1 >= len(text):
            result.append("\\\\")
            index += 1
            continue

        next_char = text[index + 1]
        if next_char in valid_escapes:
            result.append(char)
            result.append(next_char)
            index += 2
            continue

        if next_char == "u" and is_valid_json_unicode_escape(text[index + 2 : index + 6]):
            result.append(char)
            result.append(next_char)
            index += 2
            continue

        result.append("\\\\")
        index += 1

    return "".join(result)


def is_valid_json_unicode_escape(value: str) -> bool:
    return len(value) == 4 and all(char in "0123456789abcdefABCDEF" for char in value)


def json_chat(
    state: GeometryState,
    schema_model: type[BaseModel],
    system_prompt: str,
    user_prompt: str,
    image_data_url: str = "",
) -> BaseModel:
    schema = json.dumps(schema_model.model_json_schema(), ensure_ascii=False, indent=2)
    full_user_prompt = (
        user_prompt
        + "\n\nReturn JSON only. Escape every backslash inside JSON strings as \\\\, "
        + "especially LaTeX commands such as \\\\angle, \\\\perp, \\\\circ, and \\\\frac. "
        + "It must validate against this JSON Schema:\n"
        + schema
    )
    human_content: Any = full_user_prompt
    if image_data_url:
        human_content = [
            {"type": "text", "text": full_user_prompt},
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ]
    llm = model_from_settings(state["settings"])
    raw = llm.invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_content),
        ]
    )
    payload = extract_json_object(response_text(raw))
    return schema_model.model_validate(payload)


def progress(state: GeometryState, stage: str, message: str) -> None:
    emit(
        {
            "type": "progress",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "stage": stage,
            "message": message,
            "attempt": int(state.get("attempt") or 1),
        }
    )


def problem_vision_parse(state: GeometryState) -> Dict[str, Any]:
    progress(state, "problem_vision_parse", "题目图文解析")
    user = (
        "请从图片和/或题干文本中提取完整几何题。图片可能只是拍摄的题干文字，"
        "也可能包含几何图形、点名、角度、辅助线或条件标注；如果没有图片，"
        "就完全根据文本解析，不要因为缺少配图而失败。"
        "如果图片存在，请使用多模态能力识别题干文字、图中标注和几何关系。"
        "识别所有命名对象、已知条件、几何关系、求证目标和可能的辅助构造。"
        "所有 problemText、goalText、constraints、constructionHints 都使用中文表达；"
        "如果原题不是中文，请翻译为中文并保留关键数学符号、点名和等式。\n\n"
        "所有数学公式都必须使用 Markdown+MathJax 写法：行内公式用 `$...$`，"
        "独立展示公式用 `$$...$$`。不要使用 `\\(...\\)`、`\\[...\\]`、"
        "`\\begin{equation}` 或完整 LaTeX 文档。公式内部不要放中文，中文说明写在公式外。\n\n"
        f"题干文本（可为空）:\n{state.get('problemText', '')}"
    )
    spec = json_chat(
        state,
        GeometrySpecModel,
        "你是几何拍照解题的图文解析 agent，负责把图片/文本输入转成中文几何题规格。",
        user,
        state.get("imageDataUrl", ""),
    )
    return {"spec": sanitize_geometry_spec_markdown(spec.model_dump())}


def geometry_spec_organize(state: GeometryState) -> Dict[str, Any]:
    progress(state, "geometry_spec_organize", "几何规格整理")
    user = (
        "请整理下面的 GeometrySpec，供后续构造、代码生成和中文解答使用。"
        "保持数学含义，使用稳定 ID，让 constraints 引用 entity ID，并把隐含条件显式化。"
        "面向用户的 label、text、problemText、goalText、constructionHints 必须使用中文；"
        "ID 可以保持 ASCII，便于代码引用。\n\n"
        "教师复核弹窗会把 problemText、goalText 和 constraint.text 作为 Markdown+MathJax 预览。"
        "因此所有数学公式必须统一成 `$...$` 或 `$$...$$`："
        "短公式和符号用 `$...$`，较长推导或方程组用 `$$...$$`。"
        "不要输出 `\\(...\\)`、`\\[...\\]`、`\\begin{equation}`、TeX 导言区或完整 LaTeX 文档。"
        "公式内部只放数学符号，不要放中文；例如写“由 $AB=AC$ 可知”，不要写 `$AB=AC \\text{成立}$`。\n\n"
        + json.dumps(state["spec"], ensure_ascii=False, indent=2)
    )
    spec = json_chat(
        state,
        GeometrySpecModel,
        "你是几何规格整理 agent，负责把题目条件整理成中文、结构化、可构造的规格。",
        user,
    )
    return {"spec": sanitize_geometry_spec_markdown(spec.model_dump())}


def teacher_review(state: GeometryState) -> Dict[str, Any]:
    progress(state, "teacher_review", "教师复核")
    emit(
        {
            "type": "review_required",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "spec": state["spec"],
        }
    )
    command = read_command()
    if not command or command.get("type") == "stop":
        emit(
            {
                "type": "interrupted",
                "sessionId": state["sessionId"],
                "sceneName": state["sceneName"],
                "message": "Geometry workflow stopped",
            }
        )
        raise KeyboardInterrupt("Geometry workflow stopped")
    if command.get("type") != "resume_review" or not command.get("spec"):
        raise RuntimeError("Geometry workflow expected resume_review with spec")
    reviewed = sanitize_geometry_spec_markdown(GeometrySpecModel.model_validate(command["spec"]).model_dump())
    return {"reviewedSpec": reviewed}


def construction_plan(state: GeometryState) -> Dict[str, Any]:
    progress(state, "construction_plan", "构造规划")
    spec = state.get("reviewedSpec") or state["spec"]
    user = (
        "请为这道几何题生成简洁的课堂解题构造规划。"
        "同一个 GeometryScene 要同时驱动 Vue/SVG 预览和 Matplotlib/PyQt 代码。"
        "当拖动点或参数控件有助于解释不变量、角度关系、比例关系时，请优先加入。"
        "所有教学重点和构造说明都使用中文。\n\n"
        + json.dumps(spec, ensure_ascii=False, indent=2)
    )
    plan = json_chat(
        state,
        ConstructionPlanModel,
        "你是面向中文课堂的交互几何构造规划 agent。",
        user,
    )
    return {"constructionPlan": plan.plan}


def dual_scene_generate(state: GeometryState) -> Dict[str, Any]:
    progress(state, "dual_scene_generate", "双端场景生成")
    spec = state.get("reviewedSpec") or state["spec"]
    user = (
        "请根据规格和构造规划生成 GeometryScene v1。"
        "使用易读坐标，包含证明所需对象、条件、测量、注释；"
        "如果存在可变化参数，请至少提供一个 control。"
        "title、control.label、measurement.label、annotation.text、constraint.text "
        "以及 proofSteps 中的 claim/reason 都必须是中文。\n\n"
        "GeometrySpec:\n"
        + json.dumps(spec, ensure_ascii=False, indent=2)
        + "\n\nConstruction plan:\n"
        + state.get("constructionPlan", "")
    )
    scene = json_chat(
        state,
        GeometrySceneModel,
        "你是双端几何场景生成 agent，输出中文标注的可交互几何场景。",
        user,
    )
    scene_dict = scene.model_dump(by_alias=True)
    emit(
        {
            "type": "preview_updated",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "scene": scene_dict,
        }
    )
    return {"scene": scene_dict}


def matplotlib_code_generate(state: GeometryState) -> Dict[str, Any]:
    progress(state, "matplotlib_code_generate", "Matplotlib 代码生成")
    spec = state.get("reviewedSpec") or state["spec"]
    user = (
        "请为 Geometry Studio 生成自包含 Python/Matplotlib 代码。"
        "以 GeometryScene 为唯一事实来源。允许导入 math、numpy、sympy、"
        "matplotlib.pyplot、matplotlib.patches、matplotlib.widgets。"
        "代码必须调用 plt.show()，清晰渲染证明所需的点名、关键线段、关键角度和必要测量，"
        "但要保持教学主图克制、干净、可读。"
        "默认不要生成庞大的图例、动态测量清单、结论说明框或多处彩色长注释；"
        "只有当不加图例会造成对象无法区分时，才生成不超过 4 项的短图例，"
        "且优先把点名和关键关系直接标在图中。"
        "每张图最多保留 2 到 3 条关键辅助线、2 到 4 条短注释；"
        "不要把所有 scene.segments、measurements、constraints 都机械地画成可见元素。"
        "如果 scene.controls 存在，只暴露最有教学价值的 1 到 2 个控件；"
        "控件标签必须短，例如“顶角”“位置”“比例”，不要使用长句作为 Slider 标签。"
        "底部控件必须完整显示：使用 fig.subplots_adjust(bottom=0.18~0.28) 或等价布局，"
        "Slider/Button 轴必须留在 figure 内部，不得让中文标签、数值或按钮被窗口边缘裁切；"
        "长说明请放到普通注释或标题中，不要塞进底部控件标签。"
        "所有面向用户的 Matplotlib 文本必须中文，包括图标题、必要图例、坐标轴标签、"
        "点/线/圆注释、Slider/Button/CheckButtons 等控件标签、简短参数说明、测量值说明。"
        "代码变量名可以用英文或拼音，但显示给用户的参数名必须中文，例如“角度”“半径”“比例”“位置”。"
        "生成的代码应尽量短而稳定，避免复杂状态机、过量 artist 列表、复杂动画或多层回调；"
        "如果静态图已经足以解释题意，就不要强行加入交互控件。"
        "请设置中文字体回退，例如 Microsoft YaHei、SimHei、Arial Unicode MS、DejaVu Sans，"
        "并设置 axes.unicode_minus=False。"
        "不要生成对勾、叉号、复选框、emoji 或它们的 Unicode 转义，例如 ✓、✗、✔、✘、✅、❌、☑、☒、\\u2713、\\u2717；"
        "需要表达判断时请使用普通中文“正确”“错误”“通过”“未通过”“是”“否”。"
        "不要把中文放进 MathText/LaTeX 的 $...$ 或 \\text{} 中，中文与数学符号用普通字符串拼接。"
        "不要读取文件、写入文件、启动进程或访问网络。\n\n"
        "GeometrySpec:\n"
        + json.dumps(spec, ensure_ascii=False, indent=2)
        + "\n\nGeometryScene:\n"
        + json.dumps(state["scene"], ensure_ascii=False, indent=2)
        + "\n\nConstruction plan:\n"
        + state.get("constructionPlan", "")
    )
    code = json_chat(
        state,
        CodeResultModel,
        "你是中文几何解题的 Matplotlib 代码生成 agent，尤其注意交互参数和界面标注汉化。",
        user,
    )
    return {"code": sanitize_matplotlib_text_symbols(code.pythonCode.strip())}


def teaching_proof_generate(state: GeometryState) -> Dict[str, Any]:
    progress(state, "teaching_proof_generate", "教学证明生成")
    spec = state.get("reviewedSpec") or state["spec"]
    proof_user = (
        "请为这道几何题生成面向中文课堂的证明与解答。题目可能来自图片识别，也可能只有文本；"
        "请以 GeometrySpec 和教师复核后的内容为事实来源，不要因为缺少配图而拒绝证明。"
        "如果条件不足或图形存在歧义，只能用中文明确写出必要假设，不能编造题目没有给出的条件。"
        "无论原题语言是什么，proofMarkdown、proofSteps、classroomQuestions 都必须使用中文；"
        "若原题不是中文，请在文字说明中翻译为中文，并保留关键点名、等式和几何符号。\n\n"
        "proofMarkdown 的内容要求：\n"
        "- 必须是可直接放入右侧笔记区的中文 Markdown 片段，不是 .tex 文件。\n"
        "- 建议包含 `## 解题思路`、`## 教学证明`、`## 解答` 三个部分。\n"
        "- 先说明已知条件和求证/求解目标之间的关键联系，再给出严谨推导。\n"
        "- 每一步证明都要说清依据，例如全等、相似、圆周角、平行线角关系、中位线、勾股定理、面积关系等。\n"
        "- 最终答案或结论必须单独明确写出，不能只停在推导过程。\n\n"
        "proofSteps 的内容要求：\n"
        "- 每个步骤使用稳定 id，例如 `p1`、`p2`、`p3`。\n"
        "- claim 写中文结论，reason 写中文理由，depends 填依赖步骤 id。\n"
        "- proofSteps 必须与 proofMarkdown 的证明主线一致，不要出现笔记里没有解释的跳步。\n\n"
        "classroomQuestions 的内容要求：\n"
        "- 生成 3 到 5 个中文课堂追问。\n"
        "- 问题要引导学生发现关键条件、辅助线、相似/全等关系或不变量，避免空泛提问。\n\n"
        "右侧笔记渲染规则：\n"
        + MATHJAX_MARKDOWN_RULES
        + "\n\n"
        "GeometrySpec:\n"
        + json.dumps(spec, ensure_ascii=False, indent=2)
        + "\n\nGeometryScene:\n"
        + json.dumps(state["scene"], ensure_ascii=False, indent=2)
    )
    proof = json_chat(
        state,
        ProofResultModel,
        "你是 Geometry Studio 的中文几何教学证明 agent，只生成中文 Markdown+MathJax 证明与解答。",
        proof_user,
    )
    proof_markdown = sanitize_mathjax_markdown(proof.proofMarkdown, "教学证明")
    proof_steps = sanitize_proof_steps(proof.proofSteps)
    classroom_questions = sanitize_classroom_questions(proof.classroomQuestions)
    scene = dict(state["scene"])
    scene["proofSteps"] = proof_steps
    note_user = (
        "请把几何题规格、交互场景和证明结果整理成 Geometry Studio 右侧笔记区的最终中文 Markdown。"
        "这份笔记会直接由 markdown-it + markdown-it-mathjax3 预览，不会经过 LaTeX 编译器；"
        "因此必须走 Markdown+公式渲染路线，不能生成完整 LaTeX 文档、TeX 头文件、导出说明或源码代码块。"
        "题目可能来自图片识别，也可能只有文本；如果没有原图信息，不要写“无法识别图片”，"
        "只根据 GeometrySpec 和证明结果组织内容。\n\n"
        "笔记结构必须按下面标题输出，标题文字保持一致：\n"
        "## 题目\n"
        "## 已识别条件\n"
        "## 解题思路\n"
        "## 交互模型说明\n"
        "## 教学证明\n"
        "## 解答\n"
        "## 课堂提问\n\n"
        "写作要求：\n"
        "- 整篇笔记使用中文；若原题不是中文，请给出中文译文并保留关键数学符号。\n"
        "- `已识别条件` 要把点、线、角、圆、相似/全等/平行/垂直/比例等条件整理清楚。\n"
        "- `解题思路` 用较短段落说明突破口和辅助构造。\n"
        "- `交互模型说明` 说明 GeometryScene 中拖动点、参数、测量和注释如何帮助理解证明；没有可变参数时说明模型展示了哪些固定关系。\n"
        "- `教学证明` 以提供的 Proof Markdown 为主要来源，可以微调衔接，但不要改变数学结论。\n"
        "- `解答` 必须给出最终结论或数值答案。\n"
        "- `课堂提问` 使用提供的问题列表，必要时改写成更适合课堂追问的中文问题。\n"
        "- 不要生成题目原图链接，后端会在需要时自动追加图片引用。\n\n"
        "右侧笔记渲染规则：\n"
        + MATHJAX_MARKDOWN_RULES
        + "\n\n"
        "GeometrySpec:\n"
        + json.dumps(spec, ensure_ascii=False, indent=2)
        + "\n\nGeometryScene:\n"
        + json.dumps(scene, ensure_ascii=False, indent=2)
        + "\n\nProof Markdown:\n"
        + proof_markdown
        + "\n\nClassroom questions:\n"
        + json.dumps(classroom_questions, ensure_ascii=False, indent=2)
    )
    note = json_chat(
        state,
        NoteResultModel,
        "你负责撰写 Geometry Studio 右侧笔记区可直接渲染的中文几何解题笔记。",
        note_user,
    )
    note_markdown = sanitize_mathjax_markdown(note.noteMarkdown, "几何解题笔记")
    return {
        "proofMarkdown": proof_markdown,
        "classroomQuestions": classroom_questions,
        "scene": scene,
        "noteMarkdown": note_markdown + "\n",
    }


def runtime_check(state: GeometryState) -> Dict[str, Any]:
    progress(state, "runtime_check", "运行检查")
    emit(
        {
            "type": "runtime_probe",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "code": state.get("code", ""),
            "attempt": int(state.get("attempt") or 1),
        }
    )
    command = read_command()
    if not command or command.get("type") == "stop":
        emit(
            {
                "type": "interrupted",
                "sessionId": state["sessionId"],
                "sceneName": state["sceneName"],
                "message": "Geometry workflow stopped",
            }
        )
        raise KeyboardInterrupt("Geometry workflow stopped")
    if command.get("type") != "probe_result":
        raise RuntimeError("Geometry workflow expected probe_result")

    probe_result = command.get("probeResult") or {
        "ok": False,
        "errorText": "Missing probe result",
        "repairable": True,
    }
    if probe_result.get("ok"):
        return {"probeResult": probe_result, "workflowStatus": "succeeded", "errorText": ""}

    attempt = int(state.get("attempt") or 1)
    diagnostics = list(state.get("diagnostics") or [])
    diagnostics.append(f"attempt {attempt} failed: {probe_result.get('errorText', '')}")
    max_attempts = int(state.get("maxAttempts") or 5)
    if not probe_result.get("repairable", True) or attempt >= max_attempts:
        return {
            "probeResult": probe_result,
            "diagnostics": diagnostics,
            "workflowStatus": "failed",
            "errorText": probe_result.get("errorText", "Geometry model failed validation"),
        }

    return {
        "probeResult": probe_result,
        "diagnostics": diagnostics,
        "workflowStatus": "repairing",
        "attempt": attempt + 1,
    }


def self_correct(state: GeometryState) -> Dict[str, Any]:
    progress(state, "self_correct", "自我修正")
    user = (
        "请修复这段 Python/Matplotlib 代码，使它能在 Geometry Studio 中成功运行，"
        "同时保持同一个 GeometryScene 和中文教学意图。"
        "修复后仍必须保留中文图标题、中文注释、中文控件/参数标签和中文测量说明。"
        "修复时保持画面清爽：不要新增庞大图例、动态测量清单、结论说明框或过多辅助线；"
        "底部 Slider/Button 必须完整显示，中文标签和数值不得被窗口边缘裁切。"
        "修复时不得引入对勾、叉号、复选框、emoji 或它们的 Unicode 转义；"
        "需要表达判断时使用普通中文“正确”“错误”“通过”“未通过”“是”“否”。"
        "Return only the repaired code and repair notes in JSON.\n\n"
        "GeometryScene:\n"
        + json.dumps(state["scene"], ensure_ascii=False, indent=2)
        + "\n\nRuntime or validation error:\n"
        + str((state.get("probeResult") or {}).get("errorText", ""))
        + "\n\nCurrent code:\n"
        + state.get("code", "")
    )
    repaired = json_chat(
        state,
        RepairResultModel,
        "你是安全 Matplotlib 几何程序的自我修正 agent，并负责保持中文界面文本。",
        user,
    )
    diagnostics = list(state.get("diagnostics") or [])
    diagnostics.extend(repaired.repairNotes)
    return {
        "code": sanitize_matplotlib_text_symbols(repaired.pythonCode.strip()),
        "diagnostics": diagnostics,
        "workflowStatus": "checking",
    }


def publish(state: GeometryState) -> Dict[str, Any]:
    progress(state, "publish", "发布")
    if state.get("workflowStatus") == "succeeded":
        result = {
            "code": state.get("code", ""),
            "noteMarkdown": state.get("noteMarkdown", ""),
            "proofMarkdown": state.get("proofMarkdown", ""),
            "spec": state.get("reviewedSpec") or state.get("spec") or {},
            "scene": state.get("scene") or {},
            "diagnostics": list(state.get("diagnostics") or []),
        }
        emit(
            {
                "type": "succeeded",
                "sessionId": state["sessionId"],
                "sceneName": state["sceneName"],
                "result": result,
            }
        )
        return {}

    emit(
        {
            "type": "failed",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "errorText": state.get("errorText", "Geometry workflow failed"),
            "diagnostics": list(state.get("diagnostics") or []),
        }
    )
    return {}


def route_after_runtime_check(state: GeometryState) -> str:
    if state.get("workflowStatus") == "repairing":
        return "self_correct"
    return "publish"


def build_geometry_graph():
    graph = StateGraph(GeometryState)
    graph.add_node("problem_vision_parse", problem_vision_parse)
    graph.add_node("geometry_spec_organize", geometry_spec_organize)
    graph.add_node("teacher_review", teacher_review)
    graph.add_node("construction_plan", construction_plan)
    graph.add_node("dual_scene_generate", dual_scene_generate)
    graph.add_node("matplotlib_code_generate", matplotlib_code_generate)
    graph.add_node("teaching_proof_generate", teaching_proof_generate)
    graph.add_node("runtime_check", runtime_check)
    graph.add_node("self_correct", self_correct)
    graph.add_node("publish", publish)
    graph.add_edge(START, "problem_vision_parse")
    graph.add_edge("problem_vision_parse", "geometry_spec_organize")
    graph.add_edge("geometry_spec_organize", "teacher_review")
    graph.add_edge("teacher_review", "construction_plan")
    graph.add_edge("construction_plan", "dual_scene_generate")
    graph.add_edge("dual_scene_generate", "matplotlib_code_generate")
    graph.add_edge("matplotlib_code_generate", "teaching_proof_generate")
    graph.add_edge("teaching_proof_generate", "runtime_check")
    graph.add_conditional_edges(
        "runtime_check",
        route_after_runtime_check,
        {
            "self_correct": "self_correct",
            "publish": "publish",
        },
    )
    graph.add_edge("self_correct", "runtime_check")
    graph.add_edge("publish", END)
    return graph.compile()


def describe_graph() -> None:
    emit(
        {
            "type": "graph_description",
            "nodes": GRAPH_NODES,
            "edges": [
                ["START", "problem_vision_parse"],
                ["problem_vision_parse", "geometry_spec_organize"],
                ["geometry_spec_organize", "teacher_review"],
                ["teacher_review", "construction_plan"],
                ["construction_plan", "dual_scene_generate"],
                ["dual_scene_generate", "matplotlib_code_generate"],
                ["matplotlib_code_generate", "teaching_proof_generate"],
                ["teaching_proof_generate", "runtime_check"],
                ["runtime_check", "self_correct"],
                ["runtime_check", "publish"],
                ["self_correct", "runtime_check"],
                ["publish", "END"],
            ],
        }
    )


def run_session(command: Dict[str, Any]) -> None:
    request = command["request"]
    state: GeometryState = {
        "sessionId": command["sessionId"],
        "sceneName": request["sceneName"],
        "imageDataUrl": request.get("imageDataUrl", ""),
        "problemText": request.get("problemText", ""),
        "currentCode": request.get("currentCode", ""),
        "maxAttempts": int(request.get("maxAttempts") or 5),
        "settings": request.get("settings") or {},
        "attempt": 1,
        "diagnostics": [],
        "workflowStatus": "working",
    }
    build_geometry_graph().invoke(state)


def main() -> None:
    if "--describe-graph" in sys.argv:
        describe_graph()
        return

    command = read_command()
    if not command or command.get("type") != "start":
        emit({"type": "failed", "errorText": "Geometry agent expected a start command"})
        return
    try:
        run_session(command)
    except KeyboardInterrupt:
        return
    except Exception as exc:
        emit(
            {
                "type": "failed",
                "sessionId": command.get("sessionId", ""),
                "sceneName": (command.get("request") or {}).get("sceneName", ""),
                "errorText": str(exc),
                "diagnostics": traceback.format_exc().splitlines()[-18:],
            }
        )


if __name__ == "__main__":
    main()
