from __future__ import annotations

import json
from typing import Any, Dict


GRAPH_NODES = [
    "parse_spec",
    "build_constraint_construction",
    "solve_constraint_graph",
    "teacher_review",
    "final_repair_constraints",
    "scene_compile",
    "matplotlib_code_generate",
    "teaching_proof_generate",
    "runtime_check",
    "self_correct",
    "publish",
]


STAGE_DETAILS = {
    "parse_spec": {
        "agentName": "几何规格解析 agent",
        "title": "几何规格解析",
        "description": "从图片和文本中解析题干、对象、条件、求证目标和构造提示，整理成稳定规格。",
    },
    "build_constraint_construction": {
        "agentName": "约束构造建模 agent",
        "title": "约束构造建模",
        "description": "让 MLLM 生成对象、基础谓词约束和构造意图，作为几何真相层草图。",
    },
    "solve_constraint_graph": {
        "agentName": "约束求解 agent",
        "title": "约束求解与预览",
        "description": "用数值残差求解对象坐标，生成预览场景和残差反馈，供教师审核。",
    },
    "teacher_review": {
        "agentName": "教师复核 agent",
        "title": "教师复核",
        "description": "暂停工作流，把题目规格、约束构造、求解预览和验证反馈交给用户确认或修正。",
    },
    "final_repair_constraints": {
        "agentName": "最终约束修复 agent",
        "title": "最终约束修复",
        "description": "根据教师是否修改规格决定复用或重建构造，并只通过 MLLM 修改对象、约束和构造意图来修复失败。",
    },
    "scene_compile": {
        "agentName": "场景编译 agent",
        "title": "构造场景编译",
        "description": "从已求解、已验证的 GeometryConstruction 派生 GeometryScene 展示模型。",
    },
    "matplotlib_code_generate": {
        "agentName": "Matplotlib 代码生成 agent",
        "title": "Matplotlib 代码生成",
        "description": "只消费已审核、已验证的构造和展示模型，生成中文教学 Matplotlib 渲染代码。",
    },
    "teaching_proof_generate": {
        "agentName": "教学证明生成 agent",
        "title": "教学证明生成",
        "description": "基于最终构造和展示模型生成中文证明、解答、课堂提问和右侧 Markdown 笔记。",
    },
    "runtime_check": {
        "agentName": "运行检查 agent",
        "title": "运行检查",
        "description": "实际运行生成代码，检查安全性、可执行性和窗口就绪状态。",
    },
    "self_correct": {
        "agentName": "自我修正 agent",
        "title": "自我修正",
        "description": "根据运行错误修复 Matplotlib 代码，并保持同一构造事实和中文教学表达。",
    },
    "publish": {
        "agentName": "发布 agent",
        "title": "发布",
        "description": "把通过检查的代码、几何规格、构造真相层、场景和中文笔记写回当前场景。",
    },
}


CONSTRAINT_REFERENCE = """
GeometryConstruction is the only geometric truth layer.

objects:
- point: refs usually empty. Use role given/unknown/derived/auxiliary. Optional attributes may include x, y, fixed, showLabel.
- segment: refs [A, B].
- line: refs [A, B].
- ray: refs [A, B].
- circle: refs [O, A] for center-through, refs [A, B, C] for a circumcircle through three points, or attributes {center, radius}. Prefer center-through or three-point refs when possible.
- arc: refs [O, A, B] for center/start/end. Use an independent arc object when the problem names an arc or semicircle, even if the supporting full circle also exists.
- polygon: refs [A, B, C, ...].

constraints:
- on: {point, object}; object can be line, ray, segment, circle.
- parallel: {first, second}; each can be a line/segment/ray id or two-point list.
- perpendicular: {first, second}; same reference rules as parallel.
- distance_equals: {left: [A,B], value: 3} or {left: [A,B], right: [C,D]}.
- ratio: {left: [A,B], right: [C,D], value: 2}.
- angle_value: {a, vertex, c, value}; value may be degrees such as 60.
- angle_equals: {first: [A,B,C], second: [D,E,F]}.
- midpoint: {point: M, a: A, b: B}.
- intersection: {point: P, first: object1, second: object2}.
- tangent: {line, circle, point?} or {first: circle1, second: circle2, mode: external/internal}.
- concyclic: {points: [A,B,C,D,...]}.
- circumcenter: {center: K, points: [C,D,P]}.
- collinear: {points: [A,B,C,...]}.
- opposite_sides/same_side: {first: C, second: D, line: AB}.
- orientation: {a, b, c, value: ccw/cw}.
- order: {point, a, b}; point lies between a and b.
- inside/outside: {point, object}; currently object is usually a circle.

Rules:
1. Do not create problem-type commands. Model the diagram with objects plus the predicates above.
2. Every constraint must reference declared object ids or point ids.
3. Add auxiliary points/lines only when they help express the construction or proof. Mark hidden helpers as role "auxiliary".
4. Do not use free GeometryScene coordinates as the source of truth. Coordinates are solved later.
5. Keep constructionIntent in Chinese: explain why each group of objects and constraints exists.
6. Leave dslCode empty or use it only as a readable debug summary; it is not executable and not authoritative.
7. Every named object in the problem statement or goal must be represented as an object, including arcs, semicircles, polygons, and derived circles such as the circumcircle of a named triangle.
8. Point attributes x/y are initializer hints only unless attributes.fixed is true. Use fixed:true only for genuinely fixed givens or explicit gauge anchors, never for movable points such as P, C, D.
""".strip()


