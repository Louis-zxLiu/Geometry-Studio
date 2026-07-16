from __future__ import annotations

import math
import re
from typing import Any, Dict, List


class DSLExecutionError(RuntimeError):
    pass


def strip_dsl_code(code: str) -> str:
    text = str(code or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    fenced = re.search(r"```(?:dsl|text)?\s*(.*?)```", text, flags=re.S | re.I)
    if fenced:
        text = fenced.group(1).strip()
    if "**Action:**" in text:
        parts = text.split("**Action:**", 1)[-1]
        fenced = re.search(r"```(?:dsl|text)?\s*(.*?)```", parts, flags=re.S | re.I)
        if fenced:
            text = fenced.group(1).strip()
    return text.strip()


def strip_dsl_comment(line: str) -> str:
    return line.split("#", 1)[0].strip()


def normalize_dsl_label(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]+", "_", str(value or "").strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    if not cleaned:
        return "obj"
    if cleaned[0].isdigit():
        return "obj_" + cleaned
    return cleaned


def distance_between(a: Dict[str, float], b: Dict[str, float]) -> float:
    return math.hypot(float(a["x"]) - float(b["x"]), float(a["y"]) - float(b["y"]))


def eval_dsl_number(token: str, env: Dict[str, Any], *, angle: bool = False) -> float:
    raw = str(token or "").strip()
    if not raw:
        raise DSLExecutionError("empty numeric expression")
    if raw in env["values"]:
        return float(env["values"][raw])

    def replace_rad(match: re.Match[str]) -> str:
        return str(math.degrees(float(match.group(1))))

    expr = raw.replace("^", "**").replace("º", "°").replace("掳", "°")
    expr = re.sub(r"(?<![A-Za-z_])(-?\d+(?:\.\d+)?)\s*(?:rad|r)(?![A-Za-z_])", replace_rad, expr)
    expr = re.sub(r"(?<![A-Za-z_])(-?\d+(?:\.\d+)?)\s*(?:deg|°)(?![A-Za-z_])", r"\1", expr)
    if angle:
        expr = re.sub(r"^(-?\d+(?:\.\d+)?)[°?]$", r"\1", expr)
    if angle and re.fullmatch(r"-?\d+(?:\.\d+)?", expr):
        return float(expr)

    def cos_degree(value: float) -> float:
        return math.cos(math.radians(float(value)))

    def sin_degree(value: float) -> float:
        return math.sin(math.radians(float(value)))

    def tan_degree(value: float) -> float:
        return math.tan(math.radians(float(value)))

    names = {
        "cos": cos_degree,
        "sin": sin_degree,
        "tan": tan_degree,
        "sqrt": math.sqrt,
        "abs": abs,
        "pi": math.pi,
        **{key: float(value) for key, value in env["values"].items()},
    }
    if not re.fullmatch(r"[A-Za-z0-9_+\-*/().,]+", expr):
        raise DSLExecutionError(f"unsupported numeric expression: {raw}")
    try:
        return float(eval(expr, {"__builtins__": {}}, names))
    except Exception as exc:
        raise DSLExecutionError(f"cannot evaluate expression '{raw}': {exc}") from exc


def require_point(env: Dict[str, Any], label: str) -> Dict[str, float]:
    if label not in env["points"]:
        raise DSLExecutionError(f"undefined point '{label}'")
    return env["points"][label]


def line_from_points(env: Dict[str, Any], a_label: str, b_label: str, label: str = "") -> Dict[str, Any]:
    a = require_point(env, a_label)
    b = require_point(env, b_label)
    dx = float(b["x"]) - float(a["x"])
    dy = float(b["y"]) - float(a["y"])
    if abs(dx) + abs(dy) < 1e-9:
        raise DSLExecutionError(f"cannot construct line from coincident points {a_label}, {b_label}")
    return {"id": label, "point": {"x": float(a["x"]), "y": float(a["y"])}, "dir": {"x": dx, "y": dy}, "through": [a_label, b_label]}


def line_like_object(env: Dict[str, Any], label: str) -> Dict[str, Any]:
    if label in env["lines"]:
        return env["lines"][label]
    if label in env["rays"]:
        return env["rays"][label]
    if label in env["segments"]:
        segment = env["segments"][label]
        return line_from_points(env, segment["from"], segment["to"], label)
    raise DSLExecutionError(f"undefined line-like object '{label}'")


def add_point(env: Dict[str, Any], label: str, x: float, y: float, *, generated: bool = False) -> None:
    if label in env["points"]:
        raise DSLExecutionError(f"duplicate point '{label}'")
    env["points"][label] = {"id": label, "label": label if not generated else "", "x": float(x), "y": float(y), "generated": generated}


def deterministic_free_point(env: Dict[str, Any]) -> Dict[str, float]:
    index = len(env["points"]) + 1
    angle = math.radians((index * 73) % 360)
    radius = 4.0 + 0.35 * (index % 5)
    return {"x": radius * math.cos(angle), "y": radius * math.sin(angle)}


def point_on_line(line: Dict[str, Any], offset: float = 0.35) -> Dict[str, float]:
    dx = float(line["dir"]["x"])
    dy = float(line["dir"]["y"])
    length = math.hypot(dx, dy) or 1.0
    return {
        "x": float(line["point"]["x"]) + offset * dx / length,
        "y": float(line["point"]["y"]) + offset * dy / length,
    }


def execute_geometry_dsl(code: str) -> Dict[str, Any]:
    env: Dict[str, Any] = {
        "points": {},
        "segments": {},
        "lines": {},
        "rays": {},
        "circles": {},
        "values": {},
        "angles": {},
        "steps": [],
    }
    dsl_code = strip_dsl_code(code)
    for line_number, original_line in enumerate(dsl_code.splitlines(), start=1):
        line = strip_dsl_comment(original_line)
        if not line:
            continue
        if ":" not in line or "->" not in line:
            raise DSLExecutionError(f"line {line_number}: expected 'command : inputs -> outputs'")
        command, rest = line.split(":", 1)
        input_text, output_text = rest.split("->", 1)
        command = command.strip().lower()
        inputs = [item for item in input_text.strip().split() if item]
        outputs = [normalize_dsl_label(item) for item in output_text.strip().split() if item]
        if not outputs and command not in {"prove"}:
            raise DSLExecutionError(f"line {line_number}: missing output label")
        try:
            execute_dsl_command(env, command, inputs, outputs, line_number)
        except DSLExecutionError as exc:
            raise DSLExecutionError(f"line {line_number}: {exc}") from exc
        env["steps"].append({"line": line_number, "command": command, "inputs": inputs, "outputs": outputs, "source": original_line})
    return {
        "dslCode": dsl_code,
        "objects": {
            "points": list(env["points"].values()),
            "segments": list(env["segments"].values()),
            "lines": list(env["lines"].values()),
            "rays": list(env["rays"].values()),
            "circles": list(env["circles"].values()),
            "values": env["values"],
            "angles": env["angles"],
        },
        "steps": env["steps"],
    }


def execute_dsl_command(env: Dict[str, Any], command: str, inputs: List[str], outputs: List[str], line_number: int) -> None:
    if command == "const":
        if len(inputs) < 2:
            raise DSLExecutionError("const requires type and value")
        env["values"][outputs[0]] = eval_dsl_number(inputs[-1], env)
        return

    if command == "point":
        label = outputs[0]
        if len(inputs) == 0:
            point = deterministic_free_point(env)
            add_point(env, label, point["x"], point["y"])
            return
        if len(inputs) == 1:
            source = inputs[0]
            if source in env["circles"]:
                circle = env["circles"][source]
                center = require_point(env, circle["center"])
                index_angle = math.radians((len(env["points"]) * 67 + 20) % 360)
                add_point(env, label, center["x"] + circle["radius"] * math.cos(index_angle), center["y"] + circle["radius"] * math.sin(index_angle))
                return
            if source in env["segments"]:
                seg = env["segments"][source]
                a = require_point(env, seg["from"])
                b = require_point(env, seg["to"])
                add_point(env, label, (a["x"] + b["x"]) / 2, (a["y"] + b["y"]) / 2)
                return
            line = line_like_object(env, source)
            point = point_on_line(line)
            add_point(env, label, point["x"], point["y"])
            return
        if len(inputs) == 2:
            add_point(env, label, eval_dsl_number(inputs[0], env), eval_dsl_number(inputs[1], env))
            return
        raise DSLExecutionError("point expects zero inputs, one geometric object, or x y")

    if command == "segment":
        if len(inputs) != 2:
            raise DSLExecutionError("segment requires two point labels")
        require_point(env, inputs[0])
        require_point(env, inputs[1])
        env["segments"][outputs[0]] = {"id": outputs[0], "from": inputs[0], "to": inputs[1], "label": outputs[0], "style": ""}
        return

    if command in {"line", "ray"}:
        if len(inputs) != 2:
            raise DSLExecutionError(f"{command} requires two point labels")
        line = line_from_points(env, inputs[0], inputs[1], outputs[0])
        if command == "line":
            env["lines"][outputs[0]] = line
        else:
            env["rays"][outputs[0]] = line
        return

    if command == "circle":
        if len(inputs) != 2:
            raise DSLExecutionError("circle requires center and radius/through point")
        center_label = inputs[0]
        center = require_point(env, center_label)
        through = ""
        if inputs[1] in env["points"]:
            through = inputs[1]
            radius = distance_between(center, require_point(env, through))
        else:
            radius = eval_dsl_number(inputs[1], env)
        if radius <= 0:
            raise DSLExecutionError("circle radius must be positive")
        env["circles"][outputs[0]] = {"id": outputs[0], "center": center_label, "radius": float(radius), "through": through, "label": outputs[0], "style": ""}
        return

    if command == "rotate":
        if len(inputs) != 3:
            raise DSLExecutionError("rotate requires point angle center")
        source = require_point(env, inputs[0])
        center = require_point(env, inputs[2])
        theta = math.radians(eval_dsl_number(inputs[1], env, angle=True))
        dx = source["x"] - center["x"]
        dy = source["y"] - center["y"]
        add_point(env, outputs[0], center["x"] + dx * math.cos(theta) - dy * math.sin(theta), center["y"] + dx * math.sin(theta) + dy * math.cos(theta))
        return

    if command == "midpoint":
        if len(inputs) != 2:
            raise DSLExecutionError("midpoint requires two point labels")
        a = require_point(env, inputs[0])
        b = require_point(env, inputs[1])
        add_point(env, outputs[0], (a["x"] + b["x"]) / 2, (a["y"] + b["y"]) / 2)
        return

    if command in {"parallel_line", "orthogonal_line", "perpendicular_line"}:
        if len(inputs) != 2:
            raise DSLExecutionError(f"{command} requires point and line-like object")
        point_label = inputs[0]
        point = require_point(env, point_label)
        base = line_like_object(env, inputs[1])
        dx = float(base["dir"]["x"])
        dy = float(base["dir"]["y"])
        if command in {"orthogonal_line", "perpendicular_line"}:
            dx, dy = -dy, dx
        env["lines"][outputs[0]] = {"id": outputs[0], "point": {"x": point["x"], "y": point["y"]}, "dir": {"x": dx, "y": dy}, "through": [point_label]}
        return

    if command == "line_bisector":
        if len(inputs) != 2:
            raise DSLExecutionError("line_bisector requires two point labels")
        a = require_point(env, inputs[0])
        b = require_point(env, inputs[1])
        mid = {"x": (a["x"] + b["x"]) / 2, "y": (a["y"] + b["y"]) / 2}
        env["lines"][outputs[0]] = {"id": outputs[0], "point": mid, "dir": {"x": -(b["y"] - a["y"]), "y": b["x"] - a["x"]}, "through": []}
        return

    if command in {"angular_bisector", "angle_bisector"}:
        if len(inputs) != 3:
            raise DSLExecutionError("angular_bisector requires A B C")
        a = require_point(env, inputs[0])
        b = require_point(env, inputs[1])
        c = require_point(env, inputs[2])
        v1x, v1y = a["x"] - b["x"], a["y"] - b["y"]
        v2x, v2y = c["x"] - b["x"], c["y"] - b["y"]
        n1 = math.hypot(v1x, v1y) or 1.0
        n2 = math.hypot(v2x, v2y) or 1.0
        dx = v1x / n1 + v2x / n2
        dy = v1y / n1 + v2y / n2
        if abs(dx) + abs(dy) < 1e-9:
            dx, dy = -v1y, v1x
        env["lines"][outputs[0]] = {"id": outputs[0], "point": {"x": b["x"], "y": b["y"]}, "dir": {"x": dx, "y": dy}, "through": [inputs[1]]}
        return

    if command in {"intersect", "intersection"}:
        if len(inputs) != 2:
            raise DSLExecutionError("intersect requires two objects")
        points = intersect_objects(env, inputs[0], inputs[1])
        if not points:
            raise DSLExecutionError(f"objects {inputs[0]} and {inputs[1]} do not intersect")
        if len(outputs) > len(points):
            raise DSLExecutionError(f"intersect produced {len(points)} point(s), but {len(outputs)} output labels were requested")
        for output, point in zip(outputs, points):
            add_point(env, output, point["x"], point["y"])
        return

    if command == "circumcenter":
        if len(inputs) != 3:
            raise DSLExecutionError("circumcenter requires three point labels")
        center = circumcenter_point(env, inputs[0], inputs[1], inputs[2])
        add_point(env, outputs[0], center["x"], center["y"])
        return

    if command == "circumcircle":
        if len(inputs) != 3:
            raise DSLExecutionError("circumcircle requires three point labels")
        center = circumcenter_point(env, inputs[0], inputs[1], inputs[2])
        center_label = f"__center_{outputs[0]}"
        add_point(env, center_label, center["x"], center["y"], generated=True)
        env["circles"][outputs[0]] = {
            "id": outputs[0],
            "center": center_label,
            "radius": distance_between(env["points"][center_label], require_point(env, inputs[0])),
            "through": inputs[0],
            "label": outputs[0],
            "style": "",
        }
        return

    if command == "incenter":
        if len(inputs) != 3:
            raise DSLExecutionError("incenter requires three point labels")
        center = incenter_point(env, inputs[0], inputs[1], inputs[2])
        add_point(env, outputs[0], center["x"], center["y"])
        return

    if command == "incircle":
        if len(inputs) != 3:
            raise DSLExecutionError("incircle requires three point labels")
        center = incenter_point(env, inputs[0], inputs[1], inputs[2])
        center_label = f"__center_{outputs[0]}"
        add_point(env, center_label, center["x"], center["y"], generated=True)
        line_ab = line_from_points(env, inputs[0], inputs[1], "side_for_incircle")
        radius = point_line_distance(env["points"][center_label], line_ab)
        env["circles"][outputs[0]] = {"id": outputs[0], "center": center_label, "radius": radius, "through": "", "label": outputs[0], "style": ""}
        return

    if command == "distance":
        if len(inputs) != 2:
            raise DSLExecutionError("distance requires two points")
        env["values"][outputs[0]] = distance_between(require_point(env, inputs[0]), require_point(env, inputs[1]))
        return

    if command == "angle":
        if len(inputs) != 3:
            raise DSLExecutionError("angle requires three points")
        env["angles"][outputs[0]] = {"id": outputs[0], "points": inputs[:3]}
        return

    if command in {"equality", "prove"}:
        return

    raise DSLExecutionError(f"unsupported command '{command}'")


def intersect_objects(env: Dict[str, Any], first: str, second: str) -> List[Dict[str, float]]:
    if first in env["circles"] and second in env["circles"]:
        return intersect_circle_circle(env, env["circles"][first], env["circles"][second])
    if first in env["circles"]:
        return intersect_line_circle(line_like_object(env, second), env, env["circles"][first])
    if second in env["circles"]:
        return intersect_line_circle(line_like_object(env, first), env, env["circles"][second])
    return [intersect_line_line(line_like_object(env, first), line_like_object(env, second))]


def intersect_line_line(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, float]:
    x1, y1 = float(a["point"]["x"]), float(a["point"]["y"])
    dx1, dy1 = float(a["dir"]["x"]), float(a["dir"]["y"])
    x2, y2 = float(b["point"]["x"]), float(b["point"]["y"])
    dx2, dy2 = float(b["dir"]["x"]), float(b["dir"]["y"])
    det = dx1 * dy2 - dy1 * dx2
    if abs(det) < 1e-9:
        raise DSLExecutionError("parallel lines have no finite intersection")
    t = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / det
    return {"x": x1 + t * dx1, "y": y1 + t * dy1}


def intersect_line_circle(line: Dict[str, Any], env: Dict[str, Any], circle: Dict[str, Any]) -> List[Dict[str, float]]:
    center = require_point(env, circle["center"])
    px, py = float(line["point"]["x"]), float(line["point"]["y"])
    dx, dy = float(line["dir"]["x"]), float(line["dir"]["y"])
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    cx, cy = float(center["x"]), float(center["y"])
    projection = (cx - px) * ux + (cy - py) * uy
    closest_x = px + projection * ux
    closest_y = py + projection * uy
    dist_sq = (closest_x - cx) ** 2 + (closest_y - cy) ** 2
    radius_sq = float(circle["radius"]) ** 2
    if dist_sq > radius_sq + 1e-7:
        return []
    delta = math.sqrt(max(0.0, radius_sq - dist_sq))
    points = [{"x": closest_x + delta * ux, "y": closest_y + delta * uy}]
    if delta > 1e-7:
        points.append({"x": closest_x - delta * ux, "y": closest_y - delta * uy})
    return points


def intersect_circle_circle(env: Dict[str, Any], a: Dict[str, Any], b: Dict[str, Any]) -> List[Dict[str, float]]:
    ca = require_point(env, a["center"])
    cb = require_point(env, b["center"])
    x0, y0 = float(ca["x"]), float(ca["y"])
    x1, y1 = float(cb["x"]), float(cb["y"])
    r0, r1 = float(a["radius"]), float(b["radius"])
    dx, dy = x1 - x0, y1 - y0
    d = math.hypot(dx, dy)
    if d < 1e-9 or d > r0 + r1 + 1e-7 or d < abs(r0 - r1) - 1e-7:
        return []
    along = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
    height_sq = max(0.0, r0 * r0 - along * along)
    height = math.sqrt(height_sq)
    xm = x0 + along * dx / d
    ym = y0 + along * dy / d
    rx = -dy * height / d
    ry = dx * height / d
    points = [{"x": xm + rx, "y": ym + ry}]
    if height > 1e-7:
        points.append({"x": xm - rx, "y": ym - ry})
    return points


def circumcenter_point(env: Dict[str, Any], a_label: str, b_label: str, c_label: str) -> Dict[str, float]:
    a = require_point(env, a_label)
    b = require_point(env, b_label)
    c = require_point(env, c_label)
    ax, ay = float(a["x"]), float(a["y"])
    bx, by = float(b["x"]), float(b["y"])
    cx, cy = float(c["x"]), float(c["y"])
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(d) < 1e-9:
        raise DSLExecutionError("cannot build circumcenter for collinear points")
    ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
    uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
    return {"x": ux, "y": uy}


def incenter_point(env: Dict[str, Any], a_label: str, b_label: str, c_label: str) -> Dict[str, float]:
    a = require_point(env, a_label)
    b = require_point(env, b_label)
    c = require_point(env, c_label)
    side_a = distance_between(b, c)
    side_b = distance_between(a, c)
    side_c = distance_between(a, b)
    perimeter = side_a + side_b + side_c
    if perimeter <= 1e-9:
        raise DSLExecutionError("cannot build incenter for degenerate triangle")
    return {
        "x": (side_a * a["x"] + side_b * b["x"] + side_c * c["x"]) / perimeter,
        "y": (side_a * a["y"] + side_b * b["y"] + side_c * c["y"]) / perimeter,
    }


def point_line_distance(point: Dict[str, float], line: Dict[str, Any]) -> float:
    px, py = float(point["x"]), float(point["y"])
    lx, ly = float(line["point"]["x"]), float(line["point"]["y"])
    dx, dy = float(line["dir"]["x"]), float(line["dir"]["y"])
    length = math.hypot(dx, dy)
    if length <= 1e-9:
        raise DSLExecutionError("cannot measure distance to degenerate line")
    return abs((px - lx) * dy - (py - ly) * dx) / length
