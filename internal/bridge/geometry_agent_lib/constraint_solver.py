from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Sequence

import numpy as np
from scipy.optimize import least_squares

from .constraint_residuals import ConstraintEvaluation, ResidualContext, evaluate_constraint, number
from .constraint_residuals import circumcenter


SOLVED_TOLERANCE = 1e-5
WEIGHT_FLOOR = 1e-6
GEOMETRY_MIN_SINE = 0.04
GEOMETRY_MAX_CIRCUMRADIUS_RATIO = 40.0
GEOMETRY_MAX_RADIUS_RESIDUAL = 0.25
GEOMETRY_QUALITY_WEIGHT = 4.0


@dataclass(frozen=True)
class PreparedConstraint:
    raw: Mapping[str, Any]
    width: int
    weight: float


@dataclass(frozen=True)
class GeometryQualityCheck:
    id: str
    type: str
    points: tuple[str, str, str]
    source: str


def solve_constraint_construction(construction: Mapping[str, Any], *, max_nfev: int = 5000) -> Dict[str, Any]:
    objects = [obj for obj in construction.get("objects") or [] if isinstance(obj, dict)]
    constraints = [item for item in construction.get("constraints") or [] if isinstance(item, dict)]
    point_ids = ordered_point_ids(objects)
    if not point_ids:
        return empty_solution("failed", "construction has no point objects")

    context = ResidualContext(objects)
    prepared_constraints = prepare_constraints(constraints)
    quality_checks = prepare_quality_checks(context, objects, constraints)
    fixed_anchors = fixed_point_anchors(context, point_ids)
    starts = deterministic_initializers(objects, point_ids, max_starts=solver_start_count(point_ids, constraints))
    per_start_nfev = solver_iteration_budget(point_ids, constraints, max_nfev)
    best: Dict[str, Any] | None = None
    best_score = float("inf")

    for index, x0 in enumerate(starts):
        result = least_squares(
            lambda vector: residual_vector(
                context,
                point_ids,
                vector,
                prepared_constraints,
                fixed_anchors,
                quality_checks,
            ),
            x0,
            method="trf",
            loss="soft_l1",
            f_scale=1.0,
            max_nfev=per_start_nfev,
        )
        points = vector_to_points(point_ids, result.x)
        evaluations = [
            *evaluate_all(context, points, constraints),
            *evaluate_fixed_anchor_checks(points, fixed_anchors),
            *evaluate_quality_checks(points, quality_checks),
        ]
        residuals = [
            {
                "constraintId": evaluation.constraint_id,
                "type": evaluation.type,
                "value": evaluation.value,
                "ok": evaluation.value <= SOLVED_TOLERANCE and not evaluation.message,
                "message": evaluation.message,
            }
            for evaluation in evaluations
        ]
        max_residual = max((item["value"] for item in residuals), default=0.0)
        rms_residual = math.sqrt(
            sum(item["value"] * item["value"] for item in residuals) / max(1, len(residuals))
        )
        score = max_residual + rms_residual + len([item for item in residuals if item["message"]]) * 100.0
        if score < best_score:
            best_score = score
            best = {
                "status": solution_status(result.success, point_ids, constraints, max_residual, residuals),
                "points": {
                    point_id: {"x": round(float(coords[0]), 10), "y": round(float(coords[1]), 10)}
                    for point_id, coords in points.items()
                },
                "lines": derive_lines(context, points, objects),
                "circles": derive_circles(context, points, objects),
                "arcs": derive_arcs(context, points, objects),
                "polygons": derive_polygons(context, points, objects),
                "residuals": residuals,
                "maxResidual": float(max_residual),
                "rmsResidual": float(rms_residual),
                "iterations": int(result.nfev),
                "initializer": f"deterministic-{index + 1}",
                "message": str(result.message),
            }
            if max_residual <= SOLVED_TOLERANCE and not any(item.get("message") for item in residuals):
                break

    return best or empty_solution("failed", "least_squares did not return a solution")


def prepare_constraints(constraints: Sequence[Mapping[str, Any]]) -> List[PreparedConstraint]:
    return [
        PreparedConstraint(
            raw=constraint,
            width=expected_component_count(constraint),
            weight=math.sqrt(max(WEIGHT_FLOOR, float(constraint.get("weight") or 1.0))),
        )
        for constraint in constraints
    ]


