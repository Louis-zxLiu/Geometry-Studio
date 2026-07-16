from __future__ import annotations

from typing import Any, Dict, List

from pydantic import BaseModel, ConfigDict, Field


class ConstructionObjectModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: str = Field(
        description="Basic object kind: point, line, segment, ray, circle, arc, polygon, angle, locus, etc."
    )
    role: str = Field(default="unknown", description="given, unknown, derived, or auxiliary")
    label: str = ""
    refs: List[str] = Field(
        default_factory=list,
        description="Referenced point/object ids, for example a segment uses [A, B] and a circle uses [O, A].",
    )
    attributes: Dict[str, Any] = Field(default_factory=dict)


class ConstructionConstraintModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: str = Field(
        description=(
            "Composable predicate: on, parallel, perpendicular, distance_equals, ratio, "
            "angle_value, angle_equals, midpoint, intersection, tangent, concyclic, "
            "collinear, orientation, order, inside, outside."
        )
    )
    args: Dict[str, Any] = Field(default_factory=dict)
    text: str = ""
    weight: float = Field(default=1.0, ge=0.0)
    required: bool = True
    source: str = ""


class ConstructionIntentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    summary: str
    objects: List[str] = Field(default_factory=list)
    constraints: List[str] = Field(default_factory=list)
    source: str = ""


class ConstructionResidualModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    constraintId: str
    type: str
    value: float
    ok: bool
    message: str = ""


class ConstructionSolutionModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str = "unsolved"
    points: Dict[str, Dict[str, float]] = Field(default_factory=dict)
    lines: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    circles: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    arcs: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    polygons: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    residuals: List[ConstructionResidualModel] = Field(default_factory=list)
    maxResidual: float = 0.0
    rmsResidual: float = 0.0
    iterations: int = 0
    initializer: str = ""
    message: str = ""


class GeometryConstructionModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = 1
    dslCode: str = Field(default="", description="Readable debug summary only; never the source of truth.")
    objects: List[ConstructionObjectModel] = Field(default_factory=list)
    constraints: List[ConstructionConstraintModel] = Field(default_factory=list)
    constructionIntent: List[ConstructionIntentModel] = Field(default_factory=list)
    solution: ConstructionSolutionModel = Field(default_factory=ConstructionSolutionModel)
    validation: Dict[str, Any] = Field(default_factory=dict)
    reviewStatus: str = "draft"
    specFingerprint: str = ""
    diagnostics: List[str] = Field(default_factory=list)
