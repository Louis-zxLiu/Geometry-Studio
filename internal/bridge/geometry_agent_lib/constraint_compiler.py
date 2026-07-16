from __future__ import annotations

import json
from typing import Any, Dict, List, Mapping

from .constraint_schema import GeometryConstructionModel
from .constraint_solver import solve_constraint_construction
from .construction import spec_fingerprint


def normalize_construction(
    payload: Mapping[str, Any],
    spec: Mapping[str, Any],
    *,
    review_status: str,
    diagnostics: List[str] | None = None,
) -> Dict[str, Any]:
    data = dict(payload or {})
    if "constructionIntent" not in data and "intent" in data:
        data["constructionIntent"] = data.get("intent")
    data.setdefault("version", 1)
    data.setdefault("dslCode", "")
    data.setdefault("objects", [])
    data.setdefault("constraints", [])
    data.setdefault("constructionIntent", [])
    data.setdefault("solution", {})
    data.setdefault("validation", {})
    data["reviewStatus"] = review_status
    data["specFingerprint"] = spec_fingerprint(dict(spec))
    data["diagnostics"] = list(diagnostics or data.get("diagnostics") or [])
    normalize_shape_metadata(data, spec)
    relax_implicit_orientation_constraints(data, spec)
    demote_point_distinct_constraints(data)
    demote_semantic_goal_constraints(data)
    data["diagnostics"].extend(branch_hardcoding_issues(data, spec))
    if not data.get("dslCode"):
        data["dslCode"] = construction_debug_summary(data)
    return GeometryConstructionModel.model_validate(data).model_dump()


def normalize_shape_metadata(data: Dict[str, Any], spec: Mapping[str, Any]) -> None:
    expected_shape = quadrilateral_shape_from_spec(spec)
    if expected_shape != "convex":
        return
    for obj in data.get("objects") or []:
        if not isinstance(obj, dict):
            continue
        attrs = obj.get("attributes") if isinstance(obj.get("attributes"), dict) else {}
        label = str(obj.get("label") or "")
        shape = str(attrs.get("shape") or "").strip().lower()
        if "凹四边形" in label or shape in {"concave", "凹四边形", "凹"}:
            obj["label"] = label.replace("凹四边形", "凸四边形") or "凸四边形"
            obj.setdefault("attributes", {})["shape"] = "convex"
            data.setdefault("diagnostics", []).append(
                f"题意为凸四边形，已修正对象 {obj.get('id') or '<unknown>'} 的凹四边形标签/属性。"
            )
    for constraint in data.get("constraints") or []:
        if not isinstance(constraint, dict):
            continue
        ctype = str(constraint.get("type") or "").strip().lower()
        if ctype != "concave_quadrilateral":
            continue
        constraint["type"] = "convex_quadrilateral"
        constraint["text"] = "四边形 ABCD 为凸四边形。"
        data.setdefault("diagnostics", []).append(
            f"题意为凸四边形，已将约束 {constraint.get('id') or '<unknown>'} 从 concave_quadrilateral 改为 convex_quadrilateral。"
        )


def relax_implicit_orientation_constraints(data: Dict[str, Any], spec: Mapping[str, Any]) -> None:
    if spec_mentions_directed_orientation(spec):
        return
    changed: List[str] = []
    for constraint in data.get("constraints") or []:
        if not isinstance(constraint, dict):
            continue
        if str(constraint.get("type") or "").strip().lower() != "orientation":
            continue
        args = constraint.get("args")
        if not isinstance(args, dict):
            continue
        value = str(args.get("value") or args.get("orientation") or args.get("sign") or "").strip().lower()
        if value not in {"ccw", "cw", "counterclockwise", "clockwise", "positive", "negative"}:
            continue
        args["value"] = "auto"
        args.pop("orientation", None)
        args.pop("sign", None)
        changed.append(str(constraint.get("id") or "orientation"))
    if changed:
        diagnostics = data.setdefault("diagnostics", [])
        diagnostics.append(
            "已将未由题意明确指定方向的 orientation 分支约束改为 auto，避免硬编码 ccw/cw 导致可行构型冲突："
            + ", ".join(changed)
        )