def solver_start_count(point_ids: Sequence[str], constraints: Sequence[Mapping[str, Any]]) -> int:
    point_count = len(point_ids)
    constraint_count = len(constraints)
    if point_count <= 6 and constraint_count <= 12:
        return 8
    if point_count <= 12 and constraint_count <= 24:
        return 6
    return 4


def solver_iteration_budget(
    point_ids: Sequence[str],
    constraints: Sequence[Mapping[str, Any]],
    max_nfev: int,
) -> int:
    scaled_budget = 140 * max(1, len(point_ids)) + 90 * max(1, len(constraints))
    return max(900, min(max_nfev, scaled_budget))


def ordered_point_ids(objects: Sequence[Mapping[str, Any]]) -> List[str]:
    point_ids: List[str] = []
    for obj in objects:
        if str(obj.get("kind") or "").lower() != "point":
            continue
        obj_id = str(obj.get("id") or "").strip()
        if obj_id and obj_id not in point_ids:
            point_ids.append(obj_id)
    return point_ids


def deterministic_initializers(
    objects: Sequence[Mapping[str, Any]],
    point_ids: Sequence[str],
    *,
    max_starts: int,
) -> List[np.ndarray]:
    attrs_by_id = {
        str(obj.get("id")): obj.get("attributes")
        for obj in objects
        if str(obj.get("kind") or "").lower() == "point" and isinstance(obj.get("attributes"), dict)
    }
    base = np.zeros(len(point_ids) * 2, dtype=float)
    for index, point_id in enumerate(point_ids):
        attrs = attrs_by_id.get(point_id) or {}
        if "x" in attrs and "y" in attrs:
            x = number(attrs.get("x"))
            y = number(attrs.get("y"))
        else:
            angle = 2.399963229728653 * (index + 1)
            radius = 1.0 + 0.55 * math.sqrt(index + 1)
            x = radius * math.cos(angle)
            y = radius * math.sin(angle)
        base[2 * index] = x
        base[2 * index + 1] = y

    starts = [base, base * 1.8, base * 0.55]
    for seed in range(1, 8):
        jitter = np.zeros_like(base)
        for index, point_id in enumerate(point_ids):
            digest = hashlib.sha256(f"{point_id}:{seed}".encode("utf-8")).digest()
            dx = (digest[0] / 255.0 - 0.5) * 1.25 * (1 + seed * 0.45)
            dy = (digest[1] / 255.0 - 0.5) * 1.25 * (1 + seed * 0.45)
            jitter[2 * index] = dx
            jitter[2 * index + 1] = dy
        starts.append(base + jitter)
    return starts[:max(1, max_starts)]


def vector_to_points(point_ids: Sequence[str], vector: np.ndarray) -> Dict[str, np.ndarray]:
    return {
        point_id: np.asarray([float(vector[2 * index]), float(vector[2 * index + 1])], dtype=float)
        for index, point_id in enumerate(point_ids)
    }


def residual_vector(
    context: ResidualContext,
    point_ids: Sequence[str],
    vector: np.ndarray,
    constraints: Sequence[PreparedConstraint],
    fixed_anchors: Sequence[tuple[str, float, float]],
    quality_checks: Sequence[GeometryQualityCheck],
) -> np.ndarray:
    points = vector_to_points(point_ids, vector)
    values: List[float] = []
    for constraint in constraints:
        evaluation = evaluate_constraint(context, points, constraint.raw)
        components = fixed_width_components(evaluation.components, constraint.width)
        values.extend([component * constraint.weight for component in components])
    values.extend(fixed_point_residuals(points, fixed_anchors))
    if not values:
        values.extend(normalization_residuals(points))
    for check in quality_checks:
        values.extend([component * GEOMETRY_QUALITY_WEIGHT for component in residual_quality_check(points, check)])
    return np.asarray(values, dtype=float)


def fixed_width_components(components: Sequence[float], width: int) -> List[float]:
    values = [float(item) for item in components[:width]]
    if len(values) < width:
        values.extend([0.0] * (width - len(values)))
    return values


