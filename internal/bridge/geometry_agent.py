from __future__ import annotations

import json
import sys
import traceback
from typing import Any, Dict, Optional

from langgraph.graph import END, START, StateGraph

from geometry_agent_lib.construction import spec_fingerprint, specs_match
from geometry_agent_lib.constraint_compiler import (
    construction_is_semantically_valid,
    construction_is_numerically_usable,
    merge_semantic_validation,
    normalize_construction,
    solve_and_summarize,
    validation_summary,
)
from geometry_agent_lib.llm_client import json_chat
from geometry_agent_lib.prompts import (
    GRAPH_NODES,
    MATHJAX_MARKDOWN_RULES,
    STAGE_DETAILS,
    build_constraint_construction_prompt,
    build_constraint_repair_prompt,
    build_constraint_validation_prompt,
)
from geometry_agent_lib.prompt_payloads import compact_scene_for_prompt, compact_scene_geometry_for_prompt, prompt_json
from geometry_agent_lib.schemas import (
    CodeResultModel,
    ConstructionValidationResultModel,
    GeometryConstructionDraftModel,
    GeometrySpecModel,
    GeometryState,
    NoteResultModel,
    ProofResultModel,
    RepairResultModel,
)
from geometry_agent_lib.semantic_export import construction_facts_text, construction_to_scene
from geometry_agent_lib.text_utils import (
    construction_detail,
    preview_text,
    sanitize_classroom_questions,
    sanitize_geometry_spec_markdown,
    sanitize_matplotlib_text_symbols,
    sanitize_mathjax_markdown,
    sanitize_proof_steps,
    scene_detail,
    spec_detail,
    summarize_code,
    summarize_constraint_validation,
    summarize_construction,
    summarize_markdown,
    summarize_scene,
    summarize_spec,
)


def stage_details(stage: str) -> Dict[str, str]:
    return STAGE_DETAILS.get(stage, {"agentName": "几何 agent", "title": stage, "description": ""})


def emit(event: Dict[str, Any]) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def read_command() -> Optional[Dict[str, Any]]:
    line = sys.stdin.readline()
    if not line:
        return None
    return json.loads(line)


def progress(
    state: GeometryState,
    stage: str,
    message: str,
    status: str = "running",
    event_kind: str = "stage",
    artifact_title: str = "",
    artifact_summary: str = "",
    artifact_detail: str = "",
    artifact_data: Optional[Dict[str, Any]] = None,
    attempt: Optional[int] = None,
) -> None:
    details = stage_details(stage)
    payload: Dict[str, Any] = {
        "type": "progress",
        "sessionId": state["sessionId"],
        "sceneName": state["sceneName"],
        "stage": stage,
        "agentName": details["agentName"],
        "title": details["title"],
        "description": details["description"],
        "message": message,
        "status": status,
        "eventKind": event_kind,
        "attempt": int(attempt or state.get("attempt") or 1),
    }
    if artifact_title:
        payload["artifactTitle"] = artifact_title
    if artifact_summary:
        payload["artifactSummary"] = artifact_summary
    if artifact_detail:
        payload["artifactDetail"] = artifact_detail
    if artifact_data is not None:
        payload["artifactData"] = artifact_data
    emit(payload)


def artifact(
    state: GeometryState,
    stage: str,
    title: str,
    summary: str,
    detail: str = "",
    data: Optional[Dict[str, Any]] = None,
    status: str = "completed",
    attempt: Optional[int] = None,
) -> None:
    progress(
        state,
        stage,
        summary or title,
        status=status,
        event_kind="artifact",
        artifact_title=title,
        artifact_summary=summary,
        artifact_detail=detail,
        artifact_data=data,
        attempt=attempt,
    )


def result_from_state(state: GeometryState) -> Dict[str, Any]:
    return {
        "code": state.get("code", ""),
        "noteMarkdown": state.get("noteMarkdown", ""),
        "proofMarkdown": state.get("proofMarkdown", ""),
        "spec": state.get("reviewedSpec") or state.get("spec") or {},
        "construction": state.get("construction") or state.get("constructionDraft") or {},
        "scene": state.get("scene") or {},
        "diagnostics": list(state.get("diagnostics") or []),
    }


