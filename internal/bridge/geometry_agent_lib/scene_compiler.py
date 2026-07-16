from __future__ import annotations

import math
from typing import Any, Dict, List

from .schemas import GeometrySceneModel
from .text_utils import preview_text


def compile_execution_to_scene(execution: Dict[str, Any]) -> Dict[str, Any]:
    objects = execution.get("objects") or {}
    points_by_id = {str(point.get("id")): point for point in objects.get("points") or [] if isinstance(point, dict)}

    points: List[Dict[str, Any]] = []
    for point in points_by_id.values():
        points.append(
            {
                "id": point["id"],
                "label": point.get("label") or "",
                "x": round(float(point["x"]), 8),
                "y": round(float(point["y"]), 8),
                "fixed": True,
            }
        )

    segments: List[Dict[str, Any]] = []
    for segment in objects.get("segments") or []:
        if isinstance(segment, dict):
            segments.append(dict(segment))

    line_index = 0
    for line in [*(objects.get("lines") or []), *(objects.get("rays") or [])]:
        if not isinstance(line, dict):
            continue
        line_index += 1
        p = line["point"]
        dx = float(line["dir"]["x"])
        dy = float(line["dir"]["y"])
        length = math.hypot(dx, dy) or 1.0
        ux, uy = dx / length, dy / length
        scale = 8.0
        a_id = f"__line_{line_index}_a"
        b_id = f"__line_{line_index}_b"
        points.append({"id": a_id, "label": "", "x": round(float(p["x"]) - ux * scale, 8), "y": round(float(p["y"]) - uy * scale, 8), "fixed": True})
        points.append({"id": b_id, "label": "", "x": round(float(p["x"]) + ux * scale, 8), "y": round(float(p["y"]) + uy * scale, 8), "fixed": True})
        segments.append({"id": f"line_display_{line_index}", "from": a_id, "to": b_id, "label": line.get("id", ""), "style": "construction"})

    circles = []
    for circle in objects.get("circles") or []:
        if not isinstance(circle, dict):
            continue
        circles.append(
            {
                "id": circle["id"],
                "center": circle["center"],
                "radius": round(float(circle["radius"]), 8),
                "through": circle.get("through") or "",
                "label": circle.get("label") or circle["id"],
                "style": circle.get("style") or "",
            }
        )

    return {
        "version": 1,
        "title": "DSL 精确构造",
        "sourceImage": "",
        "points": points,
        "segments": segments,
        "circles": circles,
        "arcs": [],
        "polygons": [],
        "controls": [],
        "measurements": [],
        "constraints": [],
        "annotations": [],
        "proofSteps": [],
    }


def scene_with_spec_context(scene: Dict[str, Any], spec: Dict[str, Any]) -> Dict[str, Any]:
    next_scene = dict(scene)
    title = preview_text(str(spec.get("problemText") or "几何构造"), 40)
    next_scene["title"] = title or "几何构造"
    next_scene["constraints"] = list(spec.get("constraints") or [])
    hints = list(spec.get("constructionHints") or [])
    annotations: List[Dict[str, Any]] = []
    if hints:
        annotations.append({"id": "construction_note", "text": preview_text(hints[0], 90), "x": 0.0, "y": 0.0})
    next_scene["annotations"] = annotations
    return GeometrySceneModel.model_validate(next_scene).model_dump(by_alias=True)


def compile_construction_to_scene(construction: Dict[str, Any], spec: Dict[str, Any]) -> Dict[str, Any]:
    execution = {
        "dslCode": construction.get("dslCode", ""),
        "objects": construction.get("objects") or {},
        "steps": construction.get("steps") or [],
    }
    return scene_with_spec_context(compile_execution_to_scene(execution), spec)