def expected_component_count(constraint: Mapping[str, Any]) -> int:
    constraint_type = str(constraint.get("type") or "").strip().lower()
    args = constraint.get("args") if isinstance(constraint.get("args"), dict) else {}
    if constraint_type in {"midpoint", "circumcenter"}:
        return 2
    if constraint_type == "intersection":
        return 6
    if constraint_type == "tangent":
        return 5
    if constraint_type == "on":
        return 3
    if constraint_type == "concyclic":
        count = len(args.get("points") or args.get("items") or [])
        return max(1, count - 3)
    if constraint_type == "collinear":
        count = len(args.get("points") or args.get("items") or [])
        return max(1, count - 2)
    if constraint_type in {"convex", "convex_polygon", "convex_quadrilateral"}:
        count = len(args.get("points") or args.get("vertices") or args.get("items") or [])
        return max(3, count or 4)
    return 1


def fixed_point_anchors(context: ResidualContext, point_ids: Sequence[str]) -> List[tuple[str, float, float]]:
    anchors: List[tuple[str, float, float]] = []
    for point_id in point_ids:
        attrs = context.object_attrs(point_id)
        if attrs.get("fixed") and "x" in attrs and "y" in attrs:
            anchors.append((point_id, number(attrs.get("x")), number(attrs.get("y"))))
    return anchors


def fixed_point_residuals(
    points: Mapping[str, np.ndarray],
    anchors: Sequence[tuple[str, float, float]],
) -> List[float]:
    residuals: List[float] = []
    for point_id, x, y in anchors:
        coords = points.get(point_id)
        if coords is None:
            continue
        residuals.append((float(coords[0]) - x) * 10.0)
        residuals.append((float(coords[1]) - y) * 10.0)
    return residuals


def normalization_residuals(points: Mapping[str, np.ndarray]) -> List[float]:
    point_values = list(points.values())
    if not point_values:
        return []
    centroid = sum(point_values) / len(point_values)
    residuals = [float(centroid[0]) * 0.01, float(centroid[1]) * 0.01]
    if len(point_values) >= 2:
        residuals.append((float(np.linalg.norm(point_values[1] - point_values[0])) - 2.0) * 0.01)
    return residuals


def evaluate_all(
    context: ResidualContext,
    points: Mapping[str, np.ndarray],
    constraints: Sequence[Mapping[str, Any]],
) -> List[ConstraintEvaluation]:
    return [evaluate_constraint(context, points, constraint) for constraint in constraints]


def evaluate_fixed_anchor_checks(
    points: Mapping[str, np.ndarray],
    anchors: Sequence[tuple[str, float, float]],
) -> List[ConstraintEvaluation]:
    evaluations: List[ConstraintEvaluation] = []
    for point_id, x, y in anchors:
        coords = points.get(point_id)
        if coords is None:
            continue
        components = [(float(coords[0]) - x) * 10.0, (float(coords[1]) - y) * 10.0]
        value = float(np.linalg.norm(np.asarray(components, dtype=float)) / math.sqrt(len(components)))
        message = f"fixed point {point_id} drifted from its anchor." if value > 1e-4 else ""
        evaluations.append(ConstraintEvaluation(f"fixed_{point_id}", "fixed", components, message))
    return evaluations


def prepare_quality_checks(
    context: ResidualContext,
    objects: Sequence[Mapping[str, Any]],
    constraints: Sequence[Mapping[str, Any]],
) -> List[GeometryQualityCheck]:
    checks: List[GeometryQualityCheck] = []
    seen: set[tuple[str, str, str]] = set()

    def add_check(source: str, refs: Sequence[Any]) -> None:
        resolved = tuple(context.resolve(ref) for ref in refs[:3])
        if len(resolved) != 3 or len(set(resolved)) != 3:
            return
        key = tuple(sorted(resolved))
        if key in seen:
            return
        seen.add(key)
        checks.append(
            GeometryQualityCheck(
                id=f"quality_{source}_nondegenerate",
                type="nondegenerate",
                points=(resolved[0], resolved[1], resolved[2]),
                source=source,
            )
        )

    for obj in objects:
        kind = str(obj.get("kind") or "").lower()
        refs = obj.get("refs") or []
        obj_id = str(obj.get("id") or kind or "object")
        if kind == "circle" and len(refs) >= 3:
            add_check(obj_id, refs)
        elif kind == "polygon" and len(refs) >= 3:
            add_check(obj_id, refs)

    for constraint in constraints:
        ctype = str(constraint.get("type") or "").strip().lower()
        args = constraint.get("args") if isinstance(constraint.get("args"), dict) else {}
        source = str(constraint.get("id") or ctype or "constraint")
        if ctype in {"concyclic", "circumcenter"}:
            refs = list_from_args(args, "points", "triangle", "items")
            if len(refs) < 3:
                refs = [args.get(key) for key in ("a", "b", "c") if args.get(key)]
            add_check(source, refs)

    return checks