def parse_spec(state: GeometryState) -> Dict[str, Any]:
    progress(state, "parse_spec", "解析并整理几何规格")
    user = (
        "请从图片和/或题干文本中提取完整几何题，并整理为可构造的 GeometrySpec。"
        "如果没有图片，就完全根据文本解析，不要因为缺少配图而失败。"
        "请识别所有命名对象、已知条件、几何关系、求证目标和可能的辅助构造。"
        "保持数学含义，使用稳定 ASCII ID，让 constraints 引用 entity ID，并把隐含条件显式化。"
        "所有 problemText、goalText、constraints.text、constructionHints 都必须使用中文；"
        "公式统一使用 `$...$` 或 `$$...$$`，不要输出 `\\(...\\)`、`\\[...\\]` 或完整 LaTeX 文档。\n\n"
        f"题干文本（可为空）：\n{state.get('problemText', '')}"
    )
    spec = json_chat(
        state,
        GeometrySpecModel,
        "你是几何拍照解题的 MLLM 规格解析 agent，负责把图片/文本输入转成中文结构化几何题规格。",
        user,
        state.get("imageDataUrl", ""),
        compact_schema=True,
    )
    cleaned = sanitize_geometry_spec_markdown(spec.model_dump())
    artifact(
        state,
        "parse_spec",
        "规格解析结果",
        summarize_spec(cleaned),
        spec_detail(cleaned),
        {"spec": cleaned},
    )
    return {"spec": cleaned, "specFingerprint": spec_fingerprint(cleaned)}


def build_constraint_construction(state: GeometryState) -> Dict[str, Any]:
    progress(state, "build_constraint_construction", "生成审核前约束构造")
    spec = state["spec"]
    model = json_chat(
        state,
        GeometryConstructionDraftModel,
        "你是约束优先几何构造 agent。你的任务是生成对象、基础谓词约束和中文构造意图。",
        build_constraint_construction_prompt(spec, mode="draft"),
        "",
        compact_schema=True,
    )
    construction = normalize_construction(
        model.model_dump(),
        spec,
        review_status="draft_generated",
        diagnostics=list(state.get("diagnostics") or []),
    )
    artifact(
        state,
        "build_constraint_construction",
        "约束构造",
        summarize_construction(construction),
        construction_detail(construction),
        {"constructionDraft": construction},
    )
    return {"constructionDraft": construction}


def solve_validate_construction(
    state: GeometryState,
    *,
    construction: Dict[str, Any],
    spec: Dict[str, Any],
    stage: str,
    attempt: int,
    review_status: str,
) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    construction = dict(construction)
    construction["reviewStatus"] = review_status
    construction = solve_and_summarize(construction)

    try:
        semantic = json_chat(
            state,
            ConstructionValidationResultModel,
            "你是约束构造语义审查 agent，负责检查对象和约束是否真正覆盖题意。",
            build_constraint_validation_prompt(spec, construction),
            "",
            compact_schema=True,
        ).model_dump()
    except Exception as exc:
        semantic = {
            "isValid": False,
            "objectCoverage": 0.0,
            "conditionCoverage": 0.0,
            "summary": f"语义审查未能完成：{exc}",
            "failedItems": [
                {
                    "severity": "error",
                    "target": "semantic_validation",
                    "message": str(exc),
                    "suggestedRepair": "请重新生成结构更清晰的对象、约束和构造意图。",
                }
            ],
            "repairInstructions": ["重新生成或修复对象、约束和构造意图。"],
        }
    construction = merge_semantic_validation(construction, semantic)
    construction["reviewStatus"] = review_status
    summary = validation_summary(construction.get("validation") or {})
    feedback = {
        "attempt": attempt,
        "validationSummary": summary,
        "solution": construction.get("solution") or {},
        "failedItems": summary.get("failedItems") or [],
        "repairInstructions": summary.get("repairInstructions") or [],
    }
    return construction, summary, feedback


