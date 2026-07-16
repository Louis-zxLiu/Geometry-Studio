from __future__ import annotations

import math
from typing import Any, Dict, List, Mapping

from .prompt_payloads import prompt_json
from .schemas import GeometrySceneModel
from .text_utils import preview_text


def construction_to_scene(construction: Mapping[str, Any], spec: Mapping[str, Any]) -> Dict[str, Any]:
    objects = [obj for obj in construction.get("objects") or [] if isinstance(obj, dict)]
    objects_by_id = {str(obj.get("id") or ""): obj for obj in objects}
    solution = construction.get("solution") or {}
    solved_points = solution.get("points") or {}

    points: List[Dict[str, Any]] = []
    for obj in objects:
        if str(obj.get("kind") or "").lower() != "point":
            continue
        point_id = str(obj.get("id") or "")
        coords = solved_points.get(point_id)
        if not isinstance(coords, dict):
            continue
        role = str(obj.get("role") or "").lower()
        label = str(obj.get("label") or point_id)
        if role in {"auxiliary", "helper", "hidden"} and not str(obj.get("attributes", {}).get("showLabel", "")).lower() == "true":
            label = ""
        points.append(
            {
                "id": point_id,
                "label": label,
                "x": round(float(coords.get("x") or 0.0), 8),
                "y": round(float(coords.get("y") or 0.0), 8),
                "fixed": role == "given" or bool((obj.get("attributes") or {}).get("fixed")),
            }
        )

    display_points = list(points)
    segments: List[Dict[str, Any]] = []
    line_index = 0
    for obj in objects:
        kind = str(obj.get("kind") or "").lower()
        obj_id = str(obj.get("id") or "")
        refs = [str(ref) for ref in obj.get("refs") or []]
        label = str(obj.get("label") or obj_id)
        if kind == "segment" and len(refs) >= 2:
            segments.append({"id": obj_id, "from": refs[0], "to": refs[1], "label": label, "style": str((obj.get("attributes") or {}).get("style") or "")})
        elif kind in {"line", "ray"} and len(refs) >= 2:
            a = point_coords(solved_points, refs[0])
            b = point_coords(solved_points, refs[1])
            if not a or not b:
                continue
            line_index += 1
            start, end = display_line_points(a, b, ray=(kind == "ray"))
            start_id = f"__display_{obj_id}_{line_index}_a"
            end_id = f"__display_{obj_id}_{line_index}_b"
            display_points.append({"id": start_id, "label": "", "x": start[0], "y": start[1], "fixed": True})
            display_points.append({"id": end_id, "label": "", "x": end[0], "y": end[1], "fixed": True})
            segments.append({"id": f"display_{obj_id}", "from": start_id, "to": end_id, "label": label, "style": "construction"})

    circles: List[Dict[str, Any]] = []
    for obj in objects:
        if str(obj.get("kind") or "").lower() != "circle":
            continue
        obj_id = str(obj.get("id") or "")
        circle = (solution.get("circles") or {}).get(obj_id) or {}
        if not isinstance(circle, dict):
            continue
        center = str(circle.get("center") or "")
        center_point = circle.get("centerPoint") if isinstance(circle.get("centerPoint"), dict) else {}
        if not center and center_point:
            center = f"__center_{obj_id}"
            display_points.append(
                {
                    "id": center,
                    "label": "",
                    "x": round(float(center_point.get("x") or 0.0), 8),
                    "y": round(float(center_point.get("y") or 0.0), 8),
                    "fixed": True,
                }
            )
        if not center:
            continue
        circles.append(
            {
                "id": obj_id,
                "center": center,
                "radius": round(float(circle.get("radius") or 0.0), 8),
                "through": str(circle.get("through") or ""),
                "label": str(obj.get("label") or obj_id),
                "style": str((obj.get("attributes") or {}).get("style") or ""),
            }
        )

    arcs: List[Dict[str, Any]] = []
    for obj in objects:
        if str(obj.get("kind") or "").lower() != "arc":
            continue
        obj_id = str(obj.get("id") or "")
        arc = (solution.get("arcs") or {}).get(obj_id) or {}
        if not isinstance(arc, dict):
            continue
        center = str(arc.get("center") or "")
        start = str(arc.get("start") or "")
        end = str(arc.get("end") or "")
        if not (center and start and end):
            continue
        radius = 0.0
        center_coords = point_coords(solved_points, center)
        start_coords = point_coords(solved_points, start)
        if center_coords and start_coords:
            radius = math.hypot(start_coords[0] - center_coords[0], start_coords[1] - center_coords[1])
        arcs.append(
            {
                "id": obj_id,
                "center": center,
                "start": start,
                "end": end,
                "radius": round(radius, 8),
                "label": str(obj.get("label") or obj_id),
                "style": str((obj.get("attributes") or {}).get("style") or ""),
            }
        )

    polygons: List[Dict[str, Any]] = []
    for obj in objects:
        if str(obj.get("kind") or "").lower() != "polygon":
            continue
        refs = [str(ref) for ref in obj.get("refs") or []]
        if len(refs) >= 3:
            polygons.append(
                {
                    "id": str(obj.get("id") or ""),
                    "points": refs,
                    "label": str(obj.get("label") or obj.get("id") or ""),
                    "fill": str((obj.get("attributes") or {}).get("fill") or ""),
                }
            )

    scene = {
        "version": 1,
        "title": preview_text(str(spec.get("problemText") or "几何构造"), 40) or "几何构造",
        "sourceImage": "",
        "points": display_points,
        "segments": segments,
        "circles": circles,
        "arcs": arcs,
        "polygons": polygons,
        "controls": [],
        "measurements": semantic_measurements(construction),
        "constraints": scene_constraints(spec, construction),
        "annotations": scene_annotations(construction),
        "proofSteps": [],
    }
    return GeometrySceneModel.model_validate(scene).model_dump(by_alias=True)