def list_from_args(args: Mapping[str, Any], *keys: str) -> List[Any]:
    for key in keys:
        value = args.get(key)
        if isinstance(value, (list, tuple)):
            return list(value)
        if isinstance(value, str) and value.strip():
            return [item.strip() for item in value.split(",") if item.strip()]
    return []


def evaluate_quality_checks(
    points: Mapping[str, np.ndarray],
    checks: Sequence[GeometryQualityCheck],
) -> List[ConstraintEvaluation]:
    evaluations: List[ConstraintEvaluation] = []
    for check in checks:
        try:
            components = residual_quality_check(points, check)
            value = float(np.linalg.norm(np.asarray(components, dtype=float)) / math.sqrt(max(1, len(components))))
            message = ""
            if value > SOLVED_TOLERANCE:
                message = quality_failure_message(points, check)
            evaluations.append(ConstraintEvaluation(check.id, check.type, components, message))
        except Exception as exc:
            evaluations.append(ConstraintEvaluation(check.id, check.type, [10.0], str(exc)))
    return evaluations


def residual_quality_check(points: Mapping[str, np.ndarray], check: GeometryQualityCheck) -> List[float]:
    a, b, c = [points[ref] for ref in check.points]
    min_sine = triangle_min_sine(a, b, c)
    try:
        radius_ratio = circumradius_ratio(a, b, c)
    except Exception:
        radius_ratio = GEOMETRY_MAX_CIRCUMRADIUS_RATIO * 2.0
    radius_residual = max(0.0, (radius_ratio - GEOMETRY_MAX_CIRCUMRADIUS_RATIO) / GEOMETRY_MAX_CIRCUMRADIUS_RATIO)
    return [
        max(0.0, GEOMETRY_MIN_SINE - min_sine),
        min(GEOMETRY_MAX_RADIUS_RESIDUAL, radius_residual),
    ]


def triangle_min_sine(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ab = float(np.linalg.norm(b - a))
    ac = float(np.linalg.norm(c - a))
    bc = float(np.linalg.norm(c - b))
    if min(ab, ac, bc) < 1e-9:
        return 0.0
    area2 = abs(float((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])))
    return min(area2 / (ab * ac), area2 / (ab * bc), area2 / (ac * bc))


