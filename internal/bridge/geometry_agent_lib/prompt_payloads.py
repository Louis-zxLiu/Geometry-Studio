from __future__ import annotations

import json
from typing import Any, Dict, List, Mapping


def prompt_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def compact_scene_for_prompt(scene: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "title": scene.get("title", ""),
        "points": scene.get("points") or [],
        "segments": scene.get("segments") or [],
        "circles": scene.get("circles") or [],
        "arcs": scene.get("arcs") or [],
        "polygons": scene.get("polygons") or [],
        "measurements": scene.get("measurements") or [],
        "constraints": scene.get("constraints") or [],
        "annotations": scene.get("annotations") or [],
    }


def compact_scene_geometry_for_prompt(scene: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "title": scene.get("title", ""),
        "points": scene.get("points") or [],
        "segments": scene.get("segments") or [],
        "circles": scene.get("circles") or [],
        "arcs": scene.get("arcs") or [],
        "polygons": scene.get("polygons") or [],
    }


def compact_construction_for_prompt(
    construction: Mapping[str, Any],
    *,
    include_solution_points: bool = False,
    residual_limit: int = 12,
) -> Dict[str, Any]:
    solution = construction.get("solution") if isinstance(construction.get("solution"), dict) else {}
    validation = construction.get("validation") if isinstance(construction.get("validation"), dict) else {}
    payload: Dict[str, Any] = {
        "objects": construction.get("objects") or [],
        "constraints": construction.get("constraints") or [],
        "constructionIntent": construction.get("constructionIntent") or [],
        "solution": compact_solution_for_prompt(solution, include_points=include_solution_points, residual_limit=residual_limit),
    }
    if construction.get("diagnostics"):
        payload["diagnostics"] = list(construction.get("diagnostics") or [])[:residual_limit]
    if validation:
        payload["validation"] = {
            "isValid": bool(validation.get("isValid")),
            "solverOk": bool(validation.get("solverOk")),
            "semanticOk": bool(validation.get("semanticOk")),
            "objectCoverage": validation.get("objectCoverage"),
            "conditionCoverage": validation.get("conditionCoverage"),
            "summary": validation.get("summary", ""),
            "failedItems": (validation.get("failedItems") or [])[:residual_limit],
            "repairInstructions": (validation.get("repairInstructions") or [])[:residual_limit],
            "residualSummary": validation.get("residualSummary") or {},
        }
    return payload


def compact_solution_for_prompt(
    solution: Mapping[str, Any],
    *,
    include_points: bool = False,
    residual_limit: int = 12,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "status": solution.get("status", "unknown"),
        "maxResidual": solution.get("maxResidual", 0.0),
        "rmsResidual": solution.get("rmsResidual", 0.0),
        "iterations": solution.get("iterations", 0),
        "initializer": solution.get("initializer", ""),
        "message": solution.get("message", ""),
        "residuals": important_residuals(solution.get("residuals") or [], limit=residual_limit),
    }
    if include_points:
        payload["points"] = solution.get("points") or {}
        payload["circles"] = solution.get("circles") or {}
        payload["arcs"] = solution.get("arcs") or {}
        payload["polygons"] = solution.get("polygons") or {}
    return payload


def compact_feedback_for_prompt(feedback: Mapping[str, Any], *, residual_limit: int = 12) -> Dict[str, Any]:
    summary = feedback.get("validationSummary") if isinstance(feedback.get("validationSummary"), dict) else {}
    solution = feedback.get("solution") if isinstance(feedback.get("solution"), dict) else {}
    return {
        "attempt": feedback.get("attempt", 1),
        "validationSummary": {
            "isValid": bool(summary.get("isValid")),
            "objectCoverage": summary.get("objectCoverage"),
            "conditionCoverage": summary.get("conditionCoverage"),
            "summary": summary.get("summary", ""),
            "failedItems": (summary.get("failedItems") or [])[:residual_limit],
            "repairInstructions": (summary.get("repairInstructions") or [])[:residual_limit],
            "residualSummary": summary.get("residualSummary") or {},
        },
        "solution": compact_solution_for_prompt(solution, include_points=False, residual_limit=residual_limit),
    }


def important_residuals(residuals: Any, *, limit: int = 12) -> List[Dict[str, Any]]:
    items = [item for item in residuals if isinstance(item, dict)]
    items.sort(
        key=lambda item: (
            0 if item.get("message") or not item.get("ok", True) else 1,
            -abs(float(item.get("value") or 0.0)),
        )
    )
    return [
        {
            "constraintId": item.get("constraintId", ""),
            "type": item.get("type", ""),
            "value": item.get("value", 0.0),
            "ok": bool(item.get("ok", False)),
            "message": item.get("message", ""),
        }
        for item in items[:limit]
    ]