def construction_facts_text(construction: Mapping[str, Any], limit: int = 6500) -> str:
    objects = construction.get("objects") or []
    constraints = construction.get("constraints") or []
    solution = construction.get("solution") or {}
    facts = {
        "objects": objects,
        "constraints": constraints,
        "solution": {
            "status": solution.get("status"),
            "points": solution.get("points"),
            "lines": solution.get("lines"),
            "circles": solution.get("circles"),
            "arcs": solution.get("arcs"),
            "polygons": solution.get("polygons"),
            "maxResidual": solution.get("maxResidual"),
            "rmsResidual": solution.get("rmsResidual"),
        },
    }
    text = prompt_json(facts)
    return text if len(text) <= limit else text[:limit] + "\n..."


def semantic_measurements(construction: Mapping[str, Any]) -> List[Dict[str, Any]]:
    measurements: List[Dict[str, Any]] = []
    for index, constraint in enumerate(construction.get("constraints") or [], start=1):
        if not isinstance(constraint, dict):
            continue
        ctype = str(constraint.get("type") or "")
        if ctype not in {
            "angle_value",
            "angle_equals",
            "distance_equals",
            "ratio",
            "parallel",
            "perpendicular",
            "tangent",
            "midpoint",
            "concyclic",
            "collinear",
        }:
            continue
        measurements.append(
            {
                "id": f"constraint_{index}",
                "label": preview_text(str(constraint.get("text") or ctype), 80),
                "kind": ctype,
                "args": [str(value) for value in flatten_args(constraint.get("args") or {})],
                "value": "",
            }
        )
    return measurements[:12]


def scene_constraints(spec: Mapping[str, Any], construction: Mapping[str, Any]) -> List[Dict[str, Any]]:
    constraints: List[Dict[str, Any]] = []
    for item in spec.get("constraints") or []:
        if isinstance(item, dict):
            constraints.append(
                {
                    "type": str(item.get("type") or "relation"),
                    "args": [str(arg) for arg in item.get("args") or []],
                    "text": str(item.get("text") or ""),
                    "confidence": float(item.get("confidence") or 0.9),
                }
            )
    for item in construction.get("constraints") or []:
        if isinstance(item, dict):
            text = str(item.get("text") or item.get("type") or "")
            if not text:
                continue
            constraints.append(
                {
                    "type": str(item.get("type") or "relation"),
                    "args": [str(arg) for arg in flatten_args(item.get("args") or {})],
                    "text": text,
                    "confidence": 1.0 if item.get("required", True) else 0.7,
                }
            )
    return constraints[:24]


def scene_annotations(construction: Mapping[str, Any]) -> List[Dict[str, Any]]:
    annotations: List[Dict[str, Any]] = []
    for index, intent in enumerate(construction.get("constructionIntent") or [], start=1):
        if not isinstance(intent, dict):
            continue
        text = preview_text(str(intent.get("summary") or ""), 90)
        if text:
            annotations.append({"id": f"intent_{index}", "text": text, "x": 0.0, "y": 0.0})
        if len(annotations) >= 3:
            break
    return annotations


def flatten_args(value: Any) -> List[Any]:
    if isinstance(value, dict):
        result: List[Any] = []
        for item in value.values():
            result.extend(flatten_args(item))
        return result
    if isinstance(value, list):
        result: List[Any] = []
        for item in value:
            result.extend(flatten_args(item))
        return result
    if value in (None, ""):
        return []
    return [value]


def point_coords(points: Mapping[str, Any], point_id: str) -> tuple[float, float] | None:
    value = points.get(point_id)
    if not isinstance(value, dict):
        return None
    return (float(value.get("x") or 0.0), float(value.get("y") or 0.0))


def display_line_points(a: tuple[float, float], b: tuple[float, float], *, ray: bool = False) -> tuple[tuple[float, float], tuple[float, float]]:
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    length = math.hypot(dx, dy) or 1.0
    ux = dx / length
    uy = dy / length
    scale = 8.0
    if ray:
        return a, (a[0] + ux * scale, a[1] + uy * scale)
    mid = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
    return (mid[0] - ux * scale, mid[1] - uy * scale), (mid[0] + ux * scale, mid[1] + uy * scale)


def object_label(objects_by_id: Mapping[str, Mapping[str, Any]], object_id: str) -> str:
    obj = objects_by_id.get(object_id) or {}
    return str(obj.get("label") or object_id)