def circumradius_ratio(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    max_side = max(float(np.linalg.norm(b - a)), float(np.linalg.norm(c - a)), float(np.linalg.norm(c - b)), 1.0)
    center = circumcenter(a, b, c)
    radius = float(np.linalg.norm(a - center))
    return radius / max_side


def quality_failure_message(points: Mapping[str, np.ndarray], check: GeometryQualityCheck) -> str:
    a, b, c = [points[ref] for ref in check.points]
    min_sine = triangle_min_sine(a, b, c)
    labels = ", ".join(check.points)
    if min_sine < GEOMETRY_MIN_SINE:
        return (
            f"{check.source} uses nearly collinear points ({labels}); "
            "a triangle or three-point circle needs a non-degenerate configuration."
        )
    radius_ratio = circumradius_ratio(a, b, c)
    return (
        f"{check.source} has an unstable circumcircle from points ({labels}); "
        f"circumradius/side ratio {radius_ratio:.2f} is too large."
    )


def solution_status(
    optimizer_success: bool,
    point_ids: Sequence[str],
    constraints: Sequence[Mapping[str, Any]],
    max_residual: float,
    residuals: Sequence[Mapping[str, Any]],
) -> str:
    if any(item.get("message") for item in residuals):
        return "failed"
    if max_residual > 1e-3:
        return "inconsistent"
    if not optimizer_success:
        return "failed"
    variable_count = max(0, len(point_ids) * 2)
    predicate_count = max(0, len(constraints))
    if predicate_count == 0 or predicate_count < max(1, variable_count - 3):
        return "underconstrained"
    return "solved"


def derive_lines(
    context: ResidualContext,
    points: Mapping[str, np.ndarray],
    objects: Sequence[Mapping[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    lines: Dict[str, Dict[str, Any]] = {}
    for obj in objects:
        kind = str(obj.get("kind") or "").lower()
        if kind not in {"line", "ray"}:
            continue
        obj_id = str(obj.get("id") or "")
        try:
            a, b = context.resolve((obj.get("refs") or [])[0]), context.resolve((obj.get("refs") or [])[1])
            direction = points[b] - points[a]
            norm = float(np.linalg.norm(direction)) or 1.0
            lines[obj_id] = {
                "kind": kind,
                "through": [a, b],
                "point": {"x": float(points[a][0]), "y": float(points[a][1])},
                "direction": {"x": float(direction[0] / norm), "y": float(direction[1] / norm)},
            }
        except Exception:
            continue
    return lines


def derive_circles(
    context: ResidualContext,
    points: Mapping[str, np.ndarray],
    objects: Sequence[Mapping[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    circles: Dict[str, Dict[str, Any]] = {}
    for obj in objects:
        if str(obj.get("kind") or "").lower() != "circle":
            continue
        obj_id = str(obj.get("id") or "")
        attrs = obj.get("attributes") if isinstance(obj.get("attributes"), dict) else {}
        refs = [context.resolve(ref) for ref in obj.get("refs") or []]
        if len(refs) >= 3 and all(ref in points for ref in refs[:3]):
            try:
                center_coords = circumcenter(points[refs[0]], points[refs[1]], points[refs[2]])
            except Exception:
                continue
            radius = float(np.linalg.norm(points[refs[0]] - center_coords))
            if radius <= 0:
                continue
            circles[obj_id] = {
                "center": "",
                "centerPoint": {"x": float(center_coords[0]), "y": float(center_coords[1])},
                "through": refs[0],
                "throughPoints": refs[:3],
                "radius": radius,
            }
            continue
        center_id = context.resolve(attrs.get("center") or (refs[0] if refs else ""))
        if center_id not in points:
            continue
        through = context.resolve(attrs.get("through") or (refs[1] if len(refs) >= 2 else ""))
        radius = number(attrs.get("radius") or attrs.get("r"), 0.0)
        if radius <= 0 and through in points:
            radius = float(np.linalg.norm(points[through] - points[center_id]))
        if radius <= 0:
            continue
        circles[obj_id] = {
            "center": center_id,
            "through": through,
            "radius": float(radius),
        }
    return circles


def derive_arcs(
    context: ResidualContext,
    points: Mapping[str, np.ndarray],
    objects: Sequence[Mapping[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    arcs: Dict[str, Dict[str, Any]] = {}
    for obj in objects:
        if str(obj.get("kind") or "").lower() != "arc":
            continue
        refs = [context.resolve(ref) for ref in obj.get("refs") or []]
        if len(refs) >= 3 and all(ref in points for ref in refs[:3]):
            center, start, end = refs[:3]
            arcs[str(obj.get("id") or "")] = {"center": center, "start": start, "end": end}
    return arcs


def derive_polygons(
    context: ResidualContext,
    points: Mapping[str, np.ndarray],
    objects: Sequence[Mapping[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    polygons: Dict[str, Dict[str, Any]] = {}
    for obj in objects:
        if str(obj.get("kind") or "").lower() != "polygon":
            continue
        refs = [context.resolve(ref) for ref in obj.get("refs") or []]
        refs = [ref for ref in refs if ref in points]
        if len(refs) >= 3:
            polygons[str(obj.get("id") or "")] = {"points": refs}
    return polygons


def empty_solution(status: str, message: str) -> Dict[str, Any]:
    return {
        "status": status,
        "points": {},
        "lines": {},
        "circles": {},
        "arcs": {},
        "polygons": {},
        "residuals": [],
        "maxResidual": 0.0,
        "rmsResidual": 0.0,
        "iterations": 0,
        "initializer": "",
        "message": message,
    }
