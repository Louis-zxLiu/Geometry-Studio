from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Mapping, Sequence

import numpy as np


EPSILON = 1e-9
ORIENTATION_MIN_AREA_RATIO = 1e-4
CONVEX_MIN_TURN_RATIO = 1e-4


@dataclass(frozen=True)
class ConstraintEvaluation:
    constraint_id: str
    type: str
    components: List[float]
    message: str = ""

    @property
    def value(self) -> float:
        if not self.components:
            return 0.0
        return float(np.linalg.norm(np.asarray(self.components, dtype=float)) / math.sqrt(len(self.components)))


class ResidualContext:
    def __init__(self, objects: Sequence[Mapping[str, Any]]):
        self.objects: Dict[str, Mapping[str, Any]] = {}
        self.aliases: Dict[str, str] = {}
        self.kinds: Dict[str, str] = {}
        self.refs: Dict[str, List[Any]] = {}
        self.attrs: Dict[str, Mapping[str, Any]] = {}
        for obj in objects:
            obj_id = str(obj.get("id") or "").strip()
            if not obj_id:
                continue
            self.objects[obj_id] = obj
            self.kinds[obj_id] = normalize_type(str(obj.get("kind") or ""))
            self.refs[obj_id] = list_value(obj.get("refs"))
            self.attrs[obj_id] = obj.get("attributes") if isinstance(obj.get("attributes"), dict) else {}
            label = str(obj.get("label") or "").strip()
            if label:
                self.aliases[label] = obj_id

    def resolve(self, ref: Any) -> str:
        value = str(ref or "").strip()
        return self.aliases.get(value, value)

    def object(self, ref: Any) -> Mapping[str, Any] | None:
        return self.objects.get(self.resolve(ref))

    def kind(self, ref: Any) -> str:
        return self.kinds.get(self.resolve(ref), "")

    def object_refs(self, ref: Any) -> List[Any]:
        return self.refs.get(self.resolve(ref), [])

    def object_attrs(self, ref: Any) -> Mapping[str, Any]:
        return self.attrs.get(self.resolve(ref), {})


def evaluate_constraint(
    context: ResidualContext,
    points: Mapping[str, np.ndarray],
    constraint: Mapping[str, Any],
) -> ConstraintEvaluation:
    constraint_id = str(constraint.get("id") or constraint.get("type") or "constraint")
    constraint_type = normalize_type(str(constraint.get("type") or ""))
    args = constraint.get("args") if isinstance(constraint.get("args"), dict) else {}
    try:
        if constraint_type == "on":
            components = residual_on(context, points, args)
        elif constraint_type == "parallel":
            components = residual_parallel(context, points, args)
        elif constraint_type in {"perpendicular", "orthogonal"}:
            components = residual_perpendicular(context, points, args)
        elif constraint_type in {"distance_equals", "equal_distance", "length_equals"}:
            components = residual_distance_equals(context, points, args)
        elif constraint_type == "ratio":
            components = residual_ratio(context, points, args)
        elif constraint_type in {"angle_value", "angle"}:
            components = residual_angle_value(context, points, args)
        elif constraint_type in {"angle_equals", "equal_angle"}:
            components = residual_angle_equals(context, points, args)
        elif constraint_type == "midpoint":
            components = residual_midpoint(context, points, args)
        elif constraint_type == "intersection":
            components = residual_intersection(context, points, args)
        elif constraint_type == "tangent":
            components = residual_tangent(context, points, args)
        elif constraint_type == "concyclic":
            components = residual_concyclic(context, points, args)
        elif constraint_type == "collinear":
            components = residual_collinear(context, points, args)
        elif constraint_type == "circumcenter":
            components = residual_circumcenter(context, points, args)
        elif constraint_type == "opposite_sides":
            components = residual_side_relation(context, points, args, opposite=True)
        elif constraint_type == "same_side":
            components = residual_side_relation(context, points, args, opposite=False)
        elif constraint_type == "orientation":
            components = residual_orientation(context, points, args)
        elif constraint_type in {"convex", "convex_polygon", "convex_quadrilateral"}:
            components = residual_convex_polygon(context, points, args)
        elif constraint_type == "order":
            components = residual_order(context, points, args)
        elif constraint_type == "inside":
            components = residual_inside_outside(context, points, args, inside=True)
        elif constraint_type == "outside":
            components = residual_inside_outside(context, points, args, inside=False)
        else:
            return ConstraintEvaluation(
                constraint_id,
                constraint_type or "unknown",
                [10.0],
                f"unsupported constraint type: {constraint_type or '<empty>'}",
            )
        return ConstraintEvaluation(constraint_id, constraint_type, [float(v) for v in components])
    except Exception as exc:
        return ConstraintEvaluation(constraint_id, constraint_type, [10.0], str(exc))


