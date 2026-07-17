from __future__ import annotations

from typing import Any, Dict, List, TypedDict

from pydantic import BaseModel, ConfigDict, Field


class GeometryEntityModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: str
    label: str
    attributes: Dict[str, str] = Field(default_factory=dict)


class GeometryConstraintModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    args: List[str] = Field(default_factory=list)
    text: str
    confidence: float = Field(ge=0.0, le=1.0)


class GeometrySpecModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    problemText: str
    goalText: str
    entities: List[GeometryEntityModel] = Field(default_factory=list)
    constraints: List[GeometryConstraintModel] = Field(default_factory=list)
    constructionHints: List[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


class GeometryPointModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    x: float
    y: float
    fixed: bool = False


class GeometrySegmentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    from_: str = Field(alias="from")
    to: str
    label: str = ""
    style: str = ""


class GeometryCircleModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    center: str
    radius: float = 0.0
    through: str = ""
    label: str = ""
    style: str = ""


class GeometryArcModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    center: str
    start: str
    end: str
    radius: float = 0.0
    label: str = ""
    style: str = ""


class GeometryPolygonModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    points: List[str] = Field(default_factory=list)
    label: str = ""
    fill: str = ""


class GeometryControlModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    kind: str
    min: float
    max: float
    value: float
    step: float
    target: str = ""
    binding: str = ""


class GeometryMeasurementModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    kind: str
    args: List[str] = Field(default_factory=list)
    value: str = ""


class GeometryAnnotationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    text: str
    x: float
    y: float


class GeometryProofStepModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    claim: str
    reason: str
    depends: List[str] = Field(default_factory=list)


class GeometrySceneModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    version: int = 1
    title: str
    sourceImage: str = ""
    points: List[GeometryPointModel] = Field(default_factory=list)
    segments: List[GeometrySegmentModel] = Field(default_factory=list)
    circles: List[GeometryCircleModel] = Field(default_factory=list)
    arcs: List[GeometryArcModel] = Field(default_factory=list)
    polygons: List[GeometryPolygonModel] = Field(default_factory=list)
    controls: List[GeometryControlModel] = Field(default_factory=list)
    measurements: List[GeometryMeasurementModel] = Field(default_factory=list)
    constraints: List[GeometryConstraintModel] = Field(default_factory=list)
    annotations: List[GeometryAnnotationModel] = Field(default_factory=list)
    proofSteps: List[GeometryProofStepModel] = Field(default_factory=list)


class CodeResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pythonCode: str


class ProofResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    proofMarkdown: str = Field(description="Chinese Markdown proof for the notebook.")
    proofSteps: List[GeometryProofStepModel] = Field(default_factory=list)
    classroomQuestions: List[str] = Field(default_factory=list)


class NoteResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    noteMarkdown: str = Field(description="Chinese classroom note Markdown.")


class RepairResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pythonCode: str
    repairNotes: List[str] = Field(default_factory=list)


class GeometryState(TypedDict, total=False):
    sessionId: str
    sceneName: str
    imageDataUrl: str
    problemText: str
    currentCode: str
    dynamicConstruction: bool
    maxAttempts: int
    qualityMode: str
    settings: Dict[str, str]
    spec: Dict[str, Any]
    reviewedSpec: Dict[str, Any]
    specFingerprint: str
    reviewedSpecFingerprint: str
    constructionDraft: Dict[str, Any]
    construction: Dict[str, Any]
    validationSummary: Dict[str, Any]
    scene: Dict[str, Any]
    code: str
    proofMarkdown: str
    noteMarkdown: str
    classroomQuestions: List[str]
    diagnostics: List[str]
    attempt: int
    probeResult: Dict[str, Any]
    workflowStatus: str
    errorText: str
