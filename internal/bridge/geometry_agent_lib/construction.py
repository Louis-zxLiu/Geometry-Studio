from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, Mapping


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def spec_fingerprint(spec: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_json(dict(spec)).encode("utf-8")).hexdigest()


def specs_match(left: Mapping[str, Any], right: Mapping[str, Any]) -> bool:
    return spec_fingerprint(left) == spec_fingerprint(right)


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