POINT_DISTINCT_CONSTRAINT_TYPES = {
    "distinct_points",
    "distinct_point",
    "different_points",
    "not_equal",
    "not_equals",
    "not_same_point",
    "points_distinct",
}


SEMANTIC_GOAL_CONSTRAINT_TYPES = {
    "fixed_point",
    "fixed_target",
    "invariant",
    "invariant_point",
    "constant_point",
}


def demote_point_distinct_constraints(data: Dict[str, Any]) -> None:
    changed: List[str] = []
    for constraint in data.get("constraints") or []:
        if not isinstance(constraint, dict):
            continue
        ctype = normalized_constraint_type(str(constraint.get("type") or ""))
        if ctype not in POINT_DISTINCT_CONSTRAINT_TYPES:
            continue
        constraint["required"] = False
        constraint["weight"] = 0.0
        changed.append(str(constraint.get("id") or ctype))
    if changed:
        data.setdefault("diagnostics", []).append(
            "已将点不等/端点排除约束从 required 数值约束降级为语义提示："
            + ", ".join(changed)
            + "。请改用 on+order、same_side/opposite_sides、orientation:auto 或其它已支持谓词表达真实分支。"
        )


def demote_semantic_goal_constraints(data: Dict[str, Any]) -> None:
    changed: List[str] = []
    for constraint in data.get("constraints") or []:
        if not isinstance(constraint, dict):
            continue
        ctype = normalized_constraint_type(str(constraint.get("type") or ""))
        if ctype not in SEMANTIC_GOAL_CONSTRAINT_TYPES:
            continue
        constraint["required"] = False
        constraint["weight"] = 0.0
        changed.append(str(constraint.get("id") or ctype))
    if changed:
        data.setdefault("diagnostics", []).append(
            "已将定点/不变量目标约束标记为语义目标，不参与数值求解："
            + ", ".join(changed)
            + "。证明文本仍需证明这些目标。"
        )


def branch_hardcoding_issues(data: Mapping[str, Any], spec: Mapping[str, Any]) -> List[str]:
    issues: List[str] = []
    expected_shape = quadrilateral_shape_from_spec(spec)
    for constraint in data.get("constraints") or []:
        if not isinstance(constraint, dict):
            continue
        ctype = str(constraint.get("type") or "").strip().lower()
        text = " ".join(
            str(part or "")
            for part in (
                constraint.get("id"),
                constraint.get("text"),
                constraint.get("source"),
            )
        )
        if ctype == "orientation":
            args = constraint.get("args") if isinstance(constraint.get("args"), dict) else {}
            value = str(args.get("value") or args.get("orientation") or args.get("sign") or "").strip().lower()
            if value in {"ccw", "cw", "clockwise", "counterclockwise", "positive", "negative"} and not spec_mentions_directed_orientation(spec):
                issues.append(
                    f"约束 {constraint.get('id') or '<unknown>'} 使用未由题意指定的固定 orientation 分支 {value}；应改为 auto 或真实侧向关系。"
                )
        if expected_shape == "convex" and ctype in {"same_side", "opposite_sides"} and contains_any(
            text,
            ("凹四边形", "concave", "凸四边形", "convex"),
        ):
            issues.append(
                f"约束 {constraint.get('id') or '<unknown>'} 用 {ctype} 表达四边形凸凹分支；凸四边形应使用 convex_quadrilateral，避免硬编码侧向分支。"
            )
    return issues