def solve_constraint_graph(state: GeometryState) -> Dict[str, Any]:
    progress(state, "solve_constraint_graph", "求解约束图并生成审核反馈")
    spec = state["spec"]
    draft = state.get("constructionDraft") or {}
    construction, summary, feedback = solve_validate_construction(
        state,
        construction=draft,
        spec=spec,
        stage="solve_constraint_graph",
        attempt=1,
        review_status="draft_review_pending",
    )
    artifact(
        state,
        "solve_constraint_graph",
        "约束求解与验证",
        summarize_constraint_validation(summary),
        summary.get("summary") or construction_detail(construction),
        {"constructionDraft": construction, "validationSummary": summary, "feedback": feedback},
    )
    return {"constructionDraft": construction, "validationSummary": summary}


def teacher_review(state: GeometryState) -> Dict[str, Any]:
    progress(
        state,
        "teacher_review",
        "等待用户确认几何规格、约束构造和验证反馈",
        status="waiting",
        event_kind="review",
        artifact_title="待确认规格与约束反馈",
        artifact_summary=summarize_spec(state["spec"]),
        artifact_detail=spec_detail(state["spec"]),
        artifact_data={
            "spec": state["spec"],
            "constructionDraft": state.get("constructionDraft") or {},
            "validationSummary": state.get("validationSummary") or {},
        },
    )
    emit(
        {
            "type": "review_required",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "spec": state["spec"],
            "constructionDraft": state.get("constructionDraft") or {},
            "validationSummary": state.get("validationSummary") or {},
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
    artifact(
        state,
        "teacher_review",
        "用户已确认",
        summarize_spec(reviewed),
        spec_detail(reviewed),
        {"spec": reviewed},
    )
    return {"reviewedSpec": reviewed, "reviewedSpecFingerprint": spec_fingerprint(reviewed)}


def generate_final_construction(state: GeometryState, spec: Dict[str, Any], spec_unchanged: bool) -> Dict[str, Any]:
    draft = dict(state.get("constructionDraft") or {})
    if spec_unchanged and draft.get("objects"):
        draft["reviewStatus"] = "teacher_reviewed_reused"
        draft["specFingerprint"] = spec_fingerprint(spec)
        artifact(
            state,
            "final_repair_constraints",
            "复用约束构造",
            "教师未修改规格，复用审核前 construction 作为最终构造。",
            construction_detail(draft),
            {"construction": draft},
        )
        return draft

    model = json_chat(
        state,
        GeometryConstructionDraftModel,
        "你是教师确认后的约束优先几何构造 agent。规格如有修改，必须丢弃旧构造并重新建模。",
        build_constraint_construction_prompt(spec, mode="final"),
        "",
        compact_schema=True,
    )
    construction = normalize_construction(
        model.model_dump(),
        spec,
        review_status="teacher_reviewed_reconstructed" if not spec_unchanged else "teacher_reviewed_generated",
        diagnostics=list(state.get("diagnostics") or []),
    )
    artifact(
        state,
        "final_repair_constraints",
        "生成最终约束构造初稿",
        summarize_construction(construction),
        construction_detail(construction),
        {"construction": construction},
    )
    return construction


def final_repair_constraints(state: GeometryState) -> Dict[str, Any]:
    spec = state.get("reviewedSpec") or state["spec"]
    spec_unchanged = specs_match(state["spec"], spec)
    construction = generate_final_construction(state, spec, spec_unchanged)
    max_attempts = int(state.get("maxAttempts") or 5)
    diagnostics = list(state.get("diagnostics") or [])
    last_summary: Dict[str, Any] = {}

    if spec_unchanged and construction_is_semantically_valid(construction):
        construction["reviewStatus"] = "validated"
        summary = validation_summary(construction.get("validation") or {})
        artifact(
            state,
            "final_repair_constraints",
            "复用已验证约束构造",
            summarize_constraint_validation(summary),
            summary.get("summary") or construction_detail(construction),
            {"construction": construction, "validationSummary": summary},
        )
        return {"construction": construction, "validationSummary": summary, "diagnostics": diagnostics}

    for attempt in range(1, max_attempts + 1):
        progress(state, "final_repair_constraints", f"求解并验证最终约束图（第 {attempt} 轮）", attempt=attempt)
        construction, summary, feedback = solve_validate_construction(
            state,
            construction=construction,
            spec=spec,
            stage="final_repair_constraints",
            attempt=attempt,
            review_status="final_validating",
        )
        last_summary = summary

        if construction_is_semantically_valid(construction):
            construction["reviewStatus"] = "validated"
            artifact(
                state,
                "final_repair_constraints",
                "最终约束构造验证通过",
                summarize_constraint_validation(summary),
                summary.get("summary") or construction_detail(construction),
                {"construction": construction, "validationSummary": summary},
                attempt=attempt,
            )
            return {"construction": construction, "validationSummary": summary, "diagnostics": diagnostics}

        can_repair = attempt < max_attempts
        artifact(
            state,
            "final_repair_constraints",
            "最终约束构造验证未通过",
            f"{summarize_constraint_validation(summary)}{' 将进入约束修复。' if can_repair else ' 已达到修复上限。'}",
            summary.get("summary") or "\n".join(item.get("message", "") for item in summary.get("failedItems") or []),
            {"construction": construction, "feedback": feedback, "validationSummary": summary},
            status="failed",
            attempt=attempt,
        )
        if not can_repair:
            construction["reviewStatus"] = "failed"
            return {
                "construction": construction,
                "validationSummary": last_summary,
                "diagnostics": diagnostics,
                "workflowStatus": "failed",
                "errorText": summary.get("summary") or "Geometry constraints did not satisfy the specification",
            }

        repaired = json_chat(
            state,
            GeometryConstructionDraftModel,
            "你是约束图修复 agent，只能修改对象、基础谓词约束和构造意图。",
            build_constraint_repair_prompt(spec, construction, feedback),
            "",
            compact_schema=True,
        )
        construction = normalize_construction(
            repaired.model_dump(),
            spec,
            review_status="repaired",
            diagnostics=diagnostics,
        )
        artifact(
            state,
            "final_repair_constraints",
            "修复后的约束构造",
            summarize_construction(construction),
            construction_detail(construction),
            {"construction": construction},
            attempt=attempt + 1,
        )

    return {
        "construction": construction,
        "validationSummary": last_summary,
        "diagnostics": diagnostics,
        "workflowStatus": "failed",
        "errorText": last_summary.get("summary") or "Geometry constraints did not satisfy the specification",
    }


def route_after_final_repair(state: GeometryState) -> str:
    if state.get("workflowStatus") == "failed":
        return "publish"
    return "scene_compile"


def scene_compile(state: GeometryState) -> Dict[str, Any]:
    progress(state, "scene_compile", "从 GeometryConstruction.solution 编译 GeometryScene")
    spec = state.get("reviewedSpec") or state["spec"]
    scene_dict = construction_to_scene(state["construction"], spec)
    artifact(
        state,
        "scene_compile",
        "GeometryScene 展示模型",
        summarize_scene(scene_dict),
        scene_detail(scene_dict),
        {"scene": scene_dict, "construction": state.get("construction") or {}},
    )
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
    construction = state["construction"]
    user = (
        "请为 Geometry Studio 生成自包含 Python/Matplotlib 代码。"
        "输入包含 reviewed GeometrySpec、已验证 GeometryConstruction、以及由该构造派生的 GeometryScene。"
        "GeometryConstruction 是唯一几何真相层，GeometryScene 是展示层；代码只能负责渲染、标注、中文教学表达和少量交互控件。"
        "不得重新摆点、不得移动点、不得改几何事实、不得从题干重新猜图、不得生成与 construction/scene 不一致的几何关系。"
        "允许导入 math、numpy、sympy、matplotlib.pyplot、matplotlib.patches、matplotlib.widgets。"
        "代码必须调用 plt.show()，图像只作为证明辅助图，保持克制、干净、易读。"
        "只绘制题目理解必需的核心点、核心线段、命名圆/弧和少量关键辅助线；隐藏非必要辅助对象。"
        "图中标签只放短标签：点名、圆名、极少量短关系符号。禁止把题设条件、审核事实、证明目标、步骤说明或长句写到图中。"
        "禁止生成 measure_text、fact_text、proof_text、summary_text 等事实说明框；禁止 ax.text/figtext/textbox 放多行条件清单。"
        "不要渲染 scene.constraints、scene.measurements、scene.annotations 为文字；这些解释属于右侧笔记，不属于图。"
        "除非题目要求数值计算，不要在图中显示距离、角度、坐标数值；不要用密集网格或拥挤图例。"
        "在代码中整理点、线、圆、弧等数据时必须使用 GeometryScene 的唯一 id 作为字典 key；label 只用于显示，不能作为 key。"
        "所有面向用户的 Matplotlib 文本必须中文；请设置中文字体回退并设置 axes.unicode_minus=False。"
        "不要读取文件、写入文件、启动进程或访问网络。\n\n"
        "Reviewed GeometrySpec:\n"
        + prompt_json(spec)
        + "\n\nFinal GeometryConstruction facts:\n"
        + construction_facts_text(construction)
        + "\n\nCompiled GeometryScene geometry primitives only:\n"
        + prompt_json(compact_scene_geometry_for_prompt(state["scene"]))
    )
    code = json_chat(
        state,
        CodeResultModel,
        "你是中文几何解题的 Matplotlib 代码生成 agent，只渲染已审核、已验证的几何构造事实。",
        user,
        compact_schema=True,
    )
    cleaned_code = sanitize_matplotlib_text_symbols(code.pythonCode.strip())
    cleaned_code = declutter_matplotlib_code(state, cleaned_code)
    artifact(
        state,
        "matplotlib_code_generate",
        "代码生成结果",
        summarize_code(cleaned_code),
        preview_text(cleaned_code, 520),
        {"code": cleaned_code},
    )
    return {"code": cleaned_code}


def code_has_visual_clutter(code: str) -> bool:
    text = code or ""
    lowered = text.lower()
    clutter_names = ("measure_text", "fact_text", "facts_text", "proof_text", "summary_text", "condition_text")
    clutter_phrases = ("已渲染的审核事实", "审核事实", "证明目标", "条件清单", "事实清单")
    if any(name in lowered for name in clutter_names):
        return True
    if any(phrase in text for phrase in clutter_phrases):
        return True
    if ("figtext" in lowered or ".text(" in lowered or "text_box" in lowered) and text.count("\\n") >= 4:
        return True
    return False


def declutter_matplotlib_code(state: GeometryState, code: str) -> str:
    if not code_has_visual_clutter(code):
        return code
    repaired = json_chat(
        state,
        RepairResultModel,
        "你是 Matplotlib 几何图清爽化 agent，只删除图面上的长文字说明和事实框，不改变几何对象。",
        (
            "请清理下面的 Python/Matplotlib 代码。必须保持所有点坐标、线段、圆、弧和几何事实不变。"
            "删除图中的多行事实说明框、审核事实清单、证明目标清单、measure_text/fact_text/proof_text/summary_text 等长文字。"
            "图中只保留点名、圆名和极少量短标签；题设条件与证明说明应留给右侧 Markdown 笔记，不要画在图里。"
            "不要读取文件、写入文件、启动进程或访问网络。\n\n"
            "GeometryScene geometry primitives:\n"
            + prompt_json(compact_scene_geometry_for_prompt(state.get("scene") or {}))
            + "\n\nCurrent code:\n"
            + code
        ),
        compact_schema=True,
    )
    return sanitize_matplotlib_text_symbols(repaired.pythonCode.strip())


def teaching_proof_generate(state: GeometryState) -> Dict[str, Any]:
    progress(state, "teaching_proof_generate", "教学证明生成")
    spec = state.get("reviewedSpec") or state["spec"]
    proof_user = (
        "请为这道几何题生成面向中文课堂的证明与解答。"
        "请以 reviewed GeometrySpec、最终 GeometryConstruction 和 GeometryScene 为事实来源。"
        "如果条件不足或图形存在歧义，只能用中文明确写出必要假设，不能编造题目没有给出的条件。"
        "证明应优先使用综合几何方法：圆周角、切线弦定理、相似、共圆、垂直/平行、幂、外心/中垂线、角追等。"
        "只有当你确认综合几何路线无法完成或会明显不可靠时，才允许使用解析法/坐标法；若使用解析法，必须先说明为什么几何法无法闭合。"
        "不要把解析坐标计算作为默认解法，不要用数值测量代替证明。"
        "proofMarkdown、proofSteps、classroomQuestions 都必须使用中文。\n\n"
        "proofMarkdown 建议包含 `## 解题思路`、`## 教学证明`、`## 解答` 三个部分。"
        "每一步证明都要说清依据。最终答案或结论必须单独明确写出。\n\n"
        "右侧笔记渲染规则：\n"
        + MATHJAX_MARKDOWN_RULES
        + "\n\nReviewed GeometrySpec:\n"
        + prompt_json(spec)
        + "\n\nFinal GeometryConstruction:\n"
        + construction_facts_text(state.get("construction") or {})
        + "\n\nCompiled GeometryScene:\n"
        + prompt_json(compact_scene_for_prompt(state["scene"]))
    )
    proof = json_chat(
        state,
        ProofResultModel,
        "你是 Geometry Studio 的中文几何教学证明 agent，只生成中文 Markdown+MathJax 证明与解答。",
        proof_user,
        compact_schema=True,
    )
    proof_markdown = sanitize_mathjax_markdown(proof.proofMarkdown, "教学证明")
    proof_steps = sanitize_proof_steps(proof.proofSteps)
    classroom_questions = sanitize_classroom_questions(proof.classroomQuestions)
    scene = dict(state["scene"])
    scene["proofSteps"] = proof_steps

    note_user = (
        "请把几何题规格、最终构造、展示场景和证明结果整理成 Geometry Studio 右侧笔记区的最终中文 Markdown。"
        "标题必须按下面顺序输出：\n"
        "## 题目\n## 已识别条件\n## 解题思路\n## 构造模型说明\n## 教学证明\n## 解答\n## 课堂提问\n\n"
        "`构造模型说明` 请说明对象-约束构造和 GeometryScene 如何帮助理解证明，不要说成题型命令或自由画图。"
        "整理笔记时保持证明的综合几何取向；不要把证明改写成默认坐标法或数值验证。"
        "只有 proofMarkdown 已明确采用解析法且说明几何路线无法闭合时，才保留解析法。"
        "\n\n右侧笔记渲染规则：\n"
        + MATHJAX_MARKDOWN_RULES
        + "\n\nReviewed GeometrySpec:\n"
        + prompt_json(spec)
        + "\n\nFinal GeometryConstruction:\n"
        + construction_facts_text(state.get("construction") or {})
        + "\n\nCompiled GeometryScene:\n"
        + prompt_json(compact_scene_for_prompt(scene))
        + "\n\nProof Markdown:\n"
        + proof_markdown
        + "\n\nClassroom questions:\n"
        + prompt_json(classroom_questions)
    )
    note = json_chat(
        state,
        NoteResultModel,
        "你负责撰写 Geometry Studio 右侧笔记区可直接渲染的中文几何解题笔记。",
        note_user,
        compact_schema=True,
    )
    note_markdown = sanitize_mathjax_markdown(note.noteMarkdown, "几何解题笔记")
    artifact(
        state,
        "teaching_proof_generate",
        "中文证明与笔记",
        summarize_markdown(note_markdown, classroom_questions),
        preview_text(note_markdown, 520),
        {
            "proofMarkdown": proof_markdown,
            "noteMarkdown": note_markdown,
            "classroomQuestions": classroom_questions,
        },
    )
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

    probe_result = command.get("probeResult") or {"ok": False, "errorText": "Missing probe result", "repairable": True}
    if probe_result.get("ok"):
        artifact(
            state,
            "runtime_check",
            "运行检查通过",
            f"第 {int(state.get('attempt') or 1)} 次运行检查通过。",
            "",
            {"probeResult": probe_result},
        )
        return {"probeResult": probe_result, "workflowStatus": "succeeded", "errorText": ""}

    attempt = int(state.get("attempt") or 1)
    diagnostics = list(state.get("diagnostics") or [])
    diagnostics.append(f"attempt {attempt} failed: {probe_result.get('errorText', '')}")
    max_attempts = int(state.get("maxAttempts") or 5)
    can_repair = bool(probe_result.get("repairable", True)) and attempt < max_attempts
    artifact(
        state,
        "runtime_check",
        "运行检查失败",
        f"第 {attempt} 次运行失败，{'将进入自我修正。' if can_repair else '已达到当前自动修复上限。'}",
        preview_text(str(probe_result.get("errorText", "")), 520),
        {"probeResult": probe_result, "diagnostics": diagnostics},
        status="failed",
    )
    if not can_repair:
        return {
            "probeResult": probe_result,
            "diagnostics": diagnostics,
            "workflowStatus": "failed",
            "errorText": probe_result.get("errorText", "Geometry model failed validation"),
        }

    return {"probeResult": probe_result, "diagnostics": diagnostics, "workflowStatus": "repairing", "attempt": attempt + 1}


def self_correct(state: GeometryState) -> Dict[str, Any]:
    progress(state, "self_correct", "自我修正")
    user = (
        "请修复这段 Python/Matplotlib 代码，使它能在 Geometry Studio 中成功运行，"
        "同时保持同一个 GeometryConstruction、GeometryScene 和中文教学意图。"
        "修复时不得改变点坐标、线段、圆或任何几何事实；只修复代码错误、布局问题或渲染细节。"
        "不要读取文件、写入文件、启动进程或访问网络。\n\n"
        "Final GeometryConstruction:\n"
        + construction_facts_text(state.get("construction") or {})
        + "\n\nGeometryScene:\n"
        + prompt_json(compact_scene_geometry_for_prompt(state.get("scene") or {}))
        + "\n\nRuntime or validation error:\n"
        + str((state.get("probeResult") or {}).get("errorText", ""))
        + "\n\nCurrent code:\n"
        + state.get("code", "")
        + "\n\nRendering policy:\n"
        + "修复代码时也必须保持图面简洁；如果现有代码含多行事实说明框、measure_text/fact_text/proof_text/summary_text 或密集文字标注，请删除它们。"
    )
    repaired = json_chat(
        state,
        RepairResultModel,
        "你是安全 Matplotlib 几何程序的自我修正 agent，并负责保持中文界面文本。",
        user,
        compact_schema=True,
    )
    diagnostics = list(state.get("diagnostics") or [])
    diagnostics.extend(repaired.repairNotes)
    cleaned_code = sanitize_matplotlib_text_symbols(repaired.pythonCode.strip())
    artifact(
        state,
        "self_correct",
        "修复结果",
        summarize_code(cleaned_code),
        "\n".join(repaired.repairNotes) or preview_text(cleaned_code, 520),
        {"code": cleaned_code, "repairNotes": repaired.repairNotes},
    )
    return {"code": cleaned_code, "diagnostics": diagnostics, "workflowStatus": "checking"}


def publish(state: GeometryState) -> Dict[str, Any]:
    progress(state, "publish", "发布")
    if state.get("workflowStatus") == "succeeded":
        result = result_from_state(state)
        artifact(
            state,
            "publish",
            "发布完成",
            "代码、几何规格、构造真相层、场景和中文笔记已准备写回当前场景。",
            "",
            {"result": result},
        )
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
            "repairable": bool(state.get("code") and state.get("scene")),
            "result": result_from_state(state),
        }
    )
    return {}


