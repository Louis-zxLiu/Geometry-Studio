from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import hashlib
import time
import traceback
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional

AGENT_DIR = Path(__file__).resolve().parent
if str(AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(AGENT_DIR))

from geometry_agent_lib.construction import spec_fingerprint, specs_match
from geometry_agent_lib.dsl_runtime import execute_geometry_dsl, strip_dsl_code
from geometry_agent_lib.llm_client import json_chat, text_chat
from geometry_agent_lib.prompt_payloads import compact_scene_for_prompt, compact_scene_geometry_for_prompt, prompt_json
from geometry_agent_lib.scene_compiler import compile_execution_to_scene, scene_with_spec_context
from geometry_agent_lib.schemas import (
    CodeResultModel,
    GeometrySpecModel,
    GeometryState,
    NoteResultModel,
    ProofResultModel,
    RepairResultModel,
)
from geometry_agent_lib.semantic_export import construction_facts_text
from geometry_agent_lib.text_utils import (
    preview_text,
    sanitize_classroom_questions,
    sanitize_geometry_spec_markdown,
    sanitize_matplotlib_text_symbols,
    sanitize_mathjax_markdown,
    sanitize_proof_steps,
    summarize_code,
    summarize_markdown,
    summarize_scene,
    summarize_spec,
)


PASS_THRESHOLD = 0.9

GRAPH_NODES = [
    "react_dsl_loop",
    "teacher_review",
    "post_review_react_loop",
    "scene_compile",
    "matplotlib_code_generate",
    "teaching_proof_generate",
    "runtime_check",
    "self_correct",
    "publish",
]

STAGE_DETAILS = {
    "react_dsl_loop": {
        "agentName": "ReAct DSL agent",
        "title": "DSL ReAct 构造",
        "description": "单个 VLM agent 迭代生成 GeoBuildBench DSL，并根据执行与验证反馈自我修正。",
    },
    "teacher_review": {
        "agentName": "教师审核",
        "title": "教师审核",
        "description": "在 VLM 认为可输出的最后一轮之后，请用户确认题意、DSL 构造和验证反馈。",
    },
    "post_review_react_loop": {
        "agentName": "审核后 DSL ReAct",
        "title": "审核后 DSL ReAct",
        "description": "教师接受时复用最终 DSL；教师修改规格时，按新规格重新运行 ReAct DSL 循环。",
    },
    "scene_compile": {
        "agentName": "场景编译",
        "title": "DSL 场景编译",
        "description": "从已执行 DSL 派生 GeometryScene 展示模型。",
    },
    "matplotlib_code_generate": {
        "agentName": "Matplotlib 生成",
        "title": "Matplotlib 代码生成",
        "description": "把 DSL 场景转换为可运行的中文教学图形代码。",
    },
    "teaching_proof_generate": {
        "agentName": "教学证明生成",
        "title": "教学证明生成",
        "description": "基于最终 DSL 和场景生成中文证明、解答和课堂笔记。",
    },
    "runtime_check": {
        "agentName": "运行检查",
        "title": "运行检查",
        "description": "实际运行生成代码，检查安全性、可执行性和动态控件要求。",
    },
    "self_correct": {
        "agentName": "自我修正",
        "title": "自我修正",
        "description": "根据运行错误修复 Matplotlib 代码。",
    },
    "publish": {
        "agentName": "发布",
        "title": "发布",
        "description": "输出最终代码、DSL、场景和笔记。",
    },
}


REACT_DSL_SYSTEM_PROMPT = """
You are a geometry construction agent. Generate GeoBuildBench DSL from Chinese geometry problems.

Use the ReAct pattern and output exactly:

**Thought:** concise reasoning

**Action:** generate_dsl | modify_dsl | final_answer

```dsl
complete DSL here
```

If you choose final_answer, include the final DSL code block unless the previous DSL is unchanged.

DSL syntax:
- command format: command : inputs -> outputs
- point : x y -> A
- point : line_or_circle_or_segment -> P
- segment : A B -> AB
- line : A B -> line_AB
- ray : A B -> ray_AB
- circle : O A -> circle_O
- circle : O 50 -> circle_O
- circle : A B C -> circle_ABC
- rotate : P 60 O -> Q
- midpoint : A B -> M
- parallel_line : P line_AB -> l
- orthogonal_line : P line_or_segment -> h
- intersect : object1 object2 -> P
- line_bisector : A B -> bis_AB
- angular_bisector : A B C -> bis_ABC
- distance : A B -> d
- angle : A B C -> angle_ABC
- polygon : A B C -> poly_ABC AB BC CA
- polygon : A B C D -> poly_ABCD AB BC CD DA

Unsupported commands:
- Do not use perpendicular_line; use orthogonal_line.
- Do not use circumcenter or circumcircle. Construct the circumcenter with two line_bisector commands and intersect them; construct the circle with circle : O A -> circle_O.
- Do not use incenter or incircle. Construct the incenter by intersecting angular_bisector lines.
- Do not use angle_bisector; the supported command name is angular_bisector.
- Do not use free-point syntax `point : -> P`; give coordinates or put the point on an existing object.

Rules:
1. Define before use.
2. Use problem labels whenever possible.
3. Create explicit segments for triangle and polygon edges. If a polygon object is required, use polygon with exactly one polygon output plus all side segment outputs.
4. Construct constraints geometrically. Do not invent assertion commands such as parallel/equality/perpendicular.
5. Use exact coordinates, rotation, intersections, centers, and helper lines when they make conditions true.
6. If execution or validation feedback reports missing objects, add explicit DSL objects with matching labels.
7. If validation feedback reports failed conditions, revise the construction rather than explaining the failure.
""".strip()


def stage_details(stage: str) -> Dict[str, str]:
    return STAGE_DETAILS.get(stage, {"agentName": "Geometry agent", "title": stage, "description": ""})


SENSITIVE_TEXT_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{12,}"),
    re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]{12,}"),
    re.compile(r"(?i)(api[_-]?key[\"'\s:=]+)[A-Za-z0-9._\-]{8,}"),
    re.compile(r"(?<=://)[^/@\s]+:[^/@\s]+@"),
]


def redact_sensitive_text(value: str) -> str:
    text = value
    text = SENSITIVE_TEXT_PATTERNS[0].sub("sk-***redacted***", text)
    text = SENSITIVE_TEXT_PATTERNS[1].sub(r"\1***redacted***", text)
    text = SENSITIVE_TEXT_PATTERNS[2].sub(r"\1***redacted***", text)
    text = SENSITIVE_TEXT_PATTERNS[3].sub("***redacted***@", text)
    return text


def redact_sensitive(value: Any) -> Any:
    if isinstance(value, dict):
        redacted: Dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            if key_text.lower() in {"apikey", "api_key", "key", "authorization", "token"}:
                redacted[key] = "***redacted***" if item else item
            else:
                redacted[key] = redact_sensitive(item)
        return redacted
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    if isinstance(value, tuple):
        return [redact_sensitive(item) for item in value]
    if isinstance(value, str):
        return redact_sensitive_text(value)
    return value


