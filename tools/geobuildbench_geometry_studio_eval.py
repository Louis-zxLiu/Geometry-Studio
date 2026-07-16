#!/usr/bin/env python3
"""Evaluate Geometry Studio's geometry multi-agent workflow on GeoBuildBench.

This runner feeds GeoBuildBench problems into internal/bridge/geometry_agent.py,
auto-accepts the teacher review, auto-acknowledges the runtime probe, converts
the emitted GeometryScene to GeoBuildBench DSL, and scores it with the official
GeoBuildBench DSLValidator.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import queue
import random
import re
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from copy import deepcopy
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
AGENT_PATH = REPO_ROOT / "internal" / "bridge" / "geometry_agent.py"
DEFAULT_PYTHON = REPO_ROOT / "runtime" / "Scripts" / "python.exe"
MOJIBAKE_MARKERS = (
    "鍥",
    "鈭",
    "掳",
    "銆",
    "浜",
    "鐐",
    "涓",
    "柍",
    "姍",
    "垹",
    "濡",
    "矨",
    "绾",
    "寰",
    "庣",
)
RATE_LIMIT_MARKERS = (
    "429",
    "rate_limit",
    "rate limit",
    "too many requests",
    "concurrency limit exceeded",
)
STRUCTURE_VALIDATION_MARKERS = (
    "validation error for geometryspecmodel",
    "pydantic",
    "input should be a valid dictionary",
    "field required",
    "extra inputs are not permitted",
)


def configure_console_encoding() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


@dataclass
class ProblemRun:
    problem_id: str
    subject: str
    category: str
    difficulty: str
    success: bool
    agent_status: str
    object_score: float
    condition_score: float
    total_score: float
    missing_objects_count: int
    failed_conditions_count: int
    proof_markdown_chars: int
    proof_steps_count: int
    note_markdown_chars: int
    duration_seconds: float
    dsl_path: str
    error_text: str


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def mojibake_score(text: str) -> int:
    return text.count("\ufffd") * 8 + sum(text.count(marker) for marker in MOJIBAKE_MARKERS)


def repair_mojibake_text(value: Any) -> Any:
    if not isinstance(value, str) or not value:
        return value
    original_score = mojibake_score(value)
    if original_score == 0:
        return value
    candidates = [value]
    for encoding in ("gbk", "cp936", "gb18030"):
        try:
            candidates.append(value.encode(encoding).decode("utf-8"))
        except UnicodeError:
            continue
    return min(candidates, key=lambda text: (mojibake_score(text), -len(text)))


def repair_problem_text_fields(problem: dict[str, Any]) -> dict[str, Any]:
    repaired = deepcopy(problem)
    for key in ("subject", "cleaned_text", "original_text"):
        repaired[key] = repair_mojibake_text(repaired.get(key))
    return repaired


def is_retryable_rate_limit(final_event: dict[str, Any]) -> bool:
    text = json.dumps(final_event, ensure_ascii=False).lower()
    return any(marker in text for marker in RATE_LIMIT_MARKERS)


def is_retryable_structure_failure(final_event: dict[str, Any]) -> bool:
    text = json.dumps(final_event, ensure_ascii=False).lower()
    return any(marker in text for marker in STRUCTURE_VALIDATION_MARKERS)


def import_geobuildbench(geobuildbench_root: Path) -> None:
    root = geobuildbench_root.resolve()
    if not (root / "src" / "dsl" / "dsl_validator.py").exists():
        raise FileNotFoundError(f"GeoBuildBench root is invalid: {root}")
    sys.path.insert(0, str(root))


def sanitize_label(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    text = re.sub(r"[^0-9A-Za-z_]", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    if not text:
        text = fallback
    if re.match(r"^[0-9]", text):
        text = "p_" + text
    return text


def label_candidates(point: dict[str, Any]) -> list[str]:
    values = []
    for key in ("id", "label"):
        value = str(point.get(key) or "").strip()
        if value:
            values.append(value)
            cleaned = sanitize_label(value, "")
            if cleaned and cleaned != value:
                values.append(cleaned)
    return values


def choose_point_labels(scene: dict[str, Any], required_points: list[str]) -> tuple[dict[str, str], list[dict[str, Any]]]:
    points = scene.get("points") or []
    required = [str(p) for p in required_points]
    used: set[str] = set()
    id_to_label: dict[str, str] = {}
    ordered_points: list[dict[str, Any]] = []

    for req in required:
        for point in points:
            point_id = str(point.get("id") or "")
            if point_id in id_to_label:
                continue
            candidates = label_candidates(point)
            if req in candidates or req.lower() in [c.lower() for c in candidates]:
                id_to_label[point_id] = req
                used.add(req)
                ordered_points.append(point)
                break

    for index, point in enumerate(points, start=1):
        point_id = str(point.get("id") or f"point_{index}")
        if point_id in id_to_label:
            continue
        preferred = ""
        for candidate in label_candidates(point):
            if candidate and candidate not in used:
                preferred = candidate
                break
        label = sanitize_label(preferred, f"P{index}")
        suffix = 2
        base = label
        while label in used:
            label = f"{base}_{suffix}"
            suffix += 1
        id_to_label[point_id] = label
        used.add(label)
        ordered_points.append(point)

    return id_to_label, ordered_points


def scene_to_geobuildbench_dsl(scene: dict[str, Any], required_objects: dict[str, Any]) -> str:
    id_to_label, ordered_points = choose_point_labels(scene, required_objects.get("points") or [])
    lines: list[str] = []

    for point in ordered_points:
        point_id = str(point.get("id") or "")
        label = id_to_label.get(point_id)
        if not label:
            continue
        x = float(point.get("x") or 0)
        y = float(point.get("y") or 0)
        lines.append(f"point : {x:.8g} {y:.8g} -> {label}")

    used_outputs: set[str] = set(id_to_label.values())

    def output_name(prefix: str, *parts: str) -> str:
        base = sanitize_label("_".join([prefix, *parts]), prefix)
        name = base
        suffix = 2
        while name in used_outputs:
            name = f"{base}_{suffix}"
            suffix += 1
        used_outputs.add(name)
        return name

    def point_label(point_ref: Any) -> str:
        ref = str(point_ref or "").strip()
        return id_to_label.get(ref, sanitize_label(ref, ref))

    segment_pairs: set[tuple[str, str]] = set()

    def add_segment(a_ref: Any, b_ref: Any) -> None:
        a = point_label(a_ref)
        b = point_label(b_ref)
        if not a or not b or a == b:
            return
        key = tuple(sorted((a, b)))
        if key in segment_pairs:
            return
        segment_pairs.add(key)
        lines.append(f"segment : {a} {b} -> {output_name('seg', a, b)}")

    for segment in scene.get("segments") or []:
        add_segment(segment.get("from"), segment.get("to"))

    for polygon in scene.get("polygons") or []:
        poly_points = polygon.get("points") or []
        for index, point_ref in enumerate(poly_points):
            add_segment(point_ref, poly_points[(index + 1) % len(poly_points)])

    for circle in scene.get("circles") or []:
        center = point_label(circle.get("center"))
        through = point_label(circle.get("through"))
        if not center:
            continue
        if through:
            lines.append(f"circle : {center} {through} -> {output_name('circle', center, through)}")
            continue
        radius = float(circle.get("radius") or 0)
        if radius > 0:
            lines.append(f"circle : {center} {radius:.8g} -> {output_name('circle', center)}")

    return "\n".join(lines) + "\n"


def construction_to_scene_for_export(construction: dict[str, Any], fallback_scene: dict[str, Any]) -> dict[str, Any]:
    objects = [item for item in construction.get("objects") or [] if isinstance(item, dict)]
    if not objects:
        return fallback_scene
    solution = construction.get("solution") or {}
    solved_points = solution.get("points") or {}
    if not isinstance(solved_points, dict) or not solved_points:
        return fallback_scene

    points: list[dict[str, Any]] = []
    for obj in objects:
        if str(obj.get("kind") or "").lower() != "point":
            continue
        point_id = str(obj.get("id") or "")
        coords = solved_points.get(point_id)
        if not isinstance(coords, dict):
            continue
        points.append(
            {
                "id": point_id,
                "label": str(obj.get("label") or point_id),
                "x": float(coords.get("x") or 0.0),
                "y": float(coords.get("y") or 0.0),
            }
        )

    segments: list[dict[str, Any]] = []
    circles: list[dict[str, Any]] = []
    polygons: list[dict[str, Any]] = []
    circles_by_id = solution.get("circles") if isinstance(solution.get("circles"), dict) else {}

    for obj in objects:
        kind = str(obj.get("kind") or "").lower()
        refs = [str(ref) for ref in obj.get("refs") or []]
        obj_id = str(obj.get("id") or "")
        if kind in {"segment", "line", "ray"} and len(refs) >= 2:
            segments.append({"id": obj_id, "from": refs[0], "to": refs[1], "label": str(obj.get("label") or obj_id)})
        elif kind == "polygon" and len(refs) >= 3:
            polygons.append({"id": obj_id, "points": refs, "label": str(obj.get("label") or obj_id)})
        elif kind == "circle":
            circle = circles_by_id.get(obj_id) if isinstance(circles_by_id, dict) else None
            attrs = obj.get("attributes") if isinstance(obj.get("attributes"), dict) else {}
            center = ""
            through = ""
            radius = 0.0
            if isinstance(circle, dict):
                center = str(circle.get("center") or "")
                through = str(circle.get("through") or "")
                radius = float(circle.get("radius") or 0.0)
            if not center and refs:
                center = refs[0]
            if not through and len(refs) >= 2:
                through = refs[1]
            if radius <= 0:
                radius = float(attrs.get("radius") or attrs.get("r") or 0.0)
            circles.append(
                {
                    "id": obj_id,
                    "center": center,
                    "through": through,
                    "radius": radius,
                    "label": str(obj.get("label") or obj_id),
                }
            )

    return {
        "points": points or fallback_scene.get("points") or [],
        "segments": segments or fallback_scene.get("segments") or [],
        "circles": circles or fallback_scene.get("circles") or [],
        "polygons": polygons or fallback_scene.get("polygons") or [],
    }


def construction_to_geobuildbench_dsl(
    construction: dict[str, Any],
    scene: dict[str, Any],
    required_objects: dict[str, Any],
) -> str:
    export_scene = construction_to_scene_for_export(construction, scene)
    return scene_to_geobuildbench_dsl(export_scene, required_objects)


def reader_thread(proc: subprocess.Popen[str], out_queue: queue.Queue[str]) -> None:
    assert proc.stdout is not None
    for line in proc.stdout:
        out_queue.put(line)


def send_command(proc: subprocess.Popen[str], command: dict[str, Any]) -> None:
    assert proc.stdin is not None
    proc.stdin.write(json.dumps(command, ensure_ascii=False) + "\n")
    proc.stdin.flush()


def run_agent(
    problem: dict[str, Any],
    python_exe: Path,
    settings: dict[str, str],
    timeout_seconds: int,
    spawn_retries: int,
    agent_max_attempts: int,
) -> tuple[str, dict[str, Any], list[dict[str, Any]], float]:
    session_id = f"geobuildbench-{problem['id']}-{uuid.uuid4().hex[:8]}"
    start_time = time.time()
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"

    proc: subprocess.Popen[str] | None = None
    launch_error = ""
    for attempt in range(max(1, spawn_retries + 1)):
        try:
            proc = subprocess.Popen(
                [str(python_exe), str(AGENT_PATH)],
                cwd=str(REPO_ROOT),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
                bufsize=1,
            )
            break
        except OSError as exc:
            launch_error = repr(exc)
            if attempt >= spawn_retries:
                duration = time.time() - start_time
                return (
                    "failed",
                    {
                        "type": "failed",
                        "errorText": f"failed to launch geometry agent after {attempt + 1} attempts: {launch_error}",
                    },
                    [],
                    duration,
                )
            time.sleep(min(30.0, 0.5 * (2**attempt)))

    assert proc is not None

    out_queue: queue.Queue[str] = queue.Queue()
    thread = threading.Thread(target=reader_thread, args=(proc, out_queue), daemon=True)
    thread.start()

    send_command(
        proc,
        {
            "type": "start",
            "sessionId": session_id,
            "request": {
                "sceneName": f"geobuildbench-{problem['id']}",
                "imageDataUrl": "",
                "problemText": problem.get("subject") or problem.get("cleaned_text") or problem.get("original_text") or "",
                "currentCode": "",
                "maxAttempts": max(1, agent_max_attempts),
                "settings": settings,
            },
        },
    )

    events: list[dict[str, Any]] = []
    final_event: dict[str, Any] = {}
    deadline = time.time() + timeout_seconds

    while time.time() < deadline:
        if proc.poll() is not None and out_queue.empty():
            break
        try:
            line = out_queue.get(timeout=1)
        except queue.Empty:
            continue
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            events.append({"type": "stdout_parse_error", "line": line})
            continue
        events.append(event)

        event_type = event.get("type")
        if event_type == "review_required":
            send_command(
                proc,
                {
                    "type": "resume_review",
                    "sessionId": session_id,
                    "spec": event.get("spec") or {},
                },
            )
        elif event_type == "runtime_probe":
            send_command(
                proc,
                {
                    "type": "probe_result",
                    "sessionId": session_id,
                    "probeResult": {"ok": True, "errorText": "", "repairable": False},
                },
            )
        elif event_type in {"succeeded", "failed", "interrupted"}:
            final_event = event
            break

    duration = time.time() - start_time
    if not final_event:
        try:
            proc.kill()
        except Exception:
            pass
        stderr = ""
        if proc.stderr is not None:
            stderr = proc.stderr.read()
        final_event = {
            "type": "failed",
            "errorText": f"agent timeout or exited without final event after {duration:.1f}s",
            "diagnostics": stderr.splitlines()[-12:],
        }
    else:
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    return final_event.get("type", "failed"), final_event, events, duration


def validate_dsl(dsl_code: str, problem: Any, validator: Any) -> dict[str, Any]:
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
        handle.write(dsl_code)
        dsl_path = handle.name
    try:
        result = validator.validate(dsl_path, problem)
        return result.to_dict()
    finally:
        try:
            os.unlink(dsl_path)
        except OSError:
            pass


def count_missing(missing: dict[str, Any]) -> int:
    return sum(len(value or []) for value in missing.values())


def summarize_runs(runs: list[dict[str, Any]]) -> dict[str, Any]:
    evaluated = [run for run in runs if run.get("validation_result")]
    successes = [run for run in evaluated if run["validation_result"].get("success")]
    missing_by_type: Counter[str] = Counter()
    failed_by_type: Counter[str] = Counter()

    for run in evaluated:
        validation = run["validation_result"]
        for object_type, values in (validation.get("missing_objects") or {}).items():
            missing_by_type[object_type] += len(values or [])
        for condition in validation.get("failed_conditions") or []:
            failed_by_type[str(condition.get("type") or "unknown")] += 1

    def avg(key: str) -> float:
        if not evaluated:
            return 0.0
        return sum(float(run["validation_result"].get(key) or 0.0) for run in evaluated) / len(evaluated)

    return {
        "total_runs": len(runs),
        "evaluated_runs": len(evaluated),
        "agent_succeeded": sum(1 for run in runs if run.get("agent_status") == "succeeded"),
        "successes": len(successes),
        "success_rate": len(successes) / len(evaluated) if evaluated else 0.0,
        "average_object_score": avg("object_score"),
        "average_condition_score": avg("condition_score"),
        "average_total_score": avg("total_score"),
        "missing_objects_by_type": dict(missing_by_type),
        "failed_conditions_by_type": dict(failed_by_type),
        "average_duration_seconds": sum(float(run.get("duration_seconds") or 0.0) for run in runs) / len(runs) if runs else 0.0,
        "proof_generated_rate": (
            sum(1 for run in runs if int(run.get("proof_markdown_chars") or 0) > 0) / len(runs)
            if runs
            else 0.0
        ),
    }


def group_summary(runs: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for run in runs:
        groups[str(run.get(field) or "unknown")].append(run)
    rows = []
    for name, items in sorted(groups.items()):
        summary = summarize_runs(items)
        rows.append(
            {
                field: name,
                "n": summary["evaluated_runs"],
                "success_rate": summary["success_rate"],
                "object_score": summary["average_object_score"],
                "condition_score": summary["average_condition_score"],
                "total_score": summary["average_total_score"],
            }
        )
    return rows


def markdown_table(headers: list[str], rows: list[list[Any]]) -> str:
    def fmt(value: Any) -> str:
        if isinstance(value, float):
            return f"{value:.3f}"
        return str(value)

    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(fmt(value) for value in row) + " |")
    return "\n".join(lines)


def write_report(output_dir: Path, metadata: dict[str, Any], runs: list[dict[str, Any]]) -> None:
    summary = summarize_runs(runs)
    by_difficulty = group_summary(runs, "difficulty")
    by_category = group_summary(runs, "category")

    lines = [
        "# GeoBuildBench Evaluation: Geometry Studio Multi-Agent",
        "",
        f"- Timestamp: `{metadata['timestamp']}`",
        f"- Model: `{metadata['model']}`",
        f"- Dataset: `{metadata['dataset']}`",
        f"- Problems requested: `{metadata['problems_requested']}`",
        f"- Runtime probe: auto-acknowledged; GeoBuildBench scoring is applied to generated GeometryScene.",
        "",
        "## Overall",
        "",
        markdown_table(
            ["Metric", "Value"],
            [
                ["Total runs", summary["total_runs"]],
                ["Evaluated runs", summary["evaluated_runs"]],
                ["Agent succeeded", summary["agent_succeeded"]],
                ["GeoBuildBench success rate", summary["success_rate"]],
                ["Average object score", summary["average_object_score"]],
                ["Average condition score", summary["average_condition_score"]],
                ["Average total score", summary["average_total_score"]],
                ["Proof generated rate", summary["proof_generated_rate"]],
                ["Average duration seconds", summary["average_duration_seconds"]],
            ],
        ),
        "",
        "## By Difficulty",
        "",
        markdown_table(
            ["Difficulty", "N", "Success Rate", "Object", "Condition", "Total"],
            [
                [
                    row["difficulty"],
                    row["n"],
                    row["success_rate"],
                    row["object_score"],
                    row["condition_score"],
                    row["total_score"],
                ]
                for row in by_difficulty
            ],
        ),
        "",
        "## By Category",
        "",
        markdown_table(
            ["Category", "N", "Success Rate", "Object", "Condition", "Total"],
            [
                [
                    row["category"],
                    row["n"],
                    row["success_rate"],
                    row["object_score"],
                    row["condition_score"],
                    row["total_score"],
                ]
                for row in by_category
            ],
        ),
        "",
        "## Error Breakdown",
        "",
        "Missing objects:",
        "",
        markdown_table(["Type", "Count"], [[k, v] for k, v in sorted(summary["missing_objects_by_type"].items())] or [["none", 0]]),
        "",
        "Failed conditions:",
        "",
        markdown_table(["Type", "Count"], [[k, v] for k, v in sorted(summary["failed_conditions_by_type"].items())] or [["none", 0]]),
        "",
        "## Per-Problem",
        "",
        markdown_table(
            ["ID", "Difficulty", "Category", "Success", "Object", "Condition", "Total", "Missing", "Failed Conds", "Proof Chars", "Seconds"],
            [
                [
                    run["problem_id"],
                    run["difficulty"],
                    run["category"],
                    bool((run.get("validation_result") or {}).get("success")),
                    float((run.get("validation_result") or {}).get("object_score") or 0.0),
                    float((run.get("validation_result") or {}).get("condition_score") or 0.0),
                    float((run.get("validation_result") or {}).get("total_score") or 0.0),
                    run.get("missing_objects_count", 0),
                    run.get("failed_conditions_count", 0),
                    run.get("proof_markdown_chars", 0),
                    float(run.get("duration_seconds") or 0.0),
                ]
                for run in runs
            ],
        ),
        "",
    ]
    (output_dir / "report.md").write_text("\n".join(lines), encoding="utf-8")


def write_csv(output_dir: Path, runs: list[dict[str, Any]]) -> None:
    fields = [
        "problem_id",
        "difficulty",
        "category",
        "agent_status",
        "success",
        "object_score",
        "condition_score",
        "total_score",
        "missing_objects_count",
        "failed_conditions_count",
        "proof_markdown_chars",
        "proof_steps_count",
        "note_markdown_chars",
        "duration_seconds",
        "error_text",
        "dsl_path",
    ]
    with (output_dir / "per_problem.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for run in runs:
            validation = run.get("validation_result") or {}
            writer.writerow(
                {
                    "problem_id": run.get("problem_id"),
                    "difficulty": run.get("difficulty"),
                    "category": run.get("category"),
                    "agent_status": run.get("agent_status"),
                    "success": bool(validation.get("success")),
                    "object_score": validation.get("object_score", 0.0),
                    "condition_score": validation.get("condition_score", 0.0),
                    "total_score": validation.get("total_score", 0.0),
                    "missing_objects_count": run.get("missing_objects_count", 0),
                    "failed_conditions_count": run.get("failed_conditions_count", 0),
                    "proof_markdown_chars": run.get("proof_markdown_chars", 0),
                    "proof_steps_count": run.get("proof_steps_count", 0),
                    "note_markdown_chars": run.get("note_markdown_chars", 0),
                    "duration_seconds": f"{float(run.get('duration_seconds') or 0.0):.3f}",
                    "error_text": run.get("error_text", ""),
                    "dsl_path": run.get("dsl_path", ""),
                }
            )


def evaluate_problem(
    index: int,
    total: int,
    problem: dict[str, Any],
    problem_object: Any,
    python_exe: Path,
    settings: dict[str, str],
    timeout_seconds: int,
    spawn_retries: int,
    agent_max_attempts: int,
    rate_limit_retries: int,
    rate_limit_base_delay: float,
    rate_limit_max_delay: float,
    structure_retries: int,
    structure_base_delay: float,
    dsl_dir: Path,
    event_dir: Path,
) -> dict[str, Any]:
    from src.dsl.dsl_validator import DSLValidator

    print(f"[{index}/{total}] {problem['id']} {problem.get('category', '')}", flush=True)
    agent_problem = repair_problem_text_fields(problem)
    attempts: list[dict[str, Any]] = []
    total_duration = 0.0
    agent_status = "failed"
    final_event: dict[str, Any] = {}
    events: list[dict[str, Any]] = []
    rate_limit_retry_count = 0
    structure_retry_count = 0
    max_attempts = max(1, rate_limit_retries + structure_retries + 1)

    for attempt_index in range(max_attempts):
        agent_status, final_event, events, duration = run_agent(
            agent_problem,
            python_exe,
            settings,
            timeout_seconds,
            spawn_retries,
            agent_max_attempts,
        )
        total_duration += duration
        rate_limited = is_retryable_rate_limit(final_event)
        structure_failed = (not rate_limited) and is_retryable_structure_failure(final_event)
        attempt_record: dict[str, Any] = {
            "attempt": attempt_index + 1,
            "agent_status": agent_status,
            "duration_seconds": duration,
            "rate_limited": rate_limited,
            "structure_failed": structure_failed,
            "final_event": final_event,
        }
        attempts.append(attempt_record)

        if rate_limited and rate_limit_retry_count < rate_limit_retries:
            rate_limit_retry_count += 1
            delay = min(rate_limit_max_delay, rate_limit_base_delay * (2 ** (rate_limit_retry_count - 1)))
            delay += random.uniform(0, max(1.0, rate_limit_base_delay))
            attempt_record["retry_delay_seconds"] = delay
            print(
                f"[retry rate {rate_limit_retry_count}/{rate_limit_retries}] problem={problem['id']} rate limited; sleeping {delay:.1f}s",
                flush=True,
            )
            time.sleep(delay)
            continue

        if structure_failed and structure_retry_count < structure_retries:
            structure_retry_count += 1
            delay = structure_base_delay + random.uniform(0, max(1.0, structure_base_delay))
            attempt_record["retry_delay_seconds"] = delay
            print(
                f"[retry structure {structure_retry_count}/{structure_retries}] problem={problem['id']} structure validation failed; sleeping {delay:.1f}s",
                flush=True,
            )
            time.sleep(delay)
            continue

        if not rate_limited and not structure_failed:
            break

    write_json(event_dir / f"{problem['id']}.json", {"final_event": final_event, "events": events, "attempts": attempts})

    result = final_event.get("result") or {}
    scene = result.get("scene") or {}
    construction = result.get("construction") or {}
    dsl_code = construction_to_geobuildbench_dsl(construction, scene, problem.get("required_objects") or {})
    dsl_path = dsl_dir / f"{problem['id']}.txt"
    dsl_path.write_text(dsl_code, encoding="utf-8")

    validation_result: dict[str, Any] | None = None
    error_text = str(final_event.get("errorText") or "")
    try:
        validation_result = validate_dsl(dsl_code, problem_object, DSLValidator())
    except Exception as exc:
        error_text = (error_text + "\n" + repr(exc)).strip()

    missing_objects_count = count_missing((validation_result or {}).get("missing_objects") or {})
    failed_conditions_count = len((validation_result or {}).get("failed_conditions") or [])
    proof_markdown = str(result.get("proofMarkdown") or "")
    note_markdown = str(result.get("noteMarkdown") or "")
    proof_steps = ((result.get("scene") or {}).get("proofSteps") or [])

    return {
        "problem_id": problem["id"],
        "subject": agent_problem.get("subject") or "",
        "category": problem.get("category") or "",
        "difficulty": str(problem.get("difficulty") or ""),
        "agent_status": agent_status,
        "validation_result": validation_result,
        "missing_objects_count": missing_objects_count,
        "failed_conditions_count": failed_conditions_count,
        "proof_markdown_chars": len(proof_markdown),
        "proof_steps_count": len(proof_steps),
        "note_markdown_chars": len(note_markdown),
        "duration_seconds": total_duration,
        "agent_attempts": len(attempts),
        "rate_limit_retries": rate_limit_retry_count,
        "structure_retries": structure_retry_count,
        "dsl_path": str(dsl_path),
        "error_text": error_text,
    }


def main() -> int:
    configure_console_encoding()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geobuildbench-root", required=True, type=Path)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--output-dir", type=Path, default=REPO_ROOT / "benchmark-results")
    parser.add_argument("--python", type=Path, default=DEFAULT_PYTHON)
    parser.add_argument("--base-url", default=os.getenv("GEOMETRY_BENCH_BASE_URL") or os.getenv("OPENAI_API_BASE") or "")
    parser.add_argument("--model", default=os.getenv("GEOMETRY_BENCH_MODEL") or "")
    parser.add_argument("--api-key-env", default="GEOMETRY_BENCH_API_KEY")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--start-idx", type=int, default=0)
    parser.add_argument("--problem-id", action="append", default=[])
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--workers", type=int, default=1, help="Number of problems to evaluate in parallel; 0 means one worker per problem")
    parser.add_argument("--spawn-retries", type=int, default=8, help="Retries for launching each geometry agent subprocess")
    parser.add_argument("--agent-max-attempts", type=int, default=3, help="Geometry agent constraint/code repair attempts per problem")
    parser.add_argument("--rate-limit-retries", type=int, default=8, help="Retries for a problem when the provider returns a retryable rate/concurrency limit")
    parser.add_argument("--rate-limit-base-delay", type=float, default=15.0)
    parser.add_argument("--rate-limit-max-delay", type=float, default=300.0)
    parser.add_argument("--structure-retries", type=int, default=2, help="Retries for retryable agent output/schema validation failures")
    parser.add_argument("--structure-base-delay", type=float, default=5.0)
    args = parser.parse_args()

    api_key = os.getenv(args.api_key_env) or os.getenv("OPENAI_API_KEY") or ""
    if not api_key:
        raise RuntimeError(f"API key not found. Set {args.api_key_env} or OPENAI_API_KEY.")
    if not args.base_url:
        raise RuntimeError("Base URL is required. Pass --base-url or set GEOMETRY_BENCH_BASE_URL.")
    if not args.model:
        raise RuntimeError("Model is required. Pass --model or set GEOMETRY_BENCH_MODEL.")
    if not args.python.exists():
        raise FileNotFoundError(f"Python runtime not found: {args.python}")

    import_geobuildbench(args.geobuildbench_root)
    from src.benchmark.benchmark_dataset import BenchmarkDataset

    dataset_path = args.dataset or args.geobuildbench_root / "data" / "geoqa3_dataset.json"
    dataset = BenchmarkDataset(str(dataset_path))
    problems = [p.to_dict() for p in dataset]
    problem_objects = {p.id: p for p in dataset}
    if args.problem_id:
        ids = set(args.problem_id)
        problems = [problem for problem in problems if problem["id"] in ids]
    else:
        end = None if args.limit is None or args.limit < 0 else args.start_idx + args.limit
        problems = problems[args.start_idx:end]

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = args.output_dir / f"geobuildbench-geometry-studio-{timestamp}"
    dsl_dir = output_dir / "dsl"
    event_dir = output_dir / "events"
    dsl_dir.mkdir(parents=True, exist_ok=True)
    event_dir.mkdir(parents=True, exist_ok=True)

    settings = {
        "baseUrl": args.base_url,
        "apiKey": api_key,
        "model": args.model,
    }
    runs: list[dict[str, Any]] = []
    requested_workers = int(args.workers)
    workers = len(problems) if requested_workers <= 0 else max(1, requested_workers)

    if workers == 1:
        for index, problem in enumerate(problems, start=1):
            run = evaluate_problem(
                index,
                len(problems),
                problem,
                problem_objects[problem["id"]],
                args.python,
                settings,
                args.timeout_seconds,
                args.spawn_retries,
                args.agent_max_attempts,
                args.rate_limit_retries,
                args.rate_limit_base_delay,
                args.rate_limit_max_delay,
                args.structure_retries,
                args.structure_base_delay,
                dsl_dir,
                event_dir,
            )
            runs.append(run)
            write_json(output_dir / "results.partial.json", {"runs": runs, "summary": summarize_runs(runs)})
    else:
        order = {problem["id"]: index for index, problem in enumerate(problems)}
        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_to_index = {
                executor.submit(
                    evaluate_problem,
                    index,
                    len(problems),
                    problem,
                    problem_objects[problem["id"]],
                    args.python,
                    settings,
                    args.timeout_seconds,
                    args.spawn_retries,
                    args.agent_max_attempts,
                    args.rate_limit_retries,
                    args.rate_limit_base_delay,
                    args.rate_limit_max_delay,
                    args.structure_retries,
                    args.structure_base_delay,
                    dsl_dir,
                    event_dir,
                ): index
                for index, problem in enumerate(problems, start=1)
            }
            for future in as_completed(future_to_index):
                try:
                    run = future.result()
                except Exception as exc:
                    index = future_to_index[future]
                    problem = problems[index - 1]
                    run = {
                        "problem_id": problem["id"],
                        "subject": problem.get("subject") or "",
                        "category": problem.get("category") or "",
                        "difficulty": str(problem.get("difficulty") or ""),
                        "agent_status": "runner_exception",
                        "validation_result": None,
                        "missing_objects_count": 0,
                        "failed_conditions_count": 0,
                        "proof_markdown_chars": 0,
                        "proof_steps_count": 0,
                        "note_markdown_chars": 0,
                        "duration_seconds": 0.0,
                        "dsl_path": "",
                        "error_text": repr(exc),
                    }
                runs.append(run)
                runs.sort(key=lambda item: order.get(item["problem_id"], 10**9))
                write_json(output_dir / "results.partial.json", {"runs": runs, "summary": summarize_runs(runs)})

    metadata = {
        "timestamp": datetime.now().isoformat(),
        "model": args.model,
        "base_url": re.sub(r"(?<=://)[^/@]+@", "", args.base_url),
        "dataset": str(dataset_path),
        "geobuildbench_root": str(args.geobuildbench_root),
        "problems_requested": len(problems),
        "start_idx": args.start_idx,
        "limit": args.limit,
        "workers": workers,
        "spawn_retries": args.spawn_retries,
        "agent_max_attempts": args.agent_max_attempts,
        "rate_limit_retries": args.rate_limit_retries,
        "rate_limit_base_delay": args.rate_limit_base_delay,
        "rate_limit_max_delay": args.rate_limit_max_delay,
        "structure_retries": args.structure_retries,
        "structure_base_delay": args.structure_base_delay,
        "text_encoding": "utf-8; problem text fields are repaired if mojibake markers are detected",
    }
    report = {"metadata": metadata, "summary": summarize_runs(runs), "runs": runs}
    write_json(output_dir / "results.json", report)
    write_csv(output_dir, runs)
    write_report(output_dir, metadata, runs)
    print(f"Report: {output_dir / 'report.md'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