def quadrilateral_shape_from_spec(spec: Mapping[str, Any]) -> str:
    text_parts = [
        str(spec.get("problemText") or ""),
        str(spec.get("goalText") or ""),
    ]
    for entity in spec.get("entities") or []:
        if isinstance(entity, dict):
            text_parts.append(str(entity.get("label") or ""))
            attrs = entity.get("attributes") if isinstance(entity.get("attributes"), dict) else {}
            text_parts.append(str(attrs.get("shape") or ""))
    for item in spec.get("constraints") or []:
        if isinstance(item, dict):
            text_parts.append(str(item.get("text") or ""))
            text_parts.append(str(item.get("type") or ""))
    text = " ".join(text_parts).lower()
    if contains_any(text, ("凸四边形", "convex_quadrilateral", "convex quadrilateral")):
        return "convex"
    if contains_any(text, ("凹四边形", "concave_quadrilateral", "concave quadrilateral")):
        return "concave"
    return ""


def contains_any(text: str, markers: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(marker.lower() in lowered for marker in markers)


def normalized_constraint_type(value: str) -> str:
    return "".join(char if char.isalnum() else "_" for char in value.strip().lower()).strip("_")


def spec_mentions_directed_orientation(spec: Mapping[str, Any]) -> bool:
    text_parts = [
        str(spec.get("problemText") or ""),
        str(spec.get("goalText") or ""),
    ]
    for item in spec.get("constraints") or []:
        if isinstance(item, dict):
            text_parts.append(str(item.get("text") or ""))
            text_parts.append(str(item.get("type") or ""))
    text = " ".join(text_parts).lower()
    markers = (
        "顺时针",
        "逆时针",
        "clockwise",
        "counterclockwise",
        "counter-clockwise",
        "ccw",
        "cw",
        "有向",
        "取向",
    )
    return any(marker in text for marker in markers)


def solve_and_summarize(construction: Mapping[str, Any]) -> Dict[str, Any]:
    next_construction = dict(construction)
    solution = solve_constraint_construction(next_construction)
    next_construction["solution"] = solution
    validation = solver_validation(next_construction)
    next_construction["validation"] = validation
    if not next_construction.get("dslCode"):
        next_construction["dslCode"] = construction_debug_summary(next_construction)
    return GeometryConstructionModel.model_validate(next_construction).model_dump()


def construction_is_numerically_usable(construction: Mapping[str, Any]) -> bool:
    validation = construction.get("validation") or {}
    solution = construction.get("solution") or {}
    return bool(validation.get("solverOk")) and solution.get("status") in {"solved", "underconstrained"}


def construction_is_semantically_valid(construction: Mapping[str, Any]) -> bool:
    validation = construction.get("validation") or {}
    return bool(validation.get("isValid")) and construction_is_numerically_usable(construction)


def solver_validation(construction: Mapping[str, Any]) -> Dict[str, Any]:
    solution = construction.get("solution") or {}
    residuals = [item for item in solution.get("residuals") or [] if isinstance(item, dict)]
    failed = [item for item in residuals if item.get("message") or not item.get("ok")]
    constraints = [item for item in construction.get("constraints") or [] if isinstance(item, dict)]
    objects = [item for item in construction.get("objects") or [] if isinstance(item, dict)]
    solver_ok = solution.get("status") in {"solved", "underconstrained"} and not failed
    check_count = len(residuals) or len(constraints)
    condition_coverage = 1.0 if not check_count else max(0.0, 1.0 - len(failed) / check_count)
    object_coverage = 1.0 if objects else 0.0
    summary = (
        f"约束求解{'通过' if solver_ok else '未通过'}；"
        f"状态 {solution.get('status') or 'unknown'}，"
        f"最大残差 {float(solution.get('maxResidual') or 0.0):.2e}，"
        f"RMS {float(solution.get('rmsResidual') or 0.0):.2e}。"
    )
    failed_items = [
        {
            "severity": "error" if item.get("message") else "warning",
            "target": str(item.get("constraintId") or item.get("type") or ""),
            "message": str(item.get("message") or f"残差 {float(item.get('value') or 0.0):.2e} 超出阈值"),
            "suggestedRepair": "请调整该对象或约束的引用、谓词类型、数值或构造意图。",
        }
        for item in failed
    ]
    return {
        "isValid": solver_ok,
        "solverOk": solver_ok,
        "semanticOk": False,
        "objectCoverage": object_coverage,
        "conditionCoverage": condition_coverage,
        "summary": summary,
        "failedItems": failed_items,
        "repairInstructions": [item["suggestedRepair"] for item in failed_items],
        "residualSummary": {
            "status": solution.get("status") or "unknown",
            "maxResidual": float(solution.get("maxResidual") or 0.0),
            "rmsResidual": float(solution.get("rmsResidual") or 0.0),
            "iterations": int(solution.get("iterations") or 0),
        },
    }


def merge_semantic_validation(construction: Mapping[str, Any], semantic_validation: Mapping[str, Any]) -> Dict[str, Any]:
    next_construction = dict(construction)
    solver = dict(next_construction.get("validation") or {})
    semantic_ok = bool(semantic_validation.get("isValid"))
    solver_ok = bool(solver.get("solverOk"))
    failed_items = list(solver.get("failedItems") or [])
    failed_items.extend(list(semantic_validation.get("failedItems") or []))
    repair_instructions = list(solver.get("repairInstructions") or [])
    repair_instructions.extend(list(semantic_validation.get("repairInstructions") or []))
    object_coverage = min(
        float(solver.get("objectCoverage") or 0.0),
        float(semantic_validation.get("objectCoverage") or 0.0),
    )
    condition_coverage = min(
        float(solver.get("conditionCoverage") or 0.0),
        float(semantic_validation.get("conditionCoverage") or 0.0),
    )
    summary_parts = [str(solver.get("summary") or "").strip(), str(semantic_validation.get("summary") or "").strip()]
    solver["isValid"] = solver_ok and semantic_ok
    solver["semanticOk"] = semantic_ok
    solver["objectCoverage"] = object_coverage
    solver["conditionCoverage"] = condition_coverage
    solver["summary"] = " ".join(part for part in summary_parts if part)
    solver["failedItems"] = failed_items
    solver["repairInstructions"] = repair_instructions
    next_construction["validation"] = solver
    return GeometryConstructionModel.model_validate(next_construction).model_dump()


def validation_summary(validation: Mapping[str, Any]) -> Dict[str, Any]:
    failed_items = [
        {
            "severity": str(item.get("severity") or "error"),
            "target": str(item.get("target") or ""),
            "message": str(item.get("message") or ""),
            "suggestedRepair": str(item.get("suggestedRepair") or ""),
        }
        for item in validation.get("failedItems") or []
        if isinstance(item, dict)
    ]
    return {
        "isValid": bool(validation.get("isValid")),
        "objectCoverage": float(validation.get("objectCoverage") or 0.0),
        "conditionCoverage": float(validation.get("conditionCoverage") or 0.0),
        "summary": str(validation.get("summary") or ""),
        "failedItems": failed_items,
        "repairInstructions": list(validation.get("repairInstructions") or []),
        "residualSummary": dict(validation.get("residualSummary") or {}),
    }


def construction_debug_summary(construction: Mapping[str, Any]) -> str:
    objects = [item for item in construction.get("objects") or [] if isinstance(item, dict)]
    constraints = [item for item in construction.get("constraints") or [] if isinstance(item, dict)]
    lines = [
        f"objects: {len(objects)}",
        f"constraints: {len(constraints)}",
    ]
    for obj in objects[:24]:
        refs = ",".join(str(ref) for ref in obj.get("refs") or [])
        lines.append(f"object {obj.get('id')} {obj.get('kind')} refs=[{refs}]")
    for constraint in constraints[:32]:
        lines.append(
            f"constraint {constraint.get('id')} {constraint.get('type')} "
            f"{json.dumps(constraint.get('args') or {}, ensure_ascii=False, sort_keys=True)}"
        )
    return "\n".join(lines)
