import { computed, onUnmounted, ref, type Ref } from "vue";
import { EventsOn } from "../../../../wailsjs/runtime/runtime";
import {
  repairGeometryWorkflow,
  resumeGeometryWorkflow,
  startGeometryWorkflow,
  stopGeometryWorkflow,
} from "../services/geometryBridgeCompat";
import type {
  GeometryCodeAppliedEvent,
  GeometryConstruction,
  GeometryFailedEvent,
  GeometryInterruptedEvent,
  GeometryProgressEvent,
  GeometryReviewRequiredEvent,
  GeometryScene,
  GeometrySpec,
  GeometryValidationSummary,
  GeometrySucceededEvent,
  GeometryWorkflowRepairRequest,
  GeometryWorkflowRequest,
} from "../services/geometryTypes";

export type GeometryAgentStepStatus =
  | "pending"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "interrupted";

export type GeometryAgentArtifact = {
  id: string;
  attempt: number;
  createdAt: number;
  data?: Record<string, unknown>;
  detail: string;
  status: GeometryAgentStepStatus;
  summary: string;
  title: string;
};

export type GeometryAgentStep = {
  agentName: string;
  artifacts: GeometryAgentArtifact[];
  description: string;
  endedAt?: number;
  stage: string;
  startedAt?: number;
  status: GeometryAgentStepStatus;
  title: string;
  attempt: number;
};

export type GeometryAgentLogItem = {
  id: string;
  attempt: number;
  createdAt: number;
  data?: Record<string, unknown>;
  detail: string;
  eventKind: string;
  message: string;
  stage: string;
  status: GeometryAgentStepStatus;
  title: string;
};

type AIActivityStatus = {
  isAIGenerating: Ref<boolean>;
  startChecking: () => void;
  startWorking: () => void;
  stop: () => void;
};

type StartGeometryOptions = {
  onCodeApplied?: (event: GeometryCodeAppliedEvent) => void;
  onFailed?: (event: GeometryFailedEvent) => void;
  onInterrupted?: (event: GeometryInterruptedEvent) => void;
  onProgress?: (event: GeometryProgressEvent) => void;
  onReviewRequired?: (event: GeometryReviewRequiredEvent) => void;
  onSucceeded?: (event: GeometrySucceededEvent) => void;
};

type GeometryTerminalResult =
  | { ok: true; event: GeometrySucceededEvent }
  | { ok: false; type: "failed"; event: GeometryFailedEvent }
  | { ok: false; type: "interrupted"; event: GeometryInterruptedEvent };

const STAGE_DEFINITIONS: Array<Pick<GeometryAgentStep, "agentName" | "description" | "stage" | "title">> = [
  {
    stage: "parse_spec",
    title: "几何规格解析",
    agentName: "几何规格解析 agent",
    description: "从图片和文本中解析题干、对象、条件、求证目标和构造提示，整理成稳定规格。",
  },
  {
    stage: "build_constraint_construction",
    title: "约束构造建模",
    agentName: "约束构造建模 agent",
    description: "让 MLLM 生成对象、基础谓词约束和构造意图，作为几何真相层草图。",
  },
  {
    stage: "solve_constraint_graph",
    title: "约束求解与预览",
    agentName: "约束求解 agent",
    description: "用数值残差求解对象坐标，生成预览场景和残差反馈，供教师审核。",
  },
  {
    stage: "teacher_review",
    title: "教师复核",
    agentName: "教师复核 agent",
    description: "暂停工作流，把题目规格、构造预览和验证反馈交给用户确认或修正。",
  },
  {
    stage: "final_repair_constraints",
    title: "最终约束修复",
    agentName: "最终约束修复 agent",
    description: "根据教师是否修改规格决定复用或重建构造，并只通过 MLLM 修改对象、约束和构造意图来修复失败。",
  },
  {
    stage: "scene_compile",
    title: "构造场景编译",
    agentName: "场景编译 agent",
    description: "从已验证 GeometryConstruction 派生 GeometryScene 展示模型。",
  },
  {
    stage: "matplotlib_code_generate",
    title: "Matplotlib 代码生成",
    agentName: "Matplotlib 代码生成 agent",
    description: "把几何场景转换为可运行、中文标注、适合教学的 Python 图形代码。",
  },
  {
    stage: "teaching_proof_generate",
    title: "教学证明生成",
    agentName: "教学证明生成 agent",
    description: "生成中文证明、解答、课堂提问和右侧 Markdown 笔记。",
  },
  {
    stage: "runtime_check",
    title: "运行检查",
    agentName: "运行检查 agent",
    description: "实际运行生成代码，检查安全性、可执行性和窗口就绪状态。",
  },
  {
    stage: "self_correct",
    title: "自我修正",
    agentName: "自我修正 agent",
    description: "根据运行错误修复 Matplotlib 代码，并保持中文教学表达。",
  },
  {
    stage: "publish",
    title: "发布",
    agentName: "发布 agent",
    description: "把通过检查的代码、场景规格和中文笔记写回当前场景。",
  },
];