def normalize_type(value: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", value.strip().lower()).strip("_")


def number(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if not text:
        return default
    text = text.replace("°", "").replace("deg", "").replace("degrees", "").strip()
    try:
        return float(text)
    except ValueError:
        return default


def angle_target_radians(value: Any) -> float:
    raw = number(value)
    if abs(raw) > math.tau:
        return math.radians(raw)
    return raw


def point_ref(context: ResidualContext, value: Any) -> str:
    ref = context.resolve(value)
    if not ref:
        raise ValueError("missing point reference")
    return ref


def point(context: ResidualContext, points: Mapping[str, np.ndarray], value: Any) -> np.ndarray:
    ref = point_ref(context, value)
    if ref not in points:
        raise ValueError(f"unknown point: {ref}")
    return points[ref]


def list_value(value: Any) -> List[Any]:
    if isinstance(value, (list, tuple)):
        return list(value)
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def first_arg(args: Mapping[str, Any], *names: str) -> Any:
    for name in names:
        if name in args and args[name] not in (None, ""):
            return args[name]
    return ""


def point_pair_from_ref(context: ResidualContext, ref: Any) -> tuple[str, str]:
    if isinstance(ref, (list, tuple)) and len(ref) >= 2:
        return point_ref(context, ref[0]), point_ref(context, ref[1])
    obj = context.object(ref)
    if obj:
        refs = context.object_refs(ref)
        if len(refs) >= 2:
            return point_ref(context, refs[0]), point_ref(context, refs[1])
        attrs = context.object_attrs(ref)
        if attrs:
            a = first_arg(attrs, "a", "from", "p1", "start")
            b = first_arg(attrs, "b", "to", "p2", "end")
            if a and b:
                return point_ref(context, a), point_ref(context, b)
    raise ValueError(f"object is not line-like: {ref}")


def point_pair_from_args(context: ResidualContext, args: Mapping[str, Any], prefix: str = "") -> tuple[str, str]:
    if prefix:
        direct = first_arg(args, prefix, f"{prefix}Segment", f"{prefix}Line")
        if direct:
            return point_pair_from_ref(context, direct)
        a = first_arg(args, f"{prefix}A", f"{prefix}1", f"{prefix}_a", f"{prefix}_1")
        b = first_arg(args, f"{prefix}B", f"{prefix}2", f"{prefix}_b", f"{prefix}_2")
        if a and b:
            return point_ref(context, a), point_ref(context, b)
    direct = first_arg(args, "segment", "line", "object", "target")
    if direct:
        return point_pair_from_ref(context, direct)
    a = first_arg(args, "a", "from", "p1")
    b = first_arg(args, "b", "to", "p2")
    if a and b:
        return point_ref(context, a), point_ref(context, b)
    raise ValueError("missing point pair")


def segment_length(context: ResidualContext, points: Mapping[str, np.ndarray], value: Any) -> float:
    a, b = point_pair_from_ref(context, value)
    return distance(points[a], points[b])


def distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


def unit_direction(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    vec = b - a
    length = float(np.linalg.norm(vec))
    if length < EPSILON:
        raise ValueError("degenerate line-like object")
    return vec / length


def cross2(a: np.ndarray, b: np.ndarray) -> float:
    return float(a[0] * b[1] - a[1] * b[0])


def signed_distance_to_line(p: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
    direction = unit_direction(a, b)
    return cross2(p - a, direction)


def line_parameter(p: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
    vec = b - a
    length_sq = float(np.dot(vec, vec))
    if length_sq < EPSILON:
        raise ValueError("degenerate segment")
    return float(np.dot(p - a, vec) / length_sq)


def circle_data(context: ResidualContext, points: Mapping[str, np.ndarray], ref: Any) -> tuple[str, np.ndarray, float]:
    obj = context.object(ref)
    if not obj:
        raise ValueError(f"unknown circle: {ref}")
    attrs = context.object_attrs(ref)
    refs = context.object_refs(ref)
    center_ref = first_arg(attrs, "center", "o") or (refs[0] if refs else "")
    center_id = point_ref(context, center_ref)
    center = point(context, points, center_id)
    radius = number(first_arg(attrs, "radius", "r"), default=0.0)
    through = first_arg(attrs, "through", "point") or (refs[1] if len(refs) >= 2 else "")
    if radius <= EPSILON and through:
        radius = distance(center, point(context, points, through))
    if radius <= EPSILON:
        raise ValueError(f"circle has no positive radius: {ref}")
    return center_id, center, radius


def circle_geometry(context: ResidualContext, points: Mapping[str, np.ndarray], ref: Any) -> tuple[np.ndarray, float]:
    obj = context.object(ref)
    if not obj:
        raise ValueError(f"unknown circle: {ref}")
    refs = [context.resolve(item) for item in context.object_refs(ref)]
    if len(refs) >= 3 and all(item in points for item in refs[:3]):
        center = circumcenter(points[refs[0]], points[refs[1]], points[refs[2]])
        radius = distance(center, points[refs[0]])
        if radius <= EPSILON:
            raise ValueError(f"circle has no positive radius: {ref}")
        return center, radius
    _, center, radius = circle_data(context, points, ref)
    return center, radius


def target_kind(context: ResidualContext, ref: Any) -> str:
    return context.kind(ref)


def residual_on(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    p_ref = first_arg(args, "point", "p")
    target_ref = first_arg(args, "object", "target", "line", "segment", "circle", "ray")
    p = point(context, points, p_ref)
    kind = target_kind(context, target_ref)
    if kind == "circle":
        center, radius = circle_geometry(context, points, target_ref)
        return [(distance(p, center) - radius) / max(radius, 1.0)]
    a_ref, b_ref = point_pair_from_ref(context, target_ref)
    a = points[a_ref]
    b = points[b_ref]
    scale = max(distance(a, b), 1.0)
    residuals = [signed_distance_to_line(p, a, b) / scale]
    if kind in {"segment", "ray"} or bool(args.get("segment")):
        t = line_parameter(p, a, b)
        residuals.append(max(0.0, -t))
        if kind == "segment" or bool(args.get("segment")):
            residuals.append(max(0.0, t - 1.0))
    return residuals


def residual_parallel(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    if first_arg(args, "object1", "line1", "segment1") and first_arg(args, "object2", "line2", "segment2"):
        a1, b1 = point_pair_from_ref(context, first_arg(args, "object1", "line1", "segment1"))
        a2, b2 = point_pair_from_ref(context, first_arg(args, "object2", "line2", "segment2"))
    else:
        a1, b1 = point_pair_from_args(context, args, "first")
        a2, b2 = point_pair_from_args(context, args, "second")
    d1 = unit_direction(points[a1], points[b1])
    d2 = unit_direction(points[a2], points[b2])
    return [cross2(d1, d2)]


def residual_perpendicular(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    if first_arg(args, "object1", "line1", "segment1") and first_arg(args, "object2", "line2", "segment2"):
        a1, b1 = point_pair_from_ref(context, first_arg(args, "object1", "line1", "segment1"))
        a2, b2 = point_pair_from_ref(context, first_arg(args, "object2", "line2", "segment2"))
    else:
        a1, b1 = point_pair_from_args(context, args, "first")
        a2, b2 = point_pair_from_args(context, args, "second")
    d1 = unit_direction(points[a1], points[b1])
    d2 = unit_direction(points[a2], points[b2])
    return [float(np.dot(d1, d2))]


def distance_pair(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any], prefix: str = "") -> float:
    direct = first_arg(args, prefix, f"{prefix}Segment") if prefix else first_arg(args, "segment")
    if direct:
        return segment_length(context, points, direct)
    a, b = point_pair_from_args(context, args, prefix)
    return distance(points[a], points[b])


def residual_distance_equals(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    if first_arg(args, "left", "leftSegment", "leftA", "left_1"):
        left = distance_pair(context, points, args, "left")
    else:
        left = distance_pair(context, points, args)
    target = first_arg(args, "value", "distance", "length")
    if target not in (None, ""):
        value = number(target)
    else:
        value = distance_pair(context, points, args, "right")
    return [(left - value) / max(abs(value), left, 1.0)]


def residual_ratio(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    if first_arg(args, "left", "leftSegment", "leftA", "left_1"):
        left = distance_pair(context, points, args, "left")
    else:
        a = first_arg(args, "a", "p1")
        b = first_arg(args, "b", "p2")
        if not (a and b):
            raise ValueError("ratio is missing left segment")
        left = distance(point(context, points, a), point(context, points, b))
    if first_arg(args, "right", "rightSegment", "rightA", "right_1"):
        right = distance_pair(context, points, args, "right")
    else:
        c = first_arg(args, "c", "p3")
        d = first_arg(args, "d", "p4")
        if not (c and d):
            raise ValueError("ratio is missing right segment")
        right = distance(point(context, points, c), point(context, points, d))
    ratio = number(first_arg(args, "value", "ratio", "k"), 1.0)
    return [(left - ratio * right) / max(left, abs(ratio * right), 1.0)]


def angle_value(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    v1 = a - b
    v2 = c - b
    n1 = np.linalg.norm(v1)
    n2 = np.linalg.norm(v2)
    if n1 < EPSILON or n2 < EPSILON:
        raise ValueError("degenerate angle")
    dot = float(np.dot(v1, v2) / (n1 * n2))
    return float(math.acos(max(-1.0, min(1.0, dot))))


def angle_points_from_args(context: ResidualContext, args: Mapping[str, Any], prefix: str = "") -> tuple[str, str, str]:
    direct = first_arg(args, prefix, f"{prefix}Angle") if prefix else first_arg(args, "angle")
    values = list_value(direct)
    if len(values) >= 3:
        return point_ref(context, values[0]), point_ref(context, values[1]), point_ref(context, values[2])
    names = (
        (f"{prefix}A", f"{prefix}Vertex", f"{prefix}C")
        if prefix
        else ("a", "vertex", "c")
    )
    a = first_arg(args, names[0], "p1" if not prefix else f"{prefix}1")
    b = first_arg(args, names[1], "b" if not prefix else f"{prefix}B")
    c = first_arg(args, names[2], "p2" if not prefix else f"{prefix}2")
    if a and b and c:
        return point_ref(context, a), point_ref(context, b), point_ref(context, c)
    raise ValueError("missing angle points")


def residual_angle_value(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    a, b, c = angle_points_from_args(context, args)
    actual = angle_value(points[a], points[b], points[c])
    target = angle_target_radians(first_arg(args, "value", "degrees", "radians"))
    return [(actual - target) / math.pi]


def residual_angle_equals(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    a, b, c = angle_points_from_args(context, args, "first")
    d, e, f = angle_points_from_args(context, args, "second")
    return [(angle_value(points[a], points[b], points[c]) - angle_value(points[d], points[e], points[f])) / math.pi]


def residual_midpoint(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    m = point(context, points, first_arg(args, "point", "midpoint", "m"))
    a = point(context, points, first_arg(args, "a", "from", "p1"))
    b = point(context, points, first_arg(args, "b", "to", "p2"))
    scale = max(distance(a, b), 1.0)
    delta = (m - (a + b) / 2.0) / scale
    return [float(delta[0]), float(delta[1])]


def residual_intersection(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    p_ref = first_arg(args, "point", "intersection", "p")
    first = first_arg(args, "first", "object1", "a")
    second = first_arg(args, "second", "object2", "b")
    residuals: List[float] = []
    residuals.extend(residual_on(context, points, {"point": p_ref, "object": first}))
    residuals.extend(residual_on(context, points, {"point": p_ref, "object": second}))
    return residuals


def residual_tangent(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    line_ref = first_arg(args, "line", "segment", "ray")
    circle_ref = first_arg(args, "circle")
    if not line_ref or not circle_ref:
        first = first_arg(args, "first", "object1")
        second = first_arg(args, "second", "object2")
        if target_kind(context, first) == "circle" and target_kind(context, second) == "circle":
            c1, r1 = circle_geometry(context, points, first)
            c2, r2 = circle_geometry(context, points, second)
            mode = normalize_type(str(first_arg(args, "mode", "kind") or "external"))
            target = abs(r1 - r2) if mode == "internal" else r1 + r2
            return [(distance(c1, c2) - target) / max(target, 1.0)]
        if target_kind(context, first) == "circle":
            circle_ref, line_ref = first, second
        else:
            line_ref, circle_ref = first, second
    a_ref, b_ref = point_pair_from_ref(context, line_ref)
    center, radius = circle_geometry(context, points, circle_ref)
    residuals = [abs(signed_distance_to_line(center, points[a_ref], points[b_ref])) / max(radius, 1.0) - 1.0]
    tangent_point = first_arg(args, "point", "tangentPoint", "touch")
    if tangent_point:
        residuals.extend(residual_on(context, points, {"point": tangent_point, "object": line_ref}))
        residuals.extend(residual_on(context, points, {"point": tangent_point, "object": circle_ref}))
    return residuals


def circumcenter(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    matrix = np.array(
        [
            [2 * (b[0] - a[0]), 2 * (b[1] - a[1])],
            [2 * (c[0] - a[0]), 2 * (c[1] - a[1])],
        ],
        dtype=float,
    )
    rhs = np.array(
        [
            b[0] * b[0] + b[1] * b[1] - a[0] * a[0] - a[1] * a[1],
            c[0] * c[0] + c[1] * c[1] - a[0] * a[0] - a[1] * a[1],
        ],
        dtype=float,
    )
    if abs(float(np.linalg.det(matrix))) < EPSILON:
        raise ValueError("first three concyclic points are collinear")
    return np.linalg.solve(matrix, rhs)


def residual_concyclic(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    refs = [point_ref(context, item) for item in list_value(first_arg(args, "points", "items"))]
    if len(refs) < 4:
        refs = [point_ref(context, first_arg(args, key)) for key in ("a", "b", "c", "d") if first_arg(args, key)]
    if len(refs) < 4:
        raise ValueError("concyclic needs at least four points")
    center = circumcenter(points[refs[0]], points[refs[1]], points[refs[2]])
    radius = distance(center, points[refs[0]])
    return [(distance(center, points[ref]) - radius) / max(radius, 1.0) for ref in refs[3:]]


def residual_collinear(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    refs = [point_ref(context, item) for item in list_value(first_arg(args, "points", "items"))]
    if len(refs) < 3:
        refs = [point_ref(context, first_arg(args, key)) for key in ("a", "b", "c", "d") if first_arg(args, key)]
    if len(refs) < 3:
        raise ValueError("collinear needs at least three points")
    a = points[refs[0]]
    b = points[refs[1]]
    scale = max(distance(a, b), 1.0)
    return [signed_distance_to_line(points[ref], a, b) / scale for ref in refs[2:]]


def residual_circumcenter(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    center = point(context, points, first_arg(args, "center", "point", "o"))
    refs = [point_ref(context, item) for item in list_value(first_arg(args, "points", "triangle", "items"))]
    if len(refs) < 3:
        refs = [point_ref(context, first_arg(args, key)) for key in ("a", "b", "c") if first_arg(args, key)]
    if len(refs) < 3:
        raise ValueError("circumcenter needs three points")
    expected = circumcenter(points[refs[0]], points[refs[1]], points[refs[2]])
    radius = max(distance(expected, points[refs[0]]), 1.0)
    delta = (center - expected) / radius
    return [float(delta[0]), float(delta[1])]


def residual_side_relation(
    context: ResidualContext,
    points: Mapping[str, np.ndarray],
    args: Mapping[str, Any],
    *,
    opposite: bool,
) -> List[float]:
    first = point(context, points, first_arg(args, "first", "p1", "a"))
    second = point(context, points, first_arg(args, "second", "p2", "b"))
    line_ref = first_arg(args, "line", "object", "baseline")
    line_a, line_b = point_pair_from_ref(context, line_ref)
    a = points[line_a]
    b = points[line_b]
    scale = max(distance(a, b), 1.0)
    s1 = signed_distance_to_line(first, a, b) / scale
    s2 = signed_distance_to_line(second, a, b) / scale
    product = s1 * s2
    if opposite:
        return [max(0.0, product)]
    return [max(0.0, -product)]


def residual_orientation(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    a = point(context, points, first_arg(args, "a", "p1"))
    b = point(context, points, first_arg(args, "b", "p2"))
    c = point(context, points, first_arg(args, "c", "p3"))
    desired = normalize_type(str(first_arg(args, "value", "orientation", "sign") or "ccw"))
    area = cross2(b - a, c - a)
    scale = max(distance(a, b) * distance(a, c), 1.0)
    if desired in {"auto", "either", "any", "nonzero", "non_collinear", "noncollinear"}:
        return [max(0.0, ORIENTATION_MIN_AREA_RATIO - abs(area) / scale)]
    sign = -1.0 if desired in {"cw", "clockwise", "negative"} else 1.0
    return [max(0.0, -sign * area / scale)]


def residual_convex_polygon(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    refs = polygon_point_refs(context, args)
    if len(refs) < 3:
        raise ValueError("convex polygon needs at least three vertices")
    coords = [points[ref] for ref in refs]
    desired = normalize_type(str(first_arg(args, "value", "orientation", "sign") or "auto"))
    if desired in {"ccw", "counterclockwise", "positive"}:
        sign = 1.0
    elif desired in {"cw", "clockwise", "negative"}:
        sign = -1.0
    else:
        area2 = polygon_area2(coords)
        sign = 1.0 if area2 >= 0.0 else -1.0
    residuals: List[float] = []
    count = len(coords)
    for index in range(count):
        a = coords[index]
        b = coords[(index + 1) % count]
        c = coords[(index + 2) % count]
        turn = cross2(b - a, c - b)
        scale = max(distance(a, b) * distance(b, c), 1.0)
        residuals.append(max(0.0, CONVEX_MIN_TURN_RATIO - sign * turn / scale))
    return residuals


def polygon_point_refs(context: ResidualContext, args: Mapping[str, Any]) -> List[str]:
    direct = list_value(first_arg(args, "points", "vertices", "items"))
    if direct:
        return [point_ref(context, item) for item in direct]
    target_ref = first_arg(args, "object", "polygon", "target", "quadrilateral")
    if target_ref:
        refs = context.object_refs(target_ref)
        if refs:
            return [point_ref(context, item) for item in refs]
    refs = [first_arg(args, key) for key in ("a", "b", "c", "d", "e", "f")]
    return [point_ref(context, item) for item in refs if item]


def polygon_area2(coords: Sequence[np.ndarray]) -> float:
    total = 0.0
    for index, coord in enumerate(coords):
        nxt = coords[(index + 1) % len(coords)]
        total += cross2(coord, nxt)
    return float(total)


def residual_order(context: ResidualContext, points: Mapping[str, np.ndarray], args: Mapping[str, Any]) -> List[float]:
    p = point(context, points, first_arg(args, "point", "middle", "p"))
    a = point(context, points, first_arg(args, "a", "from", "start"))
    b = point(context, points, first_arg(args, "b", "to", "end"))
    scale = max(distance(a, b), 1.0)
    t = line_parameter(p, a, b)
    return [signed_distance_to_line(p, a, b) / scale, max(0.0, -t), max(0.0, t - 1.0)]


def residual_inside_outside(
    context: ResidualContext,
    points: Mapping[str, np.ndarray],
    args: Mapping[str, Any],
    *,
    inside: bool,
) -> List[float]:
    p = point(context, points, first_arg(args, "point", "p"))
    target_ref = first_arg(args, "object", "target", "circle")
    if target_kind(context, target_ref) != "circle":
        return [0.0]
    _, center, radius = circle_data(context, points, target_ref)
    signed = distance(p, center) - radius
    if inside:
        return [max(0.0, signed / max(radius, 1.0))]
    return [max(0.0, -signed / max(radius, 1.0))]


def flatten_evaluations(evaluations: Iterable[ConstraintEvaluation]) -> List[float]:
    values: List[float] = []
    for evaluation in evaluations:
        values.extend(evaluation.components)
    return values