def emit(event: Dict[str, Any]) -> None:
    print(json.dumps(redact_sensitive(event), ensure_ascii=False), flush=True)


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
    validation_summary = dict(state.get("validationSummary") or (state.get("construction") or {}).get("validation") or {})
    return {
        "code": state.get("code", ""),
        "noteMarkdown": state.get("noteMarkdown", ""),
        "proofMarkdown": state.get("proofMarkdown", ""),
        "spec": state.get("reviewedSpec") or state.get("spec") or {},
        "construction": state.get("construction") or state.get("constructionDraft") or {},
        "scene": state.get("scene") or {},
        "diagnostics": list(state.get("diagnostics") or []),
        "validationSummary": validation_summary,
        "objectScore": float(validation_summary.get("objectScore") or validation_summary.get("objectCoverage") or 0.0),
        "conditionScore": float(validation_summary.get("conditionScore") or validation_summary.get("conditionCoverage") or 0.0),
        "totalScore": float(validation_summary.get("totalScore") or 0.0),
        "missingObjects": validation_summary.get("missingObjects") or {},
        "failedConditions": validation_summary.get("failedConditions") or [],
        "iterations": int(validation_summary.get("iterations") or len(state.get("reactAttempts") or [])),
    }


def initial_spec_from_state(state: GeometryState) -> Dict[str, Any]:
    existing = state.get("reviewedSpec") or state.get("spec")
    if isinstance(existing, dict) and existing.get("problemText"):
        return sanitize_geometry_spec_markdown(GeometrySpecModel.model_validate(existing).model_dump())
    problem_text = str(state.get("problemText") or "").strip()
    spec = {
        "problemText": problem_text,
        "goalText": "",
        "entities": [],
        "constraints": [],
        "constructionHints": [],
        "confidence": 0.9,
    }
    return GeometrySpecModel.model_validate(spec).model_dump()


def parse_react_response(response: str) -> Dict[str, str]:
    text = str(response or "").strip()
    thought_match = re.search(r"\*\*Thought:\*\*\s*(.*?)(?=\*\*Action:\*\*|$)", text, re.S | re.I)
    action_match = re.search(r"\*\*Action:\*\*\s*([A-Za-z_]+)", text, re.I)
    code_match = re.search(r"```(?:dsl|text)?\s*(.*?)```", text, re.S | re.I)
    thought = thought_match.group(1).strip() if thought_match else ""
    action = action_match.group(1).strip().lower() if action_match else "generate_dsl"
    if action not in {"generate_dsl", "modify_dsl", "final_answer"}:
        action = "generate_dsl"

    if code_match:
        dsl = code_match.group(1).strip()
    else:
        code_lines: List[str] = []
        for line in text.splitlines():
            stripped = line.strip()
            if "->" in stripped and ":" in stripped:
                code_lines.append(stripped)
        dsl = "\n".join(code_lines).strip()

    return {"thought": thought or "No thought provided.", "action": action, "dsl": strip_dsl_code(dsl), "raw": text}


def benchmark_problem_from_state(state: GeometryState) -> Optional[Dict[str, Any]]:
    problem = state.get("benchmarkProblem")
    return problem if isinstance(problem, dict) else None


def validation_passed(validation: Dict[str, Any]) -> bool:
    return bool(validation.get("success")) or (
        float(validation.get("object_score") or validation.get("objectCoverage") or 0.0) >= PASS_THRESHOLD
        and float(validation.get("condition_score") or validation.get("conditionCoverage") or 0.0) >= PASS_THRESHOLD
    )


def geobuildbench_root() -> Path:
    candidates = [
        Path.cwd() / "resources" / "GeoBuildBench",
        AGENT_DIR.parent.parent / "resources" / "GeoBuildBench",
    ]
    for candidate in candidates:
        if (candidate / "src" / "dsl" / "dsl_validator.py").exists():
            return candidate
    raise FileNotFoundError("GeoBuildBench validator is unavailable")


def safe_path_fragment(value: Any) -> str:
    text = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "").strip())
    return text.strip("._") or "geometry"


def image_data_url_from_base64(image_base64: str) -> str:
    value = str(image_base64 or "").strip()
    if not value:
        return ""
    if value.startswith("data:image/"):
        return value
    return "data:image/png;base64," + value


def render_image_dir_from_state(state: GeometryState) -> Path:
    configured = str(state.get("renderImageDir") or "").strip()
    if configured:
        return Path(configured)
    session = safe_path_fragment(state.get("sessionId") or state.get("sceneName") or "session")
    return Path(tempfile.gettempdir()) / "geometry-studio-react-images" / session


def quality_mode_from_state(state: GeometryState) -> str:
    mode = str(state.get("qualityMode") or "").strip().lower()
    return "fast" if mode == "fast" else "quality"


def react_cache_dir() -> Path:
    configured = os.environ.get("GEOMETRY_STUDIO_REACT_CACHE_DIR", "").strip()
    if configured:
        return Path(configured)
    return Path(tempfile.gettempdir()) / "geometry-studio-react-cache"


def react_cache_key(state: GeometryState, spec: Dict[str, Any]) -> str:
    settings = state.get("settings") or {}
    payload = {
        "version": 2,
        "specFingerprint": spec_fingerprint(spec),
        "benchmarkTargets": benchmark_constraint_targets(state),
        "imageHash": hashlib.sha256(str(state.get("imageDataUrl") or "").encode("utf-8")).hexdigest(),
        "model": str(settings.get("model") or ""),
        "qualityMode": quality_mode_from_state(state),
    }
    return hashlib.sha256(prompt_json(payload).encode("utf-8")).hexdigest()


def read_cached_react_dsl(state: GeometryState, spec: Dict[str, Any]) -> str:
    if state.get("runMode") == "benchmark":
        return ""
    path = react_cache_dir() / f"{react_cache_key(state, spec)}.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    return strip_dsl_code(str(payload.get("dslCode") or ""))