def route_after_runtime_check(state: GeometryState) -> str:
    if state.get("workflowStatus") == "repairing":
        return "self_correct"
    return "publish"


def build_geometry_graph():
    graph = StateGraph(GeometryState)
    graph.add_node("parse_spec", parse_spec)
    graph.add_node("build_constraint_construction", build_constraint_construction)
    graph.add_node("solve_constraint_graph", solve_constraint_graph)
    graph.add_node("teacher_review", teacher_review)
    graph.add_node("final_repair_constraints", final_repair_constraints)
    graph.add_node("scene_compile", scene_compile)
    graph.add_node("matplotlib_code_generate", matplotlib_code_generate)
    graph.add_node("teaching_proof_generate", teaching_proof_generate)
    graph.add_node("runtime_check", runtime_check)
    graph.add_node("self_correct", self_correct)
    graph.add_node("publish", publish)
    graph.add_edge(START, "parse_spec")
    graph.add_edge("parse_spec", "build_constraint_construction")
    graph.add_edge("build_constraint_construction", "solve_constraint_graph")
    graph.add_edge("solve_constraint_graph", "teacher_review")
    graph.add_edge("teacher_review", "final_repair_constraints")
    graph.add_conditional_edges(
        "final_repair_constraints",
        route_after_final_repair,
        {"scene_compile": "scene_compile", "publish": "publish"},
    )
    graph.add_edge("scene_compile", "matplotlib_code_generate")
    graph.add_edge("matplotlib_code_generate", "teaching_proof_generate")
    graph.add_edge("teaching_proof_generate", "runtime_check")
    graph.add_conditional_edges(
        "runtime_check",
        route_after_runtime_check,
        {"self_correct": "self_correct", "publish": "publish"},
    )
    graph.add_edge("self_correct", "runtime_check")
    graph.add_edge("publish", END)
    return graph.compile()