MATHJAX_MARKDOWN_RULES = r"""
输出会直接进入 Geometry Studio 右侧笔记区，由 markdown-it 与 markdown-it-mathjax3 渲染。请严格遵守：
- 只输出 Markdown 片段，不输出完整 LaTeX 文档。
- 允许使用标题、段落、有序/无序列表、简单表格、粗体，以及 `$...$`、`$$...$$` 公式。
- 禁止使用 `\documentclass`、`\usepackage`、`\begin{document}`、`\end{document}`、TeX 导言区、代码围栏、HTML、Mermaid、SVG。
- 行内短公式使用 `$AB=AC$`，推导链或关键等式使用 `$$...$$`。
- 公式内只放数学符号、字母、数字和 LaTeX 数学命令；中文必须放在公式外。
""".strip()


def prompt_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def build_constraint_construction_prompt(spec: Dict[str, Any], *, mode: str) -> str:
    mode_instruction = (
        "这是审核前草图：需要尽量覆盖题意，并让教师能看到可理解的约束预览。"
        if mode == "draft"
        else "这是教师确认后的最终构造：必须以 reviewed spec 为唯一题意来源。"
    )
    return (
        "请根据 GeometrySpec 生成 GeometryConstruction。"
        f"{mode_instruction}"
        "你不是在画自由坐标图，而是在建立可求解的对象-约束图。"
        "后续 runtime 会用 SciPy least_squares 求解坐标，并把残差反馈给你修复。"
        "不要输出某题型专用命令，不要用关键词启发式，不要从题干跳到展示场景。"
        "如果题目有多种等价构造，选择对象引用清晰、残差稳定、语义覆盖完整的一种。"
        "\n\nConstraint reference:\n"
        + CONSTRAINT_REFERENCE
        + "\n\nGeometrySpec:\n"
        + prompt_json(spec)
    )


def build_constraint_validation_prompt(spec: Dict[str, Any], construction: Dict[str, Any], preview_scene: Dict[str, Any]) -> str:
    return (
        "请严格审查下面的 GeometryConstruction 是否满足 GeometrySpec。"
        "数值残差已经由 runtime 给出，你负责语义覆盖审查：对象是否齐全、约束是否真实表达题目条件、"
        "构造意图是否合理、有没有从题干遗漏关键关系。"
        "如果数值解通过但语义漏掉了题目条件，必须判为未通过。"
        "如果失败，请给出下一轮只能修改 objects / constraints / constructionIntent 的修复指令。"
        "\n\nGeometrySpec:\n"
        + prompt_json(spec)
        + "\n\nGeometryConstruction with solver result:\n"
        + prompt_json(construction)
        + "\n\nPreview GeometryScene derived from construction:\n"
        + prompt_json(preview_scene)
    )


def build_constraint_repair_prompt(
    spec: Dict[str, Any],
    construction: Dict[str, Any],
    feedback: Dict[str, Any],
) -> str:
    return (
        "请根据求解残差、语义审查反馈和 GeometrySpec 修复 GeometryConstruction。"
        "你只能修改 objects / constraints / constructionIntent；不得改成场景坐标生成，不得新增题型命令，"
        "不得把条件写成自然语言假声明。"
        "尽量保留已经正确的对象和约束，只修复失败项、遗漏项或引用错误。"
        "返回完整 GeometryConstruction JSON。solution 与 validation 可以留空，runtime 会重新求解。"
        "\n\nConstraint reference:\n"
        + CONSTRAINT_REFERENCE
        + "\n\nGeometrySpec:\n"
        + prompt_json(spec)
        + "\n\nPrevious GeometryConstruction:\n"
        + prompt_json(construction)
        + "\n\nFeedback:\n"
        + prompt_json(feedback)
    )