export function useGeometryWorkflowSession(aiActivity: AIActivityStatus) {
  const activeSessionId = ref("");
  const activeSceneName = ref("");
  const activeStage = ref("");
  const agentLogs = ref<GeometryAgentLogItem[]>([]);
  const agentTimeline = ref<GeometryAgentStep[]>(createInitialTimeline());
  const lastFailure = ref<GeometryFailedEvent | null>(null);
  const progressLabel = ref("");
  const reviewSpec = ref<GeometrySpec | null>(null);
  const reviewConstructionDraft = ref<GeometryConstruction | null>(null);
  const reviewPreviewScene = ref<GeometryScene | null>(null);
  const reviewValidationSummary = ref<GeometryValidationSummary | null>(null);
  const cleanupEvents = bindGeometryEvents();

  let pendingResolver: ((result: GeometryTerminalResult) => void) | null = null;
  let activeOptions: StartGeometryOptions | null = null;
  let logSequence = 0;

  const isSessionActive = computed(() => activeSessionId.value !== "");
  const isReviewing = computed(() => reviewSpec.value !== null);
  const hasAgentTimeline = computed(
    () => agentLogs.value.length > 0 || agentTimeline.value.some((step) => step.status !== "pending"),
  );
  const activeAgentStep = computed(() => {
    const stage = activeStage.value;
    if (stage) {
      return agentTimeline.value.find((step) => step.stage === stage) ?? null;
    }
    return agentTimeline.value.find((step) => step.status === "running" || step.status === "waiting") ?? null;
  });
  const agentStatusLabel = computed(() => {
    const step = activeAgentStep.value;
    if (!step || !isSessionActive.value) {
      return progressLabel.value;
    }
    if (step.status === "waiting") {
      return `${step.title} · 等待确认`;
    }
    if (step.stage === "runtime_check") {
      return `${step.title} · 第 ${Math.max(1, step.attempt)} 次检查`;
    }
    return step.title;
  });
  const canRepairLastFailure = computed(
    () => !!lastFailure.value?.repairable && !isSessionActive.value && !aiActivity.isAIGenerating.value,
  );

  async function startWorkflow(
    request: GeometryWorkflowRequest,
    options: StartGeometryOptions = {},
  ): Promise<GeometryTerminalResult> {
    if (activeSessionId.value || aiActivity.isAIGenerating.value) {
      throw new Error("已有 AI 工作流正在运行，请等待完成或手动停止");
    }

    prepareRun(request.sceneName, options, "准备几何解题");

    try {
      const session = await startGeometryWorkflow(request);
      activeSessionId.value = session.sessionId;
      activeSceneName.value = request.sceneName;
      return await waitForTerminalResult();
    } catch (error) {
      resetActiveRun();
      throw error;
    }
  }

  async function repairWorkflow(
    request: GeometryWorkflowRepairRequest,
    options: StartGeometryOptions = {},
  ): Promise<GeometryTerminalResult> {
    if (activeSessionId.value || aiActivity.isAIGenerating.value) {
      throw new Error("已有 AI 工作流正在运行，请等待完成或手动停止");
    }

    prepareRun(request.sceneName, options, "准备几何代码修复", true);

    try {
      const session = await repairGeometryWorkflow(request);
      activeSessionId.value = session.sessionId;
      activeSceneName.value = request.sceneName;
      return await waitForTerminalResult();
    } catch (error) {
      resetActiveRun();
      throw error;
    }
  }

  async function resumeReview(nextSpec: GeometrySpec) {
    if (!activeSessionId.value) {
      return;
    }

    reviewSpec.value = null;
    reviewConstructionDraft.value = null;
    reviewPreviewScene.value = null;
    reviewValidationSummary.value = null;
    await resumeGeometryWorkflow(activeSessionId.value, nextSpec);
    aiActivity.startWorking();
  }

  async function stopActiveWorkflow() {
    if (!activeSessionId.value) {
      return;
    }

    await stopGeometryWorkflow(activeSessionId.value);
  }

  function bindGeometryEvents() {
    return [
      EventsOn("geometry:progress", (...payload) => {
        handleProgress(payload[0] as GeometryProgressEvent | undefined);
      }),
      EventsOn("geometry:review_required", (...payload) => {
        handleReviewRequired(payload[0] as GeometryReviewRequiredEvent | undefined);
      }),
      EventsOn("geometry:code_applied", (...payload) => {
        handleCodeApplied(payload[0] as GeometryCodeAppliedEvent | undefined);
      }),
      EventsOn("geometry:succeeded", (...payload) => {
        handleSucceeded(payload[0] as GeometrySucceededEvent | undefined);
      }),
      EventsOn("geometry:failed", (...payload) => {
        handleFailed(payload[0] as GeometryFailedEvent | undefined);
      }),
      EventsOn("geometry:interrupted", (...payload) => {
        handleInterrupted(payload[0] as GeometryInterruptedEvent | undefined);
      }),
    ];
  }

  function prepareRun(sceneName: string, options: StartGeometryOptions, label: string, repairOnly = false) {
    aiActivity.startWorking();
    activeOptions = options;
    activeSceneName.value = sceneName;
    activeStage.value = "";
    agentLogs.value = [];
    agentTimeline.value = repairOnly
      ? createInitialTimeline(["self_correct", "runtime_check", "publish"])
      : createInitialTimeline();
    lastFailure.value = null;
    progressLabel.value = label;
    reviewSpec.value = null;
    reviewConstructionDraft.value = null;
    reviewPreviewScene.value = null;
    reviewValidationSummary.value = null;
    pendingResolver = null;
  }

  function waitForTerminalResult() {
    return new Promise<GeometryTerminalResult>((resolve) => {
      pendingResolver = resolve;
    });
  }

  function isActiveEvent<T extends { sessionId: string }>(event?: T): event is T {
    return !!event && event.sessionId === activeSessionId.value;
  }

  function handleProgress(event?: GeometryProgressEvent) {
    if (!isActiveEvent(event)) {
      return;
    }

    applyProgressEvent(event);
    progressLabel.value = event?.message ?? "";
    if (event?.stage === "runtime_check") {
      aiActivity.startChecking();
    } else if (event?.status !== "waiting") {
      aiActivity.startWorking();
    }
    safeInvoke(() => activeOptions?.onProgress?.(event));
  }

  function handleReviewRequired(event?: GeometryReviewRequiredEvent) {
    if (!isActiveEvent(event)) {
      return;
    }

    reviewSpec.value = event?.spec ?? null;
    reviewConstructionDraft.value = event?.constructionDraft ?? null;
    reviewPreviewScene.value = event?.previewScene ?? null;
    reviewValidationSummary.value = event?.validationSummary ?? null;
    markStage("teacher_review", "waiting", {
      message: "等待用户确认几何规格与构造预览",
      title: "教师复核",
      agentName: "教师复核 agent",
      description: "暂停工作流，把题目规格、构造预览和验证反馈交给用户确认或修正。",
    });
    aiActivity.stop();
    safeInvoke(() => activeOptions?.onReviewRequired?.(event));
  }

  function handleCodeApplied(event?: GeometryCodeAppliedEvent) {
    if (!isActiveEvent(event)) {
      return;
    }

    safeInvoke(() => activeOptions?.onCodeApplied?.(event));
  }

  function handleSucceeded(event?: GeometrySucceededEvent) {
    if (!isActiveEvent(event)) {
      return;
    }

    markAllStartedStages("completed");
    lastFailure.value = null;
    try {
      activeOptions?.onSucceeded?.(event);
    } finally {
      settle({ ok: true, event });
    }
  }

  function handleFailed(event?: GeometryFailedEvent) {
    if (!isActiveEvent(event)) {
      return;
    }

    lastFailure.value = event ?? null;
    markActiveStage("failed");
    appendLog({
      stage: activeStage.value || "publish",
      title: "工作流失败",
      message: event?.errorText ?? "几何工作流失败",
      detail: (event?.diagnostics ?? []).join("\n"),
      status: "failed",
      eventKind: "failed",
      attempt: 1,
    });
    try {
      activeOptions?.onFailed?.(event);
    } finally {
      settle({ ok: false, type: "failed", event });
    }
  }

  function handleInterrupted(event?: GeometryInterruptedEvent) {
    if (!isActiveEvent(event)) {
      return;
    }

    markActiveStage("interrupted");
    try {
      activeOptions?.onInterrupted?.(event);
    } finally {
      settle({ ok: false, type: "interrupted", event });
    }
  }

  function applyProgressEvent(event: GeometryProgressEvent) {
    const status = normalizeStatus(event.status);
    const stage = event.stage || "agent_output";
    const step = ensureStep(stage, event);
    const now = Date.now();

    if (status === "running") {
      markOtherRunningStagesCompleted(stage);
      step.status = "running";
      step.startedAt = step.startedAt ?? now;
      step.endedAt = undefined;
      activeStage.value = stage;
    } else if (status === "waiting") {
      step.status = "waiting";
      step.startedAt = step.startedAt ?? now;
      step.endedAt = undefined;
      activeStage.value = stage;
    } else if (status === "completed" || status === "failed" || status === "interrupted") {
      step.status = status;
      step.startedAt = step.startedAt ?? now;
      step.endedAt = now;
      if (activeStage.value === stage && status === "completed") {
        activeStage.value = "";
      } else if (status !== "completed") {
        activeStage.value = stage;
      }
    }

    step.attempt = Math.max(1, event.attempt || step.attempt || 1);
    step.title = event.title || step.title;
    step.agentName = event.agentName || step.agentName;
    step.description = event.description || step.description;

    if (event.artifactTitle || event.artifactSummary || event.artifactDetail || event.artifactData) {
      step.artifacts = [
        ...step.artifacts,
        {
          id: createLogId("artifact"),
          attempt: Math.max(1, event.attempt || 1),
          createdAt: now,
          data: event.artifactData,
          detail: event.artifactDetail ?? "",
          status,
          summary: event.artifactSummary || event.message || "",
          title: event.artifactTitle || event.title || step.title,
        },
      ];
    }

    appendLog({
      stage,
      title: event.artifactTitle || event.title || step.title,
      message: event.artifactSummary || event.message || "",
      detail: event.artifactDetail ?? "",
      data: event.artifactData,
      status,
      eventKind: event.eventKind || "stage",
      attempt: Math.max(1, event.attempt || 1),
    });
    agentTimeline.value = [...agentTimeline.value];
  }

  function ensureStep(stage: string, event?: Partial<GeometryProgressEvent>) {
    let step = agentTimeline.value.find((item) => item.stage === stage);
    if (step) {
      return step;
    }

    const definition = STAGE_DEFINITIONS.find((item) => item.stage === stage);
    step = {
      stage,
      title: event?.title || definition?.title || stage,
      agentName: event?.agentName || definition?.agentName || "几何 agent",
      description: event?.description || definition?.description || "",
      status: "pending",
      attempt: 1,
      artifacts: [],
    };
    agentTimeline.value = [...agentTimeline.value, step];
    return step;
  }

  function markStage(
    stage: string,
    status: GeometryAgentStepStatus,
    event: { agentName?: string; description?: string; message?: string; title?: string },
  ) {
    const step = ensureStep(stage, event);
    const now = Date.now();
    step.status = status;
    step.startedAt = step.startedAt ?? now;
    if (status === "completed" || status === "failed" || status === "interrupted") {
      step.endedAt = now;
    }
    step.title = event.title || step.title;
    step.agentName = event.agentName || step.agentName;
    step.description = event.description || step.description;
    activeStage.value = stage;
    appendLog({
      stage,
      title: step.title,
      message: event.message || step.title,
      detail: "",
      status,
      eventKind: "stage",
      attempt: step.attempt,
    });
    agentTimeline.value = [...agentTimeline.value];
  }

  function markActiveStage(status: GeometryAgentStepStatus) {
    const stage = activeStage.value || [...agentTimeline.value].reverse().find((step) => step.status === "running")?.stage;
    if (!stage) {
      return;
    }
    const step = ensureStep(stage);
    step.status = status;
    step.endedAt = Date.now();
    agentTimeline.value = [...agentTimeline.value];
  }

  function markOtherRunningStagesCompleted(nextStage: string) {
    const now = Date.now();
    for (const step of agentTimeline.value) {
      if (step.stage !== nextStage && step.status === "running") {
        step.status = "completed";
        step.endedAt = now;
      }
    }
  }

  function markAllStartedStages(status: GeometryAgentStepStatus) {
    const now = Date.now();
    for (const step of agentTimeline.value) {
      if (step.status !== "pending" && step.status !== "failed" && step.status !== "interrupted") {
        step.status = status;
        step.endedAt = step.endedAt ?? now;
      }
    }
    activeStage.value = "";
    agentTimeline.value = [...agentTimeline.value];
  }

  function appendLog(item: Omit<GeometryAgentLogItem, "createdAt" | "id">) {
    agentLogs.value = [
      ...agentLogs.value,
      {
        ...item,
        id: createLogId("log"),
        createdAt: Date.now(),
      },
    ].slice(-160);
  }

  function createLogId(prefix: string) {
    logSequence += 1;
    return `${prefix}-${Date.now()}-${logSequence}`;
  }

  function settle(result: GeometryTerminalResult) {
    const resolve = pendingResolver;
    pendingResolver = null;
    activeOptions = null;
    activeSessionId.value = "";
    activeSceneName.value = "";
    progressLabel.value = "";
    reviewSpec.value = null;
    reviewConstructionDraft.value = null;
    reviewPreviewScene.value = null;
    reviewValidationSummary.value = null;
    aiActivity.stop();
    resolve?.(result);
  }

  function resetActiveRun() {
    pendingResolver = null;
    activeOptions = null;
    activeSessionId.value = "";
    activeSceneName.value = "";
    activeStage.value = "";
    progressLabel.value = "";
    reviewSpec.value = null;
    reviewConstructionDraft.value = null;
    reviewPreviewScene.value = null;
    reviewValidationSummary.value = null;
    aiActivity.stop();
  }

  onUnmounted(() => {
    cleanupEvents.forEach((cleanup) => cleanup());
    cleanupEvents.length = 0;
    if (activeSessionId.value) {
      void stopGeometryWorkflow(activeSessionId.value).catch(() => undefined);
    }
    if (pendingResolver) {
      pendingResolver({
        ok: false,
        type: "interrupted",
        event: {
          message: "Geometry workflow closed",
          sceneName: activeSceneName.value,
          sessionId: activeSessionId.value,
        },
      });
      pendingResolver = null;
    }
  });

  return {
    activeAgentStep,
    activeSceneName,
    activeSessionId,
    agentLogs,
    agentStatusLabel,
    agentTimeline,
    canRepairLastFailure,
    hasAgentTimeline,
    isReviewing,
    isSessionActive,
    lastFailure,
    progressLabel,
    repairWorkflow,
    resumeReview,
    reviewConstructionDraft,
    reviewPreviewScene,
    reviewSpec,
    reviewValidationSummary,
    startWorkflow,
    stopActiveWorkflow,
  };
}

function createInitialTimeline(stages?: string[]): GeometryAgentStep[] {
  const allowed = stages ? new Set(stages) : null;
  return STAGE_DEFINITIONS
    .filter((definition) => !allowed || allowed.has(definition.stage))
    .map((definition) => ({
      ...definition,
      status: "pending" as const,
      attempt: 1,
      artifacts: [],
    }));
}

function normalizeStatus(status?: GeometryProgressEvent["status"]): GeometryAgentStepStatus {
  if (
    status === "pending" ||
    status === "running" ||
    status === "waiting" ||
    status === "completed" ||
    status === "failed" ||
    status === "interrupted"
  ) {
    return status;
  }

  return "running";
}

function safeInvoke(fn: () => void) {
  try {
    fn();
  } catch (error) {
    console.error(error);
  }
}