def write_cached_react_dsl(state: GeometryState, spec: Dict[str, Any], dsl_code: str, validation_summary: Dict[str, Any]) -> None:
    if state.get("runMode") == "benchmark" or not validation_summary.get("isValid"):
        return
    dsl = strip_dsl_code(dsl_code)
    if not dsl:
        return
    try:
        directory = react_cache_dir()
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{react_cache_key(state, spec)}.json"
        settings = state.get("settings") or {}
        payload = {
            "createdAt": time.time(),
            "model": str(settings.get("model") or ""),
            "qualityMode": quality_mode_from_state(state),
            "dslCode": dsl,
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        return


def render_dsl_with_geobuildbench(state: GeometryState, dsl_code: str) -> Dict[str, Any]:
    try:
        root = geobuildbench_root()
        root_text = str(root.resolve())
        if root_text not in sys.path:
            sys.path.insert(0, root_text)

        from src.dsl.dsl_executor import DSLExecutor

        image_dir = render_image_dir_from_state(state)
        image_dir.mkdir(parents=True, exist_ok=True)
        problem = benchmark_problem_from_state(state) or {}
        problem_id = safe_path_fragment(problem.get("id") or state.get("sceneName") or state.get("sessionId"))
        iteration = int(state.get("reactAttempt") or 0)
        result = DSLExecutor(save_images=True, image_dir=str(image_dir)).execute(
            dsl_code,
            problem_id=problem_id,
            iteration=iteration,
        )
        image_data_url = image_data_url_from_base64(result.image_base64 or "")
        return {
            "success": bool(result.success),
            "hasImage": bool(result.image_base64),
            "imageBase64": result.image_base64 or "",
            "imageDataUrl": image_data_url,
            "imagePath": result.image_path or "",
            "error": result.error or "",
            "stdout": result.stdout or "",
            "stderr": result.stderr or "",
            "numElements": len(result.construction.elements) if result.construction else 0,
            "executor": "geobuildbench",
        }
    except Exception as exc:
        return {
            "success": False,
            "hasImage": False,
            "imageBase64": "",
            "imageDataUrl": "",
            "imagePath": "",
            "error": f"{type(exc).__name__}: {exc}",
            "stdout": "",
            "stderr": "",
            "numElements": 0,
            "executor": "geobuildbench",
        }


def enrich_geobuildbench_validation(validation: Dict[str, Any]) -> Dict[str, Any]:
    next_validation = dict(validation or {})
    details = next_validation.get("details") if isinstance(next_validation.get("details"), dict) else {}
    condition_details = details.get("condition_details") if isinstance(details.get("condition_details"), list) else []
    enriched_failed: List[Dict[str, Any]] = []
    for detail in condition_details:
        if not isinstance(detail, dict) or detail.get("passed", False):
            continue
        condition = detail.get("condition") if isinstance(detail.get("condition"), dict) else {}
        failed = dict(condition)
        message = str(detail.get("message") or failed.get("message") or "")
        if message:
            failed["message"] = message
            failed["validation_message"] = message
        if detail.get("error_type"):
            failed["error_type"] = detail.get("error_type")
        if failed:
            enriched_failed.append(failed)
    if enriched_failed:
        next_validation["failed_conditions"] = enriched_failed
    return next_validation


def validate_dsl_with_geobuildbench(dsl_code: str, problem: Dict[str, Any]) -> Dict[str, Any]:
    root = geobuildbench_root()
    root_text = str(root.resolve())
    if root_text not in sys.path:
        sys.path.insert(0, root_text)

    from src.benchmark.benchmark_dataset import BenchmarkProblem
    from src.dsl.dsl_validator import DSLValidator

    problem_copy = deepcopy(problem)
    problem_obj = BenchmarkProblem.from_dict(problem_copy)
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
        handle.write(dsl_code)
        dsl_path = handle.name
    try:
        return enrich_geobuildbench_validation(DSLValidator().validate(dsl_path, problem_obj).to_dict())
    finally:
        try:
            os.unlink(dsl_path)
        except OSError:
            pass


def execute_and_validate_dsl(state: GeometryState, dsl_code: str) -> Dict[str, Any]:
    benchmark_problem = benchmark_problem_from_state(state)
    execution: Dict[str, Any] = {}
    scene: Dict[str, Any] = {}
    local_execution_error = ""
    try:
        execution = execute_geometry_dsl(dsl_code)
        scene = scene_with_spec_context(compile_execution_to_scene(execution), state.get("reviewedSpec") or state.get("spec") or {})
    except Exception as exc:
        local_execution_error = str(exc)

    rendering = render_dsl_with_geobuildbench(state, dsl_code)
    official_execution_error = str(rendering.get("error") or "")
    execution_error = official_execution_error if benchmark_problem is not None else local_execution_error

    if benchmark_problem is not None:
        try:
            validation = validate_dsl_with_geobuildbench(dsl_code, benchmark_problem)
            validation["validator"] = "geobuildbench"
            if local_execution_error:
                validation["local_runtime_error"] = local_execution_error
            if official_execution_error:
                validation["render_error"] = official_execution_error
        except Exception as exc:
            error_message = str(exc)
            if official_execution_error:
                error_message = f"{error_message}; GeoBuildBench executor: {official_execution_error}"
            elif local_execution_error:
                error_message = f"{error_message}; local runtime: {local_execution_error}"
            validation = {
                "success": False,
                "object_score": 0.0,
                "condition_score": 0.0,
                "total_score": 0.0,
                "missing_objects": {},
                "failed_conditions": [{"type": "validator_error", "message": error_message}],
                "error_message": error_message,
                "validator": "geobuildbench",
            }
    elif execution_error:
        validation = {
            "success": False,
            "object_score": 0.0,
            "condition_score": 0.0,
            "total_score": 0.0,
            "missing_objects": {},
            "failed_conditions": [{"type": "dsl_execution", "message": execution_error}],
            "error_message": execution_error,
            "validator": "geobuildbench_executor",
        }
    else:
        validation = {
            "success": True,
            "object_score": 1.0,
            "condition_score": 1.0,
            "total_score": 1.0,
            "missing_objects": {},
            "failed_conditions": [],
            "error_message": "",
            "validator": "dsl_runtime",
            "note": "DSL executed successfully. No GeoBuildBench problem object was provided, so teacher review is authoritative.",
        }
        if official_execution_error:
            validation["render_error"] = official_execution_error

    return {
        "execution": execution,
        "scene": scene,
        "validation": validation,
        "executionError": execution_error,
        "localExecutionError": local_execution_error,
        "rendering": rendering,
    }


def validation_summary_from_result(validation: Dict[str, Any], *, iterations: int) -> Dict[str, Any]:
    object_score = float(validation.get("object_score") or 0.0)
    condition_score = float(validation.get("condition_score") or 0.0)
    total_score = float(validation.get("total_score") or (0.3 * object_score + 0.7 * condition_score))
    missing_objects = validation.get("missing_objects") or {}
    failed_conditions = validation.get("failed_conditions") or []
    failed_items: List[Dict[str, Any]] = []

    for object_type, values in missing_objects.items():
        if values:
            failed_items.append(
                {
                    "severity": "error",
                    "target": str(object_type),
                    "message": f"Missing {object_type}: {values}",
                    "suggestedRepair": "Add explicit DSL objects with labels matching the problem.",
                }
            )
    for index, condition in enumerate(failed_conditions[:12], start=1):
        if isinstance(condition, dict):
            ctype = str(condition.get("type") or condition.get("condition_type") or f"condition_{index}")
            message = str(condition.get("message") or condition.get("validation_message") or condition)
        else:
            ctype = f"condition_{index}"
            message = str(condition)
        failed_items.append(
            {
                "severity": "error",
                "target": ctype,
                "message": message,
                "suggestedRepair": "Revise the DSL construction so the condition is satisfied geometrically.",
            }
        )

    status = "passed" if validation_passed(validation) else "not passed"
    summary = (
        f"GeoBuildBench validation {status}: object {object_score:.0%}, "
        f"condition {condition_score:.0%}, total {total_score:.0%}."
    )
    if validation.get("error_message"):
        summary += " " + str(validation.get("error_message"))
    elif validation.get("runtime_error"):
        summary += " Local preview runtime failed: " + str(validation.get("runtime_error"))
    elif validation.get("local_runtime_error"):
        summary += " Local GeometryScene preview failed: " + str(validation.get("local_runtime_error"))
    elif validation.get("render_error"):
        summary += " GeoBuildBench render failed: " + str(validation.get("render_error"))
    elif validation.get("note"):
        summary += " " + str(validation.get("note"))

    return {
        "isValid": validation_passed(validation),
        "objectCoverage": object_score,
        "conditionCoverage": condition_score,
        "summary": summary,
        "failedItems": failed_items,
        "repairInstructions": [item["suggestedRepair"] for item in failed_items],
        "objectScore": object_score,
        "conditionScore": condition_score,
        "totalScore": total_score,
        "missingObjects": missing_objects,
        "failedConditions": failed_conditions,
        "iterations": iterations,
        "validator": validation.get("validator", ""),
    }


def execution_objects_for_construction(execution: Dict[str, Any]) -> List[Dict[str, Any]]:
    objects = execution.get("objects") or {}
    result: List[Dict[str, Any]] = []
    for point in objects.get("points") or []:
        result.append(
            {
                "id": point.get("id", ""),
                "kind": "point",
                "role": "derived",
                "label": point.get("label", ""),
                "refs": [],
                "attributes": {"x": point.get("x", 0.0), "y": point.get("y", 0.0), "fixed": True},
            }
        )
    for segment in objects.get("segments") or []:
        result.append(
            {
                "id": segment.get("id", ""),
                "kind": "segment",
                "role": "derived",
                "label": segment.get("label", ""),
                "refs": [segment.get("from", ""), segment.get("to", "")],
                "attributes": {},
            }
        )
    for line in [*(objects.get("lines") or []), *(objects.get("rays") or [])]:
        result.append(
            {
                "id": line.get("id", ""),
                "kind": "line",
                "role": "derived",
                "label": line.get("id", ""),
                "refs": list(line.get("through") or []),
                "attributes": {},
            }
        )
    for circle in objects.get("circles") or []:
        refs = [circle.get("center", "")]
        if circle.get("through"):
            refs.append(circle.get("through", ""))
        result.append(
            {
                "id": circle.get("id", ""),
                "kind": "circle",
                "role": "derived",
                "label": circle.get("label", ""),
                "refs": refs,
                "attributes": {"radius": circle.get("radius", 0.0)},
            }
        )
    for polygon in objects.get("polygons") or []:
        if not isinstance(polygon, dict):
            continue
        result.append(
            {
                "id": polygon.get("id", ""),
                "kind": "polygon",
                "role": "derived",
                "label": polygon.get("label", ""),
                "refs": list(polygon.get("points") or []),
                "attributes": {},
            }
        )
    return result


def solution_from_execution(execution: Dict[str, Any], *, status: str, message: str, iterations: int) -> Dict[str, Any]:
    objects = execution.get("objects") or {}
    points = {
        str(point.get("id")): {"x": float(point.get("x") or 0.0), "y": float(point.get("y") or 0.0)}
        for point in objects.get("points") or []
        if isinstance(point, dict)
    }
    circles = {
        str(circle.get("id")): {
            "center": circle.get("center", ""),
            "through": circle.get("through", ""),
            "radius": float(circle.get("radius") or 0.0),
        }
        for circle in objects.get("circles") or []
        if isinstance(circle, dict)
    }
    return {
        "status": status,
        "points": points,
        "lines": {},
        "circles": circles,
        "arcs": {},
        "polygons": {},
        "residuals": [],
        "maxResidual": 0.0,
        "rmsResidual": 0.0,
        "iterations": iterations,
        "initializer": "geobuildbench_dsl",
        "message": message,
    }


def attempt_history_for_event(attempts: List[Dict[str, Any]], *, include_image_data: bool = False) -> List[Dict[str, Any]]:
    history: List[Dict[str, Any]] = []
    for attempt in attempts:
        summary = dict(attempt.get("validationSummary") or {})
        item = {
            "attempt": attempt.get("attempt"),
            "thought": attempt.get("thought", ""),
            "action": attempt.get("action", ""),
            "dsl": attempt.get("dsl", ""),
            "executionError": attempt.get("error", ""),
            "localExecutionError": attempt.get("localExecutionError", ""),
            "renderSuccess": bool(attempt.get("renderSuccess")),
            "renderedImagePath": attempt.get("renderedImagePath", ""),
            "renderError": attempt.get("renderError", ""),
            "validationSummary": summary,
        }
        if include_image_data:
            item["renderedImageDataUrl"] = attempt.get("renderedImageDataUrl", "")
        history.append(item)
    return history


def construction_from_react(
    dsl_code: str,
    execution: Dict[str, Any],
    validation_summary: Dict[str, Any],
    attempts: List[Dict[str, Any]],
    *,
    review_status: str,
    include_image_data: bool = False,
) -> Dict[str, Any]:
    latest = attempts[-1] if attempts else {}
    execution_ok = bool(execution)
    object_score = float(validation_summary.get("objectScore") or validation_summary.get("objectCoverage") or 0.0)
    condition_score = float(validation_summary.get("conditionScore") or validation_summary.get("conditionCoverage") or 0.0)
    total_score = float(validation_summary.get("totalScore") or 0.0)
    return {
        "version": 1,
        "dslCode": strip_dsl_code(dsl_code),
        "objects": execution_objects_for_construction(execution),
        "constraints": [],
        "constructionIntent": [
            {
                "id": "react_dsl",
                "summary": str(latest.get("thought") or "Generated by the ReAct DSL agent."),
                "objects": [],
                "constraints": [],
                "source": str(latest.get("action") or "generate_dsl"),
            }
        ],
        "solution": solution_from_execution(
            execution,
            status="executed" if execution_ok else "failed",
            message=str(latest.get("error") or ""),
            iterations=int(validation_summary.get("iterations") or len(attempts)),
        ),
        "validation": dict(validation_summary),
        "reviewStatus": review_status,
        "specFingerprint": "",
        "diagnostics": [],
        "objectScore": object_score,
        "conditionScore": condition_score,
        "totalScore": total_score,
        "missingObjects": validation_summary.get("missingObjects") or {},
        "failedConditions": validation_summary.get("failedConditions") or [],
        "iterations": int(validation_summary.get("iterations") or len(attempts)),
        "attemptHistory": attempt_history_for_event(attempts, include_image_data=include_image_data),
        "renderSuccess": bool(latest.get("renderSuccess")),
        "renderedImagePath": str(latest.get("renderedImagePath") or ""),
        "renderedImageDataUrl": str(latest.get("renderedImageDataUrl") or "") if include_image_data else "",
        "renderError": str(latest.get("renderError") or ""),
    }


def react_history_text(attempts: List[Dict[str, Any]]) -> str:
    if not attempts:
        return "This is the first attempt."
    chunks: List[str] = []
    for attempt in attempts[-3:]:
        validation = attempt.get("validationSummary") or {}
        raw_validation = attempt.get("validation") or {}
        missing_objects = validation.get("missingObjects") or raw_validation.get("missing_objects") or {}
        failed_conditions = validation.get("failedConditions") or raw_validation.get("failed_conditions") or []
        failed_items = validation.get("failedItems") or []
        chunks.append(
            "\n".join(
                [
                    f"Attempt {attempt.get('attempt')}: {attempt.get('action')}",
                    f"Thought: {preview_text(str(attempt.get('thought') or ''), 260)}",
                    f"Execution error: {attempt.get('error') or 'none'}",
                    f"GeoBuildBench render: {'image attached' if attempt.get('renderSuccess') else 'no image'}",
                    f"Render error: {attempt.get('renderError') or 'none'}",
                    f"Validation: {validation.get('summary') or 'none'}",
                    f"Missing objects JSON: {preview_text(prompt_json(missing_objects), 900)}",
                    f"Failed conditions JSON: {preview_text(prompt_json(failed_conditions), 1400)}",
                    f"Failed item messages JSON: {preview_text(prompt_json(failed_items), 900)}",
                    "DSL:",
                    preview_text(str(attempt.get("dsl") or ""), 1200),
                ]
            )
        )
    return "\n\n---\n\n".join(chunks)


def benchmark_constraint_targets(state: GeometryState) -> Dict[str, Any]:
    problem = benchmark_problem_from_state(state) or {}
    if not problem:
        return {}
    return {
        "problemId": problem.get("id", ""),
        "requiredObjects": problem.get("required_objects") or {},
        "verificationConditions": problem.get("verification_conditions") or [],
    }


def construction_constraints_from_state(state: GeometryState, spec: Dict[str, Any]) -> List[Dict[str, Any]]:
    constraints: List[Dict[str, Any]] = []
    for index, item in enumerate(spec.get("constraints") or [], start=1):
        if not isinstance(item, dict):
            continue
        constraints.append(
            {
                "id": f"spec_constraint_{index}",
                "type": item.get("type") or "relation",
                "args": item.get("args") or [],
                "text": item.get("text") or "",
                "source": "reviewed_spec",
            }
        )

    targets = benchmark_constraint_targets(state)
    for index, condition in enumerate(targets.get("verificationConditions") or [], start=1):
        if not isinstance(condition, dict):
            continue
        constraints.append(
            {
                "id": f"geobuildbench_condition_{index}",
                "type": condition.get("type") or "condition",
                "args": {key: value for key, value in condition.items() if key != "type"},
                "text": prompt_json(condition),
                "source": "geobuildbench",
            }
        )
    return constraints


def react_image_inputs(state: GeometryState, attempts: List[Dict[str, Any]]) -> List[str]:
    images: List[str] = []
    source_image = str(state.get("imageDataUrl") or "").strip()
    if source_image:
        images.append(source_image)
    if quality_mode_from_state(state) == "fast":
        return images[-1:]
    if attempts:
        rendered = str(attempts[-1].get("renderedImageDataUrl") or "").strip()
        if rendered:
            images.append(rendered)
    return images[-2:]


def build_react_user_prompt(state: GeometryState, spec: Dict[str, Any], attempts: List[Dict[str, Any]], attempt: int) -> str:
    problem_text = spec.get("problemText") or state.get("problemText") or ""
    goal_text = spec.get("goalText") or ""
    constraints = spec.get("constraints") or []
    hints = spec.get("constructionHints") or []
    benchmark_targets = benchmark_constraint_targets(state)
    benchmark_target_text = ""
    if benchmark_targets:
        benchmark_target_text = (
            "\nGeoBuildBench geometry constraint targets JSON. Satisfy these by construction; "
            "do not invent assertion commands:\n"
            + preview_text(prompt_json(benchmark_targets), 4200)
            + "\n\n"
        )
    image_note = ""
    if attempts and attempts[-1].get("renderSuccess"):
        image_note = "The most recent rendered DSL image is attached. Compare it against the problem and validation feedback.\n\n"
    elif attempts and attempts[-1].get("renderError"):
        image_note = "No rendered image is available because the previous DSL failed GeoBuildBench execution.\n\n"
    return (
        f"Problem:\n{problem_text}\n\n"
        f"Goal:\n{goal_text}\n\n"
        f"Reviewed constraints/hints JSON:\n{prompt_json({'constraints': constraints, 'hints': hints})}\n\n"
        + benchmark_target_text
        + image_note
        + f"Attempt {attempt}. Previous feedback:\n{react_history_text(attempts)}\n\n"
        + "Generate or revise the complete DSL. If the previous DSL is already ready, choose final_answer and include it."
    )


def react_dsl_loop(state: GeometryState, *, stage: str = "react_dsl_loop") -> Dict[str, Any]:
    spec = initial_spec_from_state(state)
    max_attempts = max(1, int(state.get("maxAttempts") or 5))
    attempts: List[Dict[str, Any]] = []
    current_dsl = ""
    current_execution: Dict[str, Any] = {}
    current_scene: Dict[str, Any] = {}
    current_summary: Dict[str, Any] = validation_summary_from_result(
        {
            "success": False,
            "object_score": 0.0,
            "condition_score": 0.0,
            "total_score": 0.0,
            "missing_objects": {},
            "failed_conditions": [],
        },
        iterations=0,
    )

    cached_dsl = read_cached_react_dsl(state, spec)
    if cached_dsl:
        progress(state, stage, "Reusing cached DSL for the same problem and model", attempt=1)
        eval_state = dict(state)
        eval_state["spec"] = spec
        eval_state["reactAttempt"] = 1
        eval_result = execute_and_validate_dsl(eval_state, cached_dsl)
        current_dsl = cached_dsl
        current_execution = eval_result["execution"]
        current_scene = eval_result["scene"]
        current_summary = validation_summary_from_result(eval_result["validation"], iterations=1)
        rendering = dict(eval_result.get("rendering") or {})
        attempt_record = {
            "attempt": 1,
            "thought": "Reused a cached DSL candidate for the same problem, image, model, and cost mode.",
            "action": "cached_dsl",
            "dsl": current_dsl,
            "raw": "",
            "error": eval_result["executionError"],
            "localExecutionError": eval_result.get("localExecutionError", ""),
            "validation": eval_result["validation"],
            "validationSummary": current_summary,
            "renderSuccess": bool(rendering.get("success") and rendering.get("hasImage")),
            "renderedImageDataUrl": rendering.get("imageDataUrl", ""),
            "renderedImagePath": rendering.get("imagePath", ""),
            "renderError": rendering.get("error", ""),
        }
        attempts.append(attempt_record)
        construction = construction_from_react(
            current_dsl,
            current_execution,
            current_summary,
            attempts,
            review_status="dsl_validated" if current_summary["isValid"] else "dsl_candidate",
            include_image_data=state.get("runMode") != "benchmark",
        )
        construction["specFingerprint"] = spec_fingerprint(spec)
        construction["constraints"] = construction_constraints_from_state(state, spec)
        artifact(
            state,
            stage,
            "Cached DSL candidate",
            current_summary.get("summary", ""),
            preview_text(current_dsl, 1400),
            {
                "constructionDraft": construction,
                "validationSummary": current_summary,
                "attempt": attempt_history_for_event([attempt_record], include_image_data=state.get("runMode") != "benchmark")[0],
            },
            status="completed" if current_summary["isValid"] else "failed",
            attempt=1,
        )
        if current_summary["isValid"]:
            return {
                "spec": spec,
                "specFingerprint": spec_fingerprint(spec),
                "constructionDraft": construction,
                "construction": construction,
                "validationSummary": current_summary,
                "reactAttempts": attempts,
                "scene": current_scene,
            }

    for attempt in range(len(attempts) + 1, max_attempts + 1):
        progress(state, stage, f"Running ReAct DSL attempt {attempt}/{max_attempts}", attempt=attempt)
        user_prompt = build_react_user_prompt(state, spec, attempts, attempt)
        response = text_chat(
            state,
            REACT_DSL_SYSTEM_PROMPT,
            user_prompt,
            react_image_inputs(state, attempts),
        )
        parsed = parse_react_response(response)
        action = parsed["action"]
        candidate_dsl = parsed["dsl"] or current_dsl

        if not candidate_dsl:
            eval_result = {
                "execution": {},
                "scene": {},
                "validation": {
                    "success": False,
                    "object_score": 0.0,
                    "condition_score": 0.0,
                    "total_score": 0.0,
                    "missing_objects": {},
                    "failed_conditions": [{"type": "empty_dsl", "message": "The response did not contain DSL code."}],
                    "error_message": "The response did not contain DSL code.",
                    "validator": "dsl_runtime",
                },
                "executionError": "The response did not contain DSL code.",
                "localExecutionError": "",
                "rendering": {},
            }
        else:
            eval_state = dict(state)
            eval_state["spec"] = spec
            eval_state["reactAttempt"] = attempt
            eval_result = execute_and_validate_dsl(eval_state, candidate_dsl)

        current_dsl = candidate_dsl or current_dsl
        current_execution = eval_result["execution"]
        current_scene = eval_result["scene"]
        current_summary = validation_summary_from_result(eval_result["validation"], iterations=attempt)
        rendering = dict(eval_result.get("rendering") or {})
        attempt_record = {
            "attempt": attempt,
            "thought": parsed["thought"],
            "action": action,
            "dsl": current_dsl,
            "raw": parsed["raw"],
            "error": eval_result["executionError"],
            "localExecutionError": eval_result.get("localExecutionError", ""),
            "validation": eval_result["validation"],
            "validationSummary": current_summary,
            "renderSuccess": bool(rendering.get("success") and rendering.get("hasImage")),
            "renderedImageDataUrl": rendering.get("imageDataUrl", ""),
            "renderedImagePath": rendering.get("imagePath", ""),
            "renderError": rendering.get("error", ""),
        }
        attempts.append(attempt_record)

        include_image_data = state.get("runMode") != "benchmark"
        construction = construction_from_react(
            current_dsl,
            current_execution,
            current_summary,
            attempts,
            review_status="dsl_validated" if current_summary["isValid"] else "dsl_candidate",
            include_image_data=include_image_data,
        )
        construction["specFingerprint"] = spec_fingerprint(spec)
        construction["constraints"] = construction_constraints_from_state(state, spec)
        artifact(
            state,
            stage,
            f"DSL attempt {attempt}",
            current_summary.get("summary", ""),
            preview_text(current_dsl, 1400),
            {
                "constructionDraft": construction,
                "validationSummary": current_summary,
                "attempt": attempt_history_for_event([attempt_record], include_image_data=include_image_data)[0],
            },
            status="completed" if current_summary["isValid"] else "failed",
            attempt=attempt,
        )

        if current_scene:
            emit(
                {
                    "type": "preview_updated",
                    "sessionId": state["sessionId"],
                    "sceneName": state["sceneName"],
                    "scene": current_scene,
                }
            )

        if current_summary["isValid"] or action == "final_answer":
            break

    final_construction = construction_from_react(
        current_dsl,
        current_execution,
        current_summary,
        attempts,
        review_status="dsl_validated" if current_summary["isValid"] else "dsl_candidate",
        include_image_data=state.get("runMode") != "benchmark",
    )
    final_construction["specFingerprint"] = spec_fingerprint(spec)
    final_construction["constraints"] = construction_constraints_from_state(state, spec)
    write_cached_react_dsl(state, spec, current_dsl, current_summary)
    return {
        "spec": spec,
        "specFingerprint": spec_fingerprint(spec),
        "constructionDraft": final_construction,
        "construction": final_construction,
        "validationSummary": current_summary,
        "scene": current_scene,
        "dslExecution": current_execution,
        "reactAttempts": attempts,
    }


def teacher_review(state: GeometryState) -> Dict[str, Any]:
    progress(
        state,
        "teacher_review",
        "Waiting for teacher review of the final DSL candidate",
        status="waiting",
        event_kind="review",
        artifact_title="Final DSL candidate",
        artifact_summary=(state.get("validationSummary") or {}).get("summary", ""),
        artifact_detail=preview_text((state.get("constructionDraft") or {}).get("dslCode", ""), 1600),
        artifact_data={
            "spec": state["spec"],
            "constructionDraft": state.get("constructionDraft") or {},
            "validationSummary": state.get("validationSummary") or {},
            "reactAttempts": state.get("reactAttempts") or [],
            "scene": state.get("scene") or {},
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
            "scene": state.get("scene") or {},
            "attemptHistory": attempt_history_for_event(list(state.get("reactAttempts") or []), include_image_data=True),
            "sourceImageDataUrl": state.get("imageDataUrl") or "",
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
        "Teacher review accepted",
        summarize_spec(reviewed),
        preview_text(reviewed.get("problemText", ""), 900),
        {"spec": reviewed},
    )
    return {"reviewedSpec": reviewed, "reviewedSpecFingerprint": spec_fingerprint(reviewed)}


def post_review_react_loop(state: GeometryState) -> Dict[str, Any]:
    spec = state.get("reviewedSpec") or state["spec"]
    if specs_match(state["spec"], spec):
        construction = dict(state.get("constructionDraft") or state.get("construction") or {})
        construction["reviewStatus"] = "teacher_reviewed"
        summary = dict(state.get("validationSummary") or construction.get("validation") or {})
        artifact(
            state,
            "post_review_react_loop",
            "Reusing reviewed DSL",
            summary.get("summary", "Teacher accepted the DSL candidate."),
            preview_text(construction.get("dslCode", ""), 1200),
            {"construction": construction, "validationSummary": summary},
        )
        return {"construction": construction, "validationSummary": summary, "scene": state.get("scene") or {}}

    artifact(
        state,
        "post_review_react_loop",
        "Reviewed spec changed",
        "Rerunning the ReAct DSL loop against the teacher-reviewed spec.",
        preview_text(spec.get("problemText", ""), 900),
        {"spec": spec},
    )
    rerun_state: GeometryState = dict(state)
    rerun_state["spec"] = spec
    rerun_state["reviewedSpec"] = spec
    rerun_state["reactAttempts"] = []
    result = react_dsl_loop(rerun_state, stage="post_review_react_loop")
    construction = dict(result.get("constructionDraft") or {})
    construction["reviewStatus"] = "teacher_reviewed_rerun"
    return {
        "construction": construction,
        "validationSummary": result.get("validationSummary") or {},
        "scene": result.get("scene") or {},
        "dslExecution": result.get("dslExecution") or {},
        "reactAttempts": result.get("reactAttempts") or [],
    }


def route_after_final_repair(state: GeometryState) -> str:
    return "scene_compile"


def scene_compile(state: GeometryState) -> Dict[str, Any]:
    progress(state, "scene_compile", "Compiling DSL into GeometryScene")
    spec = state.get("reviewedSpec") or state.get("spec") or {}
    construction = state.get("construction") or state.get("constructionDraft") or {}
    dsl_code = str(construction.get("dslCode") or "")
    scene_dict = dict(state.get("scene") or {})
    try:
        execution = execute_geometry_dsl(dsl_code)
        scene_dict = scene_with_spec_context(compile_execution_to_scene(execution), spec)
    except Exception as exc:
        if not scene_dict:
            raise RuntimeError(f"Cannot compile DSL scene: {exc}") from exc

    artifact(
        state,
        "scene_compile",
        "GeometryScene",
        summarize_scene(scene_dict),
        preview_text(dsl_code, 1200),
        {"scene": scene_dict, "construction": construction},
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


def dynamic_construction_prompt() -> str:
    return (
        "Dynamic construction mode is enabled. The generated Matplotlib code must include at least one "
        "matplotlib.widgets.Slider, a compute_geometry(params) function, an update callback, and a stable "
        "fallback when a parameter creates a degenerate figure. Complex constraints may use scipy.optimize "
        "least_squares with warm-start. Do not remove the Slider."
    )


def state_wants_dynamic_construction(state: GeometryState) -> bool:
    return (
        bool(state.get("dynamicConstruction"))
        or code_has_dynamic_controls(str(state.get("code") or ""))
        or code_has_dynamic_controls(str(state.get("currentCode") or ""))
    )


def build_matplotlib_code_prompt(state: GeometryState, spec: Dict[str, Any], construction: Dict[str, Any]) -> str:
    dynamic_policy = dynamic_construction_prompt() if state_wants_dynamic_construction(state) else ""
    return (
        "Generate self-contained Python/Matplotlib code for Geometry Studio.\n"
        "Use the compiled GeometryScene as the only geometric source of truth. Do not move points or invent facts.\n"
        "The code must call plt.show(). Keep the drawing clean: labels, essential segments, circles, arcs, and short annotations only.\n"
        "Do not read files, write files, start processes, or access the network.\n\n"
        + dynamic_policy
        + "\n\nReviewed GeometrySpec:\n"
        + prompt_json(spec)
        + "\n\nFinal DSL construction facts:\n"
        + construction_facts_text(construction)
        + "\n\nCompiled GeometryScene geometry primitives only:\n"
        + prompt_json(compact_scene_geometry_for_prompt(state["scene"]))
    )


def matplotlib_code_generate(state: GeometryState) -> Dict[str, Any]:
    progress(state, "matplotlib_code_generate", "Generating Matplotlib code")
    spec = state.get("reviewedSpec") or state["spec"]
    construction = state["construction"]
    code = json_chat(
        state,
        CodeResultModel,
        "You generate safe, self-contained Python/Matplotlib geometry teaching code.",
        build_matplotlib_code_prompt(state, spec, construction),
        compact_schema=True,
    )
    cleaned_code = sanitize_matplotlib_text_symbols(code.pythonCode.strip())
    cleaned_code = declutter_matplotlib_code(state, cleaned_code)
    artifact(
        state,
        "matplotlib_code_generate",
        "Generated code",
        summarize_code(cleaned_code),
        preview_text(cleaned_code, 520),
        {"code": cleaned_code},
    )
    return {"code": cleaned_code}


DYNAMIC_CONTROL_PATTERN = re.compile(r"(?i)(\bSlider\s*\(|matplotlib\.widgets\.Slider\b)")


def code_has_dynamic_controls(code: str) -> bool:
    return bool(DYNAMIC_CONTROL_PATTERN.search(code or ""))


def code_has_visual_clutter(code: str) -> bool:
    text = code or ""
    lowered = text.lower()
    clutter_names = ("measure_text", "fact_text", "facts_text", "proof_text", "summary_text", "condition_text")
    if any(name in lowered for name in clutter_names):
        return True
    return ("figtext" in lowered or ".text(" in lowered or "text_box" in lowered) and text.count("\\n") >= 4


def declutter_matplotlib_code(state: GeometryState, code: str) -> str:
    if not code_has_visual_clutter(code):
        return code
    repaired = json_chat(
        state,
        RepairResultModel,
        "You remove long fact/proof text boxes from Matplotlib code without changing geometry.",
        (
            "Clean the code below. Preserve all geometry, coordinates, objects, and plt.show(). "
            "Remove long on-canvas fact boxes, measure_text/fact_text/proof_text/summary_text, and dense text blocks.\n\n"
            "GeometryScene geometry primitives:\n"
            + prompt_json(compact_scene_geometry_for_prompt(state.get("scene") or {}))
            + "\n\nCurrent code:\n"
            + code
        ),
        compact_schema=True,
    )
    return sanitize_matplotlib_text_symbols(repaired.pythonCode.strip())


def teaching_proof_generate(state: GeometryState) -> Dict[str, Any]:
    progress(state, "teaching_proof_generate", "Generating teaching proof")
    spec = state.get("reviewedSpec") or state["spec"]
    construction = state.get("construction") or {}
    proof_user = (
        "Generate a concise Chinese Markdown proof and answer for the geometry problem. "
        "Use the reviewed spec, final DSL, and compiled scene as facts. Do not invent unstated conditions.\n\n"
        "Reviewed GeometrySpec:\n"
        + prompt_json(spec)
        + "\n\nFinal DSL construction:\n"
        + construction_facts_text(construction)
        + "\n\nCompiled GeometryScene:\n"
        + prompt_json(compact_scene_for_prompt(state["scene"]))
    )
    proof = json_chat(
        state,
        ProofResultModel,
        "You write Chinese Markdown geometry proofs for Geometry Studio.",
        proof_user,
        compact_schema=True,
    )
    proof_markdown = sanitize_mathjax_markdown(proof.proofMarkdown, "教学证明")
    proof_steps = sanitize_proof_steps(proof.proofSteps)
    classroom_questions = sanitize_classroom_questions(proof.classroomQuestions)
    scene = dict(state["scene"])
    scene["proofSteps"] = proof_steps

    note_user = (
        "Create the final Chinese Markdown note for the right notebook. Include sections: "
        "## 题目, ## 已识别条件, ## 解题思路, ## 构造模型说明, ## 教学证明, ## 解答, ## 课堂提问.\n\n"
        "Reviewed GeometrySpec:\n"
        + prompt_json(spec)
        + "\n\nFinal DSL construction:\n"
        + construction_facts_text(construction)
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
        "You write concise Chinese classroom notes for Geometry Studio.",
        note_user,
        compact_schema=True,
    )
    note_markdown = sanitize_mathjax_markdown(note.noteMarkdown, "几何解题笔记")
    artifact(
        state,
        "teaching_proof_generate",
        "Proof and note",
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
    progress(state, "runtime_check", "Checking generated code")
    emit(
        {
            "type": "runtime_probe",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "code": state.get("code", ""),
            "attempt": int(state.get("attempt") or 1),
            "dynamicConstruction": state_wants_dynamic_construction(state),
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
        artifact(state, "runtime_check", "Runtime check passed", "Generated code ran successfully.", "", {"probeResult": probe_result})
        return {"probeResult": probe_result, "workflowStatus": "succeeded", "errorText": ""}

    attempt = int(state.get("attempt") or 1)
    diagnostics = list(state.get("diagnostics") or [])
    diagnostics.append(f"attempt {attempt} failed: {probe_result.get('errorText', '')}")
    max_attempts = int(state.get("maxAttempts") or 5)
    can_repair = bool(probe_result.get("repairable", True)) and attempt < max_attempts
    artifact(
        state,
        "runtime_check",
        "Runtime check failed",
        "Will repair generated code." if can_repair else "Automatic repair limit reached.",
        preview_text(str(probe_result.get("errorText", "")), 520),
        {"probeResult": probe_result, "diagnostics": diagnostics},
        status="failed",
    )
    if not can_repair:
        return {
            "probeResult": probe_result,
            "diagnostics": diagnostics,
            "workflowStatus": "failed",
            "errorText": probe_result.get("errorText", "Geometry code failed validation"),
        }

    return {"probeResult": probe_result, "diagnostics": diagnostics, "workflowStatus": "repairing", "attempt": attempt + 1}


def dynamic_self_correct_policy(state: GeometryState) -> str:
    if not state_wants_dynamic_construction(state):
        return ""
    return (
        "\n\nDynamic construction repair policy: keep at least one Slider, keep compute_geometry(params), "
        "keep update(...), and do not collapse parameterized code into a static plot."
    )


def self_correct(state: GeometryState) -> Dict[str, Any]:
    progress(state, "self_correct", "Repairing generated code")
    user = (
        "Repair this Python/Matplotlib code so it runs in Geometry Studio. Preserve the same DSL construction and scene. "
        "Do not read files, write files, start processes, or access the network.\n\n"
        "Final DSL construction:\n"
        + construction_facts_text(state.get("construction") or {})
        + "\n\nGeometryScene:\n"
        + prompt_json(compact_scene_geometry_for_prompt(state.get("scene") or {}))
        + "\n\nRuntime error:\n"
        + str((state.get("probeResult") or {}).get("errorText", ""))
        + "\n\nCurrent code:\n"
        + state.get("code", "")
        + dynamic_self_correct_policy(state)
    )
    repaired = json_chat(
        state,
        RepairResultModel,
        "You repair safe Python/Matplotlib geometry code.",
        user,
        compact_schema=True,
    )
    diagnostics = list(state.get("diagnostics") or [])
    diagnostics.extend(repaired.repairNotes)
    cleaned_code = sanitize_matplotlib_text_symbols(repaired.pythonCode.strip())
    artifact(
        state,
        "self_correct",
        "Code repair",
        summarize_code(cleaned_code),
        "\n".join(repaired.repairNotes) or preview_text(cleaned_code, 520),
        {"code": cleaned_code, "repairNotes": repaired.repairNotes},
    )
    return {"code": cleaned_code, "diagnostics": diagnostics, "workflowStatus": "checking"}


def publish(state: GeometryState) -> Dict[str, Any]:
    progress(state, "publish", "Publishing")
    result = result_from_state(state)
    if state.get("workflowStatus") == "succeeded":
        artifact(state, "publish", "Publish complete", "Geometry workflow completed.", "", {"result": result})
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
            "result": result,
        }
    )
    return {}


def emit_benchmark_terminal(state: GeometryState) -> None:
    result = result_from_state(state)
    valid = bool((state.get("validationSummary") or {}).get("isValid"))
    event: Dict[str, Any] = {
        "type": "succeeded" if valid else "failed",
        "sessionId": state["sessionId"],
        "sceneName": state["sceneName"],
        "result": result,
    }
    if not valid:
        event["errorText"] = (state.get("validationSummary") or {}).get("summary", "GeoBuildBench validation failed")
        event["diagnostics"] = list(state.get("diagnostics") or [])
        event["repairable"] = False
    emit(event)


def run_interactive_session(state: GeometryState) -> None:
    state.update(react_dsl_loop(state))
    state.update(teacher_review(state))
    state.update(post_review_react_loop(state))
    state.update(scene_compile(state))
    state.update(matplotlib_code_generate(state))
    state.update(teaching_proof_generate(state))

    while True:
        state.update(runtime_check(state))
        if state.get("workflowStatus") != "repairing":
            break
        state.update(self_correct(state))

    publish(state)


def run_benchmark_session(state: GeometryState) -> None:
    state.update(react_dsl_loop(state))
    state["construction"] = state.get("constructionDraft") or {}
    state["workflowStatus"] = "succeeded" if (state.get("validationSummary") or {}).get("isValid") else "failed"
    state["errorText"] = "" if state["workflowStatus"] == "succeeded" else (state.get("validationSummary") or {}).get("summary", "")
    emit_benchmark_terminal(state)


def describe_graph() -> None:
    emit(
        {
            "type": "graph_description",
            "nodes": GRAPH_NODES,
            "edges": [
                ["START", "react_dsl_loop"],
                ["react_dsl_loop", "teacher_review"],
                ["teacher_review", "post_review_react_loop"],
                ["post_review_react_loop", "scene_compile"],
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
        "dynamicConstruction": bool(request.get("dynamicConstruction")),
        "maxAttempts": int(request.get("maxAttempts") or 5),
        "settings": request.get("settings") or {},
        "attempt": 1,
        "diagnostics": [],
        "workflowStatus": "working",
        "runMode": request.get("runMode") or "interactive",
        "qualityMode": request.get("qualityMode") or "quality",
        "benchmarkProblem": request.get("benchmarkProblem") or None,
        "renderImageDir": request.get("renderImageDir") or "",
    }
    if state.get("runMode") == "benchmark":
        run_benchmark_session(state)
    else:
        run_interactive_session(state)


def run_repair_session(command: Dict[str, Any]) -> None:
    request = command["request"]
    diagnostics = list(request.get("diagnostics") or [])
    error_text = str(request.get("errorText") or "")
    if error_text:
        diagnostics.append("manual repair requested: " + error_text)
    current_code = str(request.get("currentCode") or "")
    state: GeometryState = {
        "sessionId": command["sessionId"],
        "sceneName": request["sceneName"],
        "imageDataUrl": request.get("imageDataUrl", ""),
        "problemText": request.get("problemText", ""),
        "currentCode": current_code,
        "dynamicConstruction": bool(request.get("dynamicConstruction")) or code_has_dynamic_controls(current_code),
        "maxAttempts": int(request.get("maxAttempts") or 3),
        "settings": request.get("settings") or {},
        "spec": request.get("spec") or {},
        "reviewedSpec": request.get("spec") or {},
        "construction": request.get("construction") or {},
        "scene": request.get("scene") or {},
        "code": current_code,
        "proofMarkdown": request.get("proofMarkdown", ""),
        "noteMarkdown": request.get("noteMarkdown", ""),
        "attempt": 1,
        "diagnostics": diagnostics,
        "probeResult": {"ok": False, "errorText": error_text or "User requested code repair.", "repairable": True},
        "workflowStatus": "repairing",
        "errorText": error_text,
        "qualityMode": request.get("qualityMode") or "quality",
        "renderImageDir": request.get("renderImageDir") or "",
    }
    while True:
        state.update(self_correct(state))
        state.update(runtime_check(state))
        if state.get("workflowStatus") != "repairing":
            break
    publish(state)


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
