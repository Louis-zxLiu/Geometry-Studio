from __future__ import annotations

from typing import Any, Mapping

from .prompt_payloads import prompt_json


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
