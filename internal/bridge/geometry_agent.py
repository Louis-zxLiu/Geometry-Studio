from __future__ import annotations

import json
import re
import sys
import traceback
from typing import Any, Dict, List, Optional, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, ConfigDict, Field


GRAPH_NODES = [
    "problem_vision_parse",
    "geometry_spec_organize",
    "teacher_review",
    "construction_plan",
    "dual_scene_generate",
    "matplotlib_code_generate",
    "teaching_proof_generate",
    "runtime_check",
    "self_correct",
    "publish",
]


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
    polygons: List[GeometryPolygonModel] = Field(default_factory=list)
    controls: List[GeometryControlModel] = Field(default_factory=list)
    measurements: List[GeometryMeasurementModel] = Field(default_factory=list)
    constraints: List[GeometryConstraintModel] = Field(default_factory=list)
    annotations: List[GeometryAnnotationModel] = Field(default_factory=list)
    proofSteps: List[GeometryProofStepModel] = Field(default_factory=list)


class ConstructionPlanModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: str
    teachingFocus: List[str] = Field(default_factory=list)


class CodeResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pythonCode: str


class ProofResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    proofMarkdown: str
    proofSteps: List[GeometryProofStepModel] = Field(default_factory=list)
    classroomQuestions: List[str] = Field(default_factory=list)


class NoteResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    noteMarkdown: str


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
    maxAttempts: int
    settings: Dict[str, str]
    spec: Dict[str, Any]
    reviewedSpec: Dict[str, Any]
    constructionPlan: str
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


def emit(event: Dict[str, Any]) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def read_command() -> Optional[Dict[str, Any]]:
    line = sys.stdin.readline()
    if not line:
        return None
    return json.loads(line)


def normalize_openai_base_url(value: str) -> str:
    base_url = (value or "").strip().rstrip("/")
    suffix = "/chat/completions"
    if base_url.endswith(suffix):
        base_url = base_url[: -len(suffix)]
    return base_url


def model_from_settings(settings: Dict[str, str]) -> ChatOpenAI:
    base_url = normalize_openai_base_url(settings.get("baseUrl", ""))
    api_key = (settings.get("apiKey") or "").strip()
    model = (settings.get("model") or "").strip()
    if not base_url or not api_key or not model:
        raise RuntimeError("Geometry workflow needs baseUrl, apiKey, and model")
    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key,
        model=model,
        temperature=0.2,
        timeout=300,
    )


def response_text(value: Any) -> str:
    content = getattr(value, "content", value)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text))
            else:
                parts.append(str(item))
        return "\n".join(parts).strip()
    return str(content).strip()


