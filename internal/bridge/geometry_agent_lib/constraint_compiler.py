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
    if not data.get("dslCode"):
        data["dslCode"] = construction_debug_summary(data)
    return GeometryConstructionModel.model_validate(data).model_dump()


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
