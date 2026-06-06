import { ref } from "vue";
import type { RuntimeStatusLike } from "../services/runtimeBridgeCompat";

export function useRuntimeState() {
  const environmentStatus = ref({
    ready: false,
    code: "unknown",
    severity: "error",
    summary: "Not Ready",
    recommendedAction: "",
    items: [] as Array<{
      key?: string;
      label?: string;
      category?: string;
      status?: string;
      message?: string;
      exists?: boolean;
    }>,
    missing: [] as string[],
    canRebuild: false,
    runtimeArchiveExists: false,
  });
  const isInitializing = ref(true);
  const isRebuilding = ref(false);
  const initProgressPercent = ref(0);
  const initProgressMessage = ref("Preparing runtime");

  function applyEnvironmentStatus(status?: RuntimeStatusLike) {
    environmentStatus.value = {
      ready: !!status?.ready,
      code: asString(status?.code || "unknown"),
      severity: asString(status?.severity || "error"),
      summary: asString(status?.summary),
      recommendedAction: asString(status?.recommendedAction),
      items: Array.isArray(status?.items) ? status.items : [],
      missing: Array.isArray(status?.missing) ? status.missing : [],
      canRebuild: !!status?.canRebuild,
      runtimeArchiveExists: !!status?.runtimeArchiveExists,
    };
  }

  function applyProgress(progress?: { percent?: number; message?: string }) {
    if (typeof progress?.percent === "number") {
      initProgressPercent.value = progress.percent;
    }
    if (progress?.message) {
      initProgressMessage.value = progress.message;
    }
  }

  function finishInitialization(message = "Runtime ready") {
    initProgressPercent.value = 100;
    initProgressMessage.value = message;
    isInitializing.value = false;
  }

  function failInitialization(message: string) {
    initProgressMessage.value = message;
    isInitializing.value = false;
  }

  return {
    applyEnvironmentStatus,
    applyProgress,
    environmentStatus,
    failInitialization,
    finishInitialization,
    isRebuilding,
    initProgressMessage,
    initProgressPercent,
    isInitializing,
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}