def extract_json_object(text: str) -> Dict[str, Any]:
    stripped = text.strip()
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)```", stripped, flags=re.S | re.I)
    if fenced:
        stripped = fenced.group(1).strip()
    return json.loads(stripped)


def json_chat(
    state: GeometryState,
    schema_model: type[BaseModel],
    system_prompt: str,
    user_prompt: str,
    image_data_url: str = "",
) -> BaseModel:
    schema = json.dumps(schema_model.model_json_schema(), ensure_ascii=False, indent=2)
    full_user_prompt = (
        user_prompt
        + "\n\nReturn JSON only. It must validate against this JSON Schema:\n"
        + schema
    )
    human_content: Any = full_user_prompt
    if image_data_url:
        human_content = [
            {"type": "text", "text": full_user_prompt},
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ]
    llm = model_from_settings(state["settings"])
    raw = llm.invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_content),
        ]
    )
    payload = extract_json_object(response_text(raw))
    return schema_model.model_validate(payload)


def progress(state: GeometryState, stage: str, message: str) -> None:
    emit(
        {
            "type": "progress",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "stage": stage,
            "message": message,
            "attempt": int(state.get("attempt") or 1),
        }
    )


def problem_vision_parse(state: GeometryState) -> Dict[str, Any]:
    progress(state, "problem_vision_parse", "题面视觉解析")
    user = (
        "Extract the complete olympiad geometry problem from the image and optional text. "
        "Identify all named objects, geometric relationships, given conditions, and target conclusion. "
        "Preserve the original problem language when possible.\n\n"
        f"Optional text:\n{state.get('problemText', '')}"
    )
    spec = json_chat(
        state,
        GeometrySpecModel,
        "You are the visual parser agent for olympiad geometry problems.",
        user,
        state.get("imageDataUrl", ""),
    )
    return {"spec": spec.model_dump()}


def geometry_spec_organize(state: GeometryState) -> Dict[str, Any]:
    progress(state, "geometry_spec_organize", "几何规格整理")
    user = (
        "Normalize this GeometrySpec for downstream construction. "
        "Keep the mathematical meaning, use stable IDs, make constraints reference entity IDs, "
        "and make every condition explicit.\n\n"
        + json.dumps(state["spec"], ensure_ascii=False, indent=2)
    )
    spec = json_chat(
        state,
        GeometrySpecModel,
        "You are the geometry specification organizer agent.",
        user,
    )
    return {"spec": spec.model_dump()}


def teacher_review(state: GeometryState) -> Dict[str, Any]:
    progress(state, "teacher_review", "教师复核")
    emit(
        {
            "type": "review_required",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "spec": state["spec"],
        }
    )
    command = read_command()
    if not command or command.get("type") == "stop":
        emit(
            {
                "type": "interrupted",
                "sessionId": state["sessionId"],
                "sceneName": state["sceneName"],
                "message": "Geometry workflow stopped",
            }
        )
        raise KeyboardInterrupt("Geometry workflow stopped")
    if command.get("type") != "resume_review" or not command.get("spec"):
        raise RuntimeError("Geometry workflow expected resume_review with spec")
    reviewed = GeometrySpecModel.model_validate(command["spec"]).model_dump()
    return {"reviewedSpec": reviewed}


def construction_plan(state: GeometryState) -> Dict[str, Any]:
    progress(state, "construction_plan", "构造规划")
    spec = state.get("reviewedSpec") or state["spec"]
    user = (
        "Create a concise construction plan for a classroom-ready interactive geometry model. "
        "The same GeometryScene must drive both Vue/SVG preview and Matplotlib/PyQt code. "
        "Prefer draggable points or parameter controls when they help explain invariants.\n\n"
        + json.dumps(spec, ensure_ascii=False, indent=2)
    )
    plan = json_chat(
        state,
        ConstructionPlanModel,
        "You are the construction planning agent for interactive geometry teaching.",
        user,
    )
    return {"constructionPlan": plan.plan}


def dual_scene_generate(state: GeometryState) -> Dict[str, Any]:
    progress(state, "dual_scene_generate", "双端场景生成")
    spec = state.get("reviewedSpec") or state["spec"]
    user = (
        "Generate GeometryScene v1 from this specification and construction plan. "
        "Use readable coordinates. Include the objects needed for the proof, constraints, measurements, "
        "annotations, and at least one control when a parameter can be varied.\n\n"
        "GeometrySpec:\n"
        + json.dumps(spec, ensure_ascii=False, indent=2)
        + "\n\nConstruction plan:\n"
        + state.get("constructionPlan", "")
    )
    scene = json_chat(
        state,
        GeometrySceneModel,
        "You are the dual-end scene generation agent.",
        user,
    )
    scene_dict = scene.model_dump(by_alias=True)
    emit(
        {
            "type": "preview_updated",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "scene": scene_dict,
        }
    )
    return {"scene": scene_dict}


def matplotlib_code_generate(state: GeometryState) -> Dict[str, Any]:
    progress(state, "matplotlib_code_generate", "Matplotlib 代码生成")
    spec = state.get("reviewedSpec") or state["spec"]
    user = (
        "Generate self-contained Python code for Geometry Studio. "
        "Use the GeometryScene as the source of truth. Allowed imports are math, numpy, sympy, "
        "matplotlib.pyplot, matplotlib.patches, and matplotlib.widgets. "
        "The code must call plt.show(), render labels clearly, and expose interactive controls when present. "
        "Do not read files, write files, start processes, or use network access.\n\n"
        "GeometrySpec:\n"
        + json.dumps(spec, ensure_ascii=False, indent=2)
        + "\n\nGeometryScene:\n"
        + json.dumps(state["scene"], ensure_ascii=False, indent=2)
        + "\n\nConstruction plan:\n"
        + state.get("constructionPlan", "")
    )
    code = json_chat(
        state,
        CodeResultModel,
        "You are the Matplotlib code generation agent.",
        user,
    )
    return {"code": code.pythonCode.strip()}


def teaching_proof_generate(state: GeometryState) -> Dict[str, Any]:
    progress(state, "teaching_proof_generate", "教学证明生成")
    spec = state.get("reviewedSpec") or state["spec"]
    proof_user = (
        "Write a classroom teaching proof for this olympiad geometry problem. "
        "Use concise Chinese Markdown unless the source problem is not Chinese. "
        "Also return structured proof steps and classroom questions.\n\n"
        "GeometrySpec:\n"
        + json.dumps(spec, ensure_ascii=False, indent=2)
        + "\n\nGeometryScene:\n"
        + json.dumps(state["scene"], ensure_ascii=False, indent=2)
    )
    proof = json_chat(
        state,
        ProofResultModel,
        "You are the teaching proof agent.",
        proof_user,
    )
    scene = dict(state["scene"])
    scene["proofSteps"] = [step.model_dump() for step in proof.proofSteps]
    note_user = (
        "Create the final Geometry Studio note as Markdown with sections: "
        "题目, 已识别条件, 交互模型说明, 教学证明, 课堂提问. "
        "Use the provided proof markdown as the proof source.\n\n"
        "GeometrySpec:\n"
        + json.dumps(spec, ensure_ascii=False, indent=2)
        + "\n\nGeometryScene:\n"
        + json.dumps(scene, ensure_ascii=False, indent=2)
        + "\n\nProof Markdown:\n"
        + proof.proofMarkdown
        + "\n\nClassroom questions:\n"
        + json.dumps(proof.classroomQuestions, ensure_ascii=False, indent=2)
    )
    note = json_chat(
        state,
        NoteResultModel,
        "You write concise classroom-ready geometry lesson notes.",
        note_user,
    )
    return {
        "proofMarkdown": proof.proofMarkdown.strip(),
        "classroomQuestions": proof.classroomQuestions,
        "scene": scene,
        "noteMarkdown": note.noteMarkdown.strip() + "\n",
    }


def runtime_check(state: GeometryState) -> Dict[str, Any]:
    progress(state, "runtime_check", "运行检查")
    emit(
        {
            "type": "runtime_probe",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "code": state.get("code", ""),
            "attempt": int(state.get("attempt") or 1),
        }
    )
    command = read_command()
    if not command or command.get("type") == "stop":
        emit(
            {
                "type": "interrupted",
                "sessionId": state["sessionId"],
                "sceneName": state["sceneName"],
                "message": "Geometry workflow stopped",
            }
        )
        raise KeyboardInterrupt("Geometry workflow stopped")
    if command.get("type") != "probe_result":
        raise RuntimeError("Geometry workflow expected probe_result")

    probe_result = command.get("probeResult") or {
        "ok": False,
        "errorText": "Missing probe result",
        "repairable": True,
    }
    if probe_result.get("ok"):
        return {"probeResult": probe_result, "workflowStatus": "succeeded", "errorText": ""}

    attempt = int(state.get("attempt") or 1)
    diagnostics = list(state.get("diagnostics") or [])
    diagnostics.append(f"attempt {attempt} failed: {probe_result.get('errorText', '')}")
    max_attempts = int(state.get("maxAttempts") or 5)
    if not probe_result.get("repairable", True) or attempt >= max_attempts:
        return {
            "probeResult": probe_result,
            "diagnostics": diagnostics,
            "workflowStatus": "failed",
            "errorText": probe_result.get("errorText", "Geometry model failed validation"),
        }

    return {
        "probeResult": probe_result,
        "diagnostics": diagnostics,
        "workflowStatus": "repairing",
        "attempt": attempt + 1,
    }


def self_correct(state: GeometryState) -> Dict[str, Any]:
    progress(state, "self_correct", "自我修正")
    user = (
        "Repair this Python code so it runs successfully in Geometry Studio while preserving the same "
        "GeometryScene and teaching intent. Return only the repaired code and repair notes in JSON.\n\n"
        "GeometryScene:\n"
        + json.dumps(state["scene"], ensure_ascii=False, indent=2)
        + "\n\nRuntime or validation error:\n"
        + str((state.get("probeResult") or {}).get("errorText", ""))
        + "\n\nCurrent code:\n"
        + state.get("code", "")
    )
    repaired = json_chat(
        state,
        RepairResultModel,
        "You are the self-correction agent for safe Matplotlib geometry programs.",
        user,
    )
    diagnostics = list(state.get("diagnostics") or [])
    diagnostics.extend(repaired.repairNotes)
    return {
        "code": repaired.pythonCode.strip(),
        "diagnostics": diagnostics,
        "workflowStatus": "checking",
    }


def publish(state: GeometryState) -> Dict[str, Any]:
    progress(state, "publish", "发布")
    if state.get("workflowStatus") == "succeeded":
        result = {
            "code": state.get("code", ""),
            "noteMarkdown": state.get("noteMarkdown", ""),
            "proofMarkdown": state.get("proofMarkdown", ""),
            "spec": state.get("reviewedSpec") or state.get("spec") or {},
            "scene": state.get("scene") or {},
            "diagnostics": list(state.get("diagnostics") or []),
        }
        emit(
            {
                "type": "succeeded",
                "sessionId": state["sessionId"],
                "sceneName": state["sceneName"],
                "result": result,
            }
        )
        return {}

    emit(
        {
            "type": "failed",
            "sessionId": state["sessionId"],
            "sceneName": state["sceneName"],
            "errorText": state.get("errorText", "Geometry workflow failed"),
            "diagnostics": list(state.get("diagnostics") or []),
        }
    )
    return {}


def route_after_runtime_check(state: GeometryState) -> str:
    if state.get("workflowStatus") == "repairing":
        return "self_correct"
    return "publish"


def build_geometry_graph():
    graph = StateGraph(GeometryState)
    graph.add_node("problem_vision_parse", problem_vision_parse)
    graph.add_node("geometry_spec_organize", geometry_spec_organize)
    graph.add_node("teacher_review", teacher_review)
    graph.add_node("construction_plan", construction_plan)
    graph.add_node("dual_scene_generate", dual_scene_generate)
    graph.add_node("matplotlib_code_generate", matplotlib_code_generate)
    graph.add_node("teaching_proof_generate", teaching_proof_generate)
    graph.add_node("runtime_check", runtime_check)
    graph.add_node("self_correct", self_correct)
    graph.add_node("publish", publish)
    graph.add_edge(START, "problem_vision_parse")
    graph.add_edge("problem_vision_parse", "geometry_spec_organize")
    graph.add_edge("geometry_spec_organize", "teacher_review")
    graph.add_edge("teacher_review", "construction_plan")
    graph.add_edge("construction_plan", "dual_scene_generate")
    graph.add_edge("dual_scene_generate", "matplotlib_code_generate")
    graph.add_edge("matplotlib_code_generate", "teaching_proof_generate")
    graph.add_edge("teaching_proof_generate", "runtime_check")
    graph.add_conditional_edges(
        "runtime_check",
        route_after_runtime_check,
        {
            "self_correct": "self_correct",
            "publish": "publish",
        },
    )
    graph.add_edge("self_correct", "runtime_check")
    graph.add_edge("publish", END)
    return graph.compile()


def describe_graph() -> None:
    emit(
        {
            "type": "graph_description",
            "nodes": GRAPH_NODES,
            "edges": [
                ["START", "problem_vision_parse"],
                ["problem_vision_parse", "geometry_spec_organize"],
                ["geometry_spec_organize", "teacher_review"],
                ["teacher_review", "construction_plan"],
                ["construction_plan", "dual_scene_generate"],
                ["dual_scene_generate", "matplotlib_code_generate"],
                ["matplotlib_code_generate", "teaching_proof_generate"],
                ["teaching_proof_generate", "runtime_check"],
                ["runtime_check", "self_correct"],
                ["runtime_check", "publish"],
                ["self_correct", "runtime_check"],
                ["publish", "END"],
            ],
        }
    )


def run_session(command: Dict[str, Any]) -> None:
    request = command["request"]
    state: GeometryState = {
        "sessionId": command["sessionId"],
        "sceneName": request["sceneName"],
        "imageDataUrl": request.get("imageDataUrl", ""),
        "problemText": request.get("problemText", ""),
        "currentCode": request.get("currentCode", ""),
        "maxAttempts": int(request.get("maxAttempts") or 5),
        "settings": request.get("settings") or {},
        "attempt": 1,
        "diagnostics": [],
        "workflowStatus": "working",
    }
    build_geometry_graph().invoke(state)


def main() -> None:
    if "--describe-graph" in sys.argv:
        describe_graph()
        return

    command = read_command()
    if not command or command.get("type") != "start":
        emit({"type": "failed", "errorText": "Geometry agent expected a start command"})
        return
    try:
        run_session(command)
    except KeyboardInterrupt:
        return
    except Exception as exc:
        emit(
            {
                "type": "failed",
                "sessionId": command.get("sessionId", ""),
                "sceneName": (command.get("request") or {}).get("sceneName", ""),
                "errorText": str(exc),
                "diagnostics": traceback.format_exc().splitlines()[-18:],
            }
        )


if __name__ == "__main__":
    main()