def build_repair_graph():
    graph = StateGraph(GeometryState)
    graph.add_node("self_correct", self_correct)
    graph.add_node("runtime_check", runtime_check)
    graph.add_node("publish", publish)
    graph.add_edge(START, "self_correct")
    graph.add_edge("self_correct", "runtime_check")
    graph.add_conditional_edges(
        "runtime_check",
        route_after_runtime_check,
        {"self_correct": "self_correct", "publish": "publish"},
    )
    graph.add_edge("publish", END)
    return graph.compile()


def describe_graph() -> None:
    emit(
        {
            "type": "graph_description",
            "nodes": GRAPH_NODES,
            "edges": [
                ["START", "parse_spec"],
                ["parse_spec", "build_constraint_construction"],
                ["build_constraint_construction", "solve_constraint_graph"],
                ["solve_constraint_graph", "teacher_review"],
                ["teacher_review", "final_repair_constraints"],
                ["final_repair_constraints", "scene_compile"],
                ["final_repair_constraints", "publish"],
                ["scene_compile", "matplotlib_code_generate"],
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


def run_repair_session(command: Dict[str, Any]) -> None:
    request = command["request"]
    diagnostics = list(request.get("diagnostics") or [])
    error_text = str(request.get("errorText") or "")
    if error_text:
        diagnostics.append("manual repair requested: " + error_text)
    state: GeometryState = {
        "sessionId": command["sessionId"],
        "sceneName": request["sceneName"],
        "imageDataUrl": request.get("imageDataUrl", ""),
        "problemText": request.get("problemText", ""),
        "currentCode": request.get("currentCode", ""),
        "maxAttempts": int(request.get("maxAttempts") or 3),
        "settings": request.get("settings") or {},
        "spec": request.get("spec") or {},
        "reviewedSpec": request.get("spec") or {},
        "construction": request.get("construction") or {},
        "scene": request.get("scene") or {},
        "code": request.get("currentCode", ""),
        "proofMarkdown": request.get("proofMarkdown", ""),
        "noteMarkdown": request.get("noteMarkdown", ""),
        "attempt": 1,
        "diagnostics": diagnostics,
        "probeResult": {
            "ok": False,
            "errorText": error_text or "用户要求继续修复当前几何代码。",
            "repairable": True,
        },
        "workflowStatus": "repairing",
        "errorText": error_text,
    }
    build_repair_graph().invoke(state)


def main() -> None:
    if "--describe-graph" in sys.argv:
        describe_graph()
        return

    command = read_command()
    if not command or command.get("type") not in {"start", "repair"}:
        emit({"type": "failed", "errorText": "Geometry agent expected a start or repair command"})
        return
    try:
        if command.get("type") == "repair":
            run_repair_session(command)
        else:
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
