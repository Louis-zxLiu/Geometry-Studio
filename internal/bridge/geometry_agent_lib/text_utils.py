from __future__ import annotations

import re
from typing import Any, Dict, List

from .schemas import GeometryProofStepModel


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
    text = re.sub(
        r"\\\((.*?)\\\)",
        lambda match: "$" + match.group(1).strip() + "$",
        text,
        flags=re.S,
    )
    return normalize_display_math_delimiter_lines(text)


def normalize_display_math_delimiter_lines(markdown: str) -> str:
    return re.sub(r"(?m)^[ \t]+\$\$[ \t]*$", "$$", markdown)


def sanitize_mathjax_segments(markdown: str) -> str:
    placeholders: List[tuple[str, str]] = []

    def replace_display(match: re.Match[str]) -> str:
        body = sanitize_mathjax_body(match.group(1))
        token = f"\u0000DISPLAY_MATH_{len(placeholders)}\u0000"
        placeholders.append((token, "$$\n" + body + "\n$$" if body else ""))
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
    text = re.sub(r"\\(?:text|mbox)\{([^{}]*)\}", lambda match: match.group(1), text)
    text = re.sub(r"[，。；：！？、]", " ", text)
    text = re.sub(r"[\u4e00-\u9fff]+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def sanitize_inline_markdown_text(text: str) -> str:
    return sanitize_mathjax_markdown(text).replace("\n", " ").strip()


def sanitize_proof_steps(steps: List[GeometryProofStepModel]) -> List[Dict[str, Any]]:
    sanitized: List[Dict[str, Any]] = []
    for index, step in enumerate(steps, start=1):
        claim = sanitize_inline_markdown_text(step.claim)
        reason = sanitize_inline_markdown_text(step.reason)
        if not claim and not reason:
            continue
        sanitized.append(
            {
                "id": step.id or f"p{index}",
                "claim": claim,
                "reason": reason,
                "depends": list(step.depends or []),
            }
        )
    return sanitized


def sanitize_classroom_questions(questions: List[str]) -> List[str]:
    sanitized: List[str] = []
    for question in questions:
        text = sanitize_inline_markdown_text(str(question or ""))
        if text:
            sanitized.append(text)
    return sanitized[:5]


def sanitize_geometry_spec_markdown(spec: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = dict(spec)
    cleaned["problemText"] = sanitize_mathjax_markdown(str(cleaned.get("problemText") or ""))
    cleaned["goalText"] = sanitize_mathjax_markdown(str(cleaned.get("goalText") or ""))
    cleaned["constructionHints"] = [
        sanitize_mathjax_markdown(str(hint or ""))
        for hint in cleaned.get("constructionHints") or []
        if str(hint or "").strip()
    ]
    constraints: List[Dict[str, Any]] = []
    for constraint in cleaned.get("constraints") or []:
        if not isinstance(constraint, dict):
            continue
        next_constraint = dict(constraint)
        next_constraint["text"] = sanitize_mathjax_markdown(str(next_constraint.get("text") or ""))
        constraints.append(next_constraint)
    cleaned["constraints"] = constraints
    return cleaned


def preview_text(text: str, limit: int = 180) -> str:
    normalized = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1].rstrip() + "..."


def summarize_spec(spec: Dict[str, Any]) -> str:
    return (
        f"已整理 {len(spec.get('entities') or [])} 个对象、"
        f"{len(spec.get('constraints') or [])} 条约束、"
        f"{len(spec.get('constructionHints') or [])} 条构造提示。"
    )


def spec_detail(spec: Dict[str, Any]) -> str:
    lines = []
    problem = preview_text(str(spec.get("problemText") or ""), 220)
    goal = preview_text(str(spec.get("goalText") or ""), 180)
    if problem:
        lines.append("题干：" + problem)
    if goal:
        lines.append("目标：" + goal)
    constraints = [
        preview_text(str(item.get("text") or item.get("type") or ""), 90)
        for item in spec.get("constraints") or []
        if isinstance(item, dict)
    ]
    constraints = [item for item in constraints if item]
    if constraints:
        lines.append("关键条件：" + "；".join(constraints[:4]))
    return "\n".join(lines)


def summarize_scene(scene: Dict[str, Any]) -> str:
    return (
        f"已生成 {len(scene.get('points') or [])} 个点、"
        f"{len(scene.get('segments') or [])} 条线段、"
        f"{len(scene.get('circles') or [])} 个圆、"
        f"{len(scene.get('controls') or [])} 个交互控件。"
    )


def scene_detail(scene: Dict[str, Any]) -> str:
    title = preview_text(str(scene.get("title") or ""), 120)
    measurements = [
        preview_text(str(item.get("label") or item.get("kind") or ""), 60)
        for item in scene.get("measurements") or []
        if isinstance(item, dict)
    ]
    annotations = [
        preview_text(str(item.get("text") or ""), 80)
        for item in scene.get("annotations") or []
        if isinstance(item, dict)
    ]
    lines = []
    if title:
        lines.append("场景标题：" + title)
    if measurements:
        lines.append("测量：" + "；".join([item for item in measurements if item][:4]))
    if annotations:
        lines.append("注释：" + "；".join([item for item in annotations if item][:3]))
    return "\n".join(lines)


def summarize_dsl(code: str) -> str:
    from .dsl_runtime import strip_dsl_code

    command_lines = [
        line
        for line in strip_dsl_code(code).splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    commands: Dict[str, int] = {}
    for line in command_lines:
        name = line.split(":", 1)[0].strip().lower()
        commands[name] = commands.get(name, 0) + 1
    frequent = "、".join(f"{key} {value}" for key, value in sorted(commands.items())[:6])
    return f"已生成 {len(command_lines)} 行 DSL 构造命令" + (f"（{frequent}）。" if frequent else "。")


def summarize_dsl_validation(validation: Dict[str, Any]) -> str:
    status = "通过" if validation.get("isValid") else "未通过"
    object_score = float(validation.get("objectCoverage") or 0)
    condition_score = float(validation.get("conditionCoverage") or 0)
    failed_count = len(validation.get("failedItems") or [])
    return f"DSL 模型验证{status}，对象覆盖 {object_score:.0%}，条件覆盖 {condition_score:.0%}，问题 {failed_count} 项。"


def summarize_code(code: str) -> str:
    lines = [line for line in str(code or "").splitlines() if line.strip()]
    controls = len(re.findall(r"\b(?:Slider|Button|CheckButtons|RadioButtons)\s*\(", code or ""))
    control_text = f"，包含 {controls} 个交互控件" if controls else ""
    return f"已生成 {len(lines)} 行可运行代码{control_text}。"


def summarize_markdown(markdown: str, questions: List[str]) -> str:
    headings = len(re.findall(r"(?m)^#{1,6}\s+", markdown or ""))
    formulas = len(re.findall(r"\$\$|\$[^$\n]+?\$", markdown or ""))
    return f"已生成 {headings} 个笔记小节、{formulas} 处公式、{len(questions)} 个课堂追问。"
def summarize_construction(construction: Dict[str, Any]) -> str:
    solution = construction.get("solution") or {}
    objects = construction.get("objects") or []
    constraints = construction.get("constraints") or []
    status = solution.get("status") or "unsolved"
    return (
        f"已建模 {len(objects)} 个对象、{len(constraints)} 条约束；"
        f"求解状态 {status}，最大残差 {float(solution.get('maxResidual') or 0.0):.2e}。"
    )


def construction_detail(construction: Dict[str, Any]) -> str:
    intents = [
        preview_text(str(item.get("summary") or ""), 100)
        for item in construction.get("constructionIntent") or []
        if isinstance(item, dict)
    ]
    constraints = [
        preview_text(str(item.get("text") or item.get("type") or ""), 100)
        for item in construction.get("constraints") or []
        if isinstance(item, dict)
    ]
    residuals = [
        f"{item.get('constraintId') or item.get('type')}: {float(item.get('value') or 0.0):.2e}"
        for item in ((construction.get("solution") or {}).get("residuals") or [])[:6]
        if isinstance(item, dict)
    ]
    lines: List[str] = []
    if intents:
        lines.append("构造意图：" + "；".join(item for item in intents[:3] if item))
    if constraints:
        lines.append("关键约束：" + "；".join(item for item in constraints[:5] if item))
    if residuals:
        lines.append("残差：" + "；".join(residuals))
    return "\n".join(lines)


def summarize_constraint_validation(validation: Dict[str, Any]) -> str:
    status = "通过" if validation.get("isValid") else "未通过"
    object_score = float(validation.get("objectCoverage") or 0)
    condition_score = float(validation.get("conditionCoverage") or 0)
    failed_count = len(validation.get("failedItems") or [])
    residual = validation.get("residualSummary") or {}
    max_residual = float(residual.get("maxResidual") or 0.0)
    return (
        f"约束模型验证{status}，对象覆盖 {object_score:.0%}，"
        f"条件覆盖 {condition_score:.0%}，最大残差 {max_residual:.2e}，问题 {failed_count} 项。"
    )
