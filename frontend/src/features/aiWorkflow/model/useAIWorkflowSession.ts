import { computed, onUnmounted, ref, type Ref } from "vue";
import { EventsOn } from "../../../../wailsjs/runtime/runtime";
import type {
  AIWorkflowCodeAppliedEvent,
  AIWorkflowFailedEvent,
  AIWorkflowInterruptedEvent,
  AIWorkflowRequest,
  AIWorkflowState,
  AIWorkflowStateChangedEvent,
  AIWorkflowSucceededEvent,
} from "../../ai/services/aiTypes";
import {
  startAIWorkflow,
  stopAIWorkflow,
} from "../services/aiWorkflowBridgeCompat";

type AIActivityStatus = {
  isAIGenerating: Ref<boolean>;
  startChecking: () => void;
  startWorking: () => void;
  stop: () => void;
};

type StartWorkflowOptions = {
  onCodeApplied?: (event: AIWorkflowCodeAppliedEvent) => void;
  onFailed?: (event: AIWorkflowFailedEvent) => void;
  onInterrupted?: (event: AIWorkflowInterruptedEvent) => void;
  onStateChanged?: (event: AIWorkflowStateChangedEvent) => void;
  onSucceeded?: (event: AIWorkflowSucceededEvent) => void;
};

type WorkflowTerminalResult =
  | { ok: true; event: AIWorkflowSucceededEvent }
  | { ok: false; type: "failed"; event: AIWorkflowFailedEvent }
  | { ok: false; type: "interrupted"; event: AIWorkflowInterruptedEvent };

export function useAIWorkflowSession(aiActivity: AIActivityStatus) {
  const activeSessionId = ref("");
  const activeState = ref<AIWorkflowState>("idle");
  const cleanupEvents = bindWorkflowEvents();

  let pendingResolver:
    | ((result: WorkflowTerminalResult) => void)
    | null = null;
  let activeOptions: StartWorkflowOptions | null = null;

  const isSessionActive = computed(() => activeSessionId.value !== "");

  async function startWorkflow(
    request: AIWorkflowRequest,
    options: StartWorkflowOptions = {},
  ): Promise<WorkflowTerminalResult> {
    if (activeSessionId.value) {
      throw new Error("已有 AI 工作流正在运行，请先等待完成或手动停止");
    }

    aiActivity.startWorking();
    activeOptions = options;

    try {
      const session = await startAIWorkflow(request);
      activeSessionId.value = session.sessionId;
      activeState.value = normalizeState(session.state);
      return await new Promise<WorkflowTerminalResult>((resolve) => {
        pendingResolver = resolve;
      });
    } catch (error) {
      aiActivity.stop();
      activeOptions = null;
      throw error;
    }
  }

  async function stopActiveWorkflow() {
    if (!activeSessionId.value) {
      return;
    }

    await stopAIWorkflow(activeSessionId.value);
  }

  function bindWorkflowEvents() {
    return [
      EventsOn("ai:workflow_state_changed", (...payload) => {
        handleStateChanged(payload[0] as AIWorkflowStateChangedEvent | undefined);
      }),
      EventsOn("ai:workflow_code_applied", (...payload) => {
        handleCodeApplied(payload[0] as AIWorkflowCodeAppliedEvent | undefined);
      }),
      EventsOn("ai:workflow_succeeded", (...payload) => {
        handleSucceeded(payload[0] as AIWorkflowSucceededEvent | undefined);
      }),
      EventsOn("ai:workflow_failed", (...payload) => {
        handleFailed(payload[0] as AIWorkflowFailedEvent | undefined);
      }),
      EventsOn("ai:workflow_interrupted", (...payload) => {
        handleInterrupted(payload[0] as AIWorkflowInterruptedEvent | undefined);
      }),
    ];
  }

  function handleStateChanged(event?: AIWorkflowStateChangedEvent) {
    if (!event || event.sessionId !== activeSessionId.value) {
      return;
    }

    activeState.value = normalizeState(event.state);
    if (event.state === "checking") {
      aiActivity.startChecking();
    } else if (event.state === "working") {
      aiActivity.startWorking();
    }

    safeInvoke(() => activeOptions?.onStateChanged?.(event));
  }

  function handleCodeApplied(event?: AIWorkflowCodeAppliedEvent) {
    if (!event || event.sessionId !== activeSessionId.value) {
      return;
    }

    safeInvoke(() => activeOptions?.onCodeApplied?.(event));
  }

  function handleSucceeded(event?: AIWorkflowSucceededEvent) {
    if (!event || event.sessionId !== activeSessionId.value) {
      return;
    }

    try {
      activeOptions?.onSucceeded?.(event);
    } finally {
      settle({ ok: true, event });
    }
  }

  function handleFailed(event?: AIWorkflowFailedEvent) {
    if (!event || event.sessionId !== activeSessionId.value) {
      return;
    }

    try {
      activeOptions?.onFailed?.(event);
    } finally {
      settle({ ok: false, type: "failed", event });
    }
  }

  function handleInterrupted(event?: AIWorkflowInterruptedEvent) {
    if (!event || event.sessionId !== activeSessionId.value) {
      return;
    }

    try {
      activeOptions?.onInterrupted?.(event);
    } finally {
      settle({ ok: false, type: "interrupted", event });
    }
  }

  function settle(result: WorkflowTerminalResult) {
    const resolve = pendingResolver;
    pendingResolver = null;
    activeOptions = null;
    activeSessionId.value = "";
    activeState.value = "idle";
    aiActivity.stop();
    resolve?.(result);
  }

  onUnmounted(() => {
    cleanupEvents.forEach((cleanup) => cleanup());
    cleanupEvents.length = 0;
    if (activeSessionId.value) {
      void stopAIWorkflow(activeSessionId.value).catch(() => undefined);
    }
    if (pendingResolver) {
      pendingResolver({
        ok: false,
        type: "interrupted",
        event: {
          attempt: 0,
          message: "AI 工作流已被关闭",
          sceneName: "",
          sessionId: activeSessionId.value,
        },
      });
      pendingResolver = null;
    }
  });

  return {
    activeState,
    isSessionActive,
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

function normalizeState(value: string): AIWorkflowState {
  if (
    value === "idle" ||
    value === "working" ||
    value === "checking" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "interrupted"
  ) {
    return value;
  }

  throw new Error(`unknown AI workflow state: ${value}`);
}
