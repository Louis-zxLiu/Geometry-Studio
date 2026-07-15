import { computed, onUnmounted, ref, type Ref } from "vue";
import { EventsOn } from "../../../../wailsjs/runtime/runtime";
import {
  resumeGeometryWorkflow,
  startGeometryWorkflow,
  stopGeometryWorkflow,
} from "../services/geometryBridgeCompat";
import type {
  GeometryCodeAppliedEvent,
  GeometryFailedEvent,
  GeometryInterruptedEvent,
  GeometryProgressEvent,
  GeometryReviewRequiredEvent,
  GeometrySpec,
  GeometrySucceededEvent,
  GeometryWorkflowRequest,
} from "../services/geometryTypes";

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

export function useGeometryWorkflowSession(aiActivity: AIActivityStatus) {
  const activeSessionId = ref("");
  const activeSceneName = ref("");
  const progressLabel = ref("");
  const reviewSpec = ref<GeometrySpec | null>(null);
  const cleanupEvents = bindGeometryEvents();

  let pendingResolver: ((result: GeometryTerminalResult) => void) | null = null;
  let activeOptions: StartGeometryOptions | null = null;

  const isSessionActive = computed(() => activeSessionId.value !== "");
  const isReviewing = computed(() => reviewSpec.value !== null);

  async function startWorkflow(
    request: GeometryWorkflowRequest,
    options: StartGeometryOptions = {},
  ): Promise<GeometryTerminalResult> {
    if (activeSessionId.value || aiActivity.isAIGenerating.value) {
      throw new Error("已有 AI 工作流正在运行，请等待完成或手动停止");
    }

    aiActivity.startWorking();
    activeOptions = options;
    progressLabel.value = "Reading geometry problem";

    try {
      const session = await startGeometryWorkflow(request);
      activeSessionId.value = session.sessionId;
      activeSceneName.value = request.sceneName;
      return await new Promise<GeometryTerminalResult>((resolve) => {
        pendingResolver = resolve;
      });
    } catch (error) {
      aiActivity.stop();
      activeOptions = null;
      progressLabel.value = "";
      throw error;
    }
  }

  async function resumeReview(nextSpec: GeometrySpec) {
    if (!activeSessionId.value) {
      return;
    }

    reviewSpec.value = null;
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

  function isActiveEvent(event?: { sessionId: string }) {
    return !!event && event.sessionId === activeSessionId.value;
  }

  function handleProgress(event?: GeometryProgressEvent) {
    if (!isActiveEvent(event)) {
      return;
    }

    progressLabel.value = event?.message ?? "";
    if (event?.stage === "runtime_check") {
      aiActivity.startChecking();
    } else {
      aiActivity.startWorking();
    }
    safeInvoke(() => activeOptions?.onProgress?.(event));
  }

  function handleReviewRequired(event?: GeometryReviewRequiredEvent) {
    if (!isActiveEvent(event)) {
      return;
    }

    reviewSpec.value = event?.spec ?? null;
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

    try {
      activeOptions?.onInterrupted?.(event);
    } finally {
      settle({ ok: false, type: "interrupted", event });
    }
  }

  function settle(result: GeometryTerminalResult) {
    const resolve = pendingResolver;
    pendingResolver = null;
    activeOptions = null;
    activeSessionId.value = "";
    activeSceneName.value = "";
    progressLabel.value = "";
    reviewSpec.value = null;
    aiActivity.stop();
    resolve?.(result);
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
    activeSceneName,
    activeSessionId,
    isReviewing,
    isSessionActive,
    progressLabel,
    resumeReview,
    reviewSpec,
    startWorkflow,
    stopActiveWorkflow,
  };
}

function safeInvoke(fn: () => void) {
  try {
    fn();
  } catch (error) {
    console.error(error);
  }
}
