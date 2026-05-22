import type { Ref } from "vue";
import { EventsOn } from "../../../../wailsjs/runtime/runtime";
import type { RuntimeStatusLike } from "../../runtime/services/runtimeBridgeCompat";
import type { WorkspaceSnapshotLike } from "../../scripts/services/scriptBridgeCompat";

type RuntimeState = {
  applyEnvironmentStatus: (status?: RuntimeStatusLike) => void;
  applyProgress: (progress?: { percent?: number; message?: string }) => void;
  failInitialization: (message: string) => void;
  finishInitialization: (message?: string) => void;
  initProgressMessage: Ref<string>;
  initProgressPercent: Ref<number>;
  isInitializing: Ref<boolean>;
  isRebuilding: Ref<boolean>;
};

type RuntimeRepository = {
  getEnvironmentStatus: () => Promise<RuntimeStatusLike>;
  initializeApp: () => Promise<{
    environment?: RuntimeStatusLike;
    workspace?: WorkspaceSnapshotLike;
  }>;
  rebuildRuntime: () => Promise<RuntimeStatusLike>;
  stopCurrentRun: () => Promise<unknown>;
};

type ScriptWorkspace = {
  applyWorkspaceSnapshot: (snapshot?: WorkspaceSnapshotLike) => void;
  restoreLastSelection: () => Promise<void>;
};

type NoteWorkspace = {
  hydrateFromScriptDocument: (note: { noteMarkdown?: unknown; noteImages?: unknown }) => void;
};

type WorkspaceLifecycleOptions = {
  isRunning: Ref<boolean>;
  noteWorkspace: NoteWorkspace;
  onError: (message: string) => void;
  onRunError: (message: string) => void;
  refreshSubscriptionStatus: (force: boolean) => Promise<void>;
  runtime: RuntimeState;
  runtimeRepository: RuntimeRepository;
  scriptWorkspace: ScriptWorkspace;
};

export function useWorkspaceLifecycle(options: WorkspaceLifecycleOptions) {
  let cleanupEvents: Array<() => void> = [];

  async function initializeApp() {
    try {
      const snapshot = await options.runtimeRepository.initializeApp();
      options.runtime.applyEnvironmentStatus(snapshot.environment);
      options.scriptWorkspace.applyWorkspaceSnapshot(snapshot.workspace);
      options.noteWorkspace.hydrateFromScriptDocument(snapshot.workspace?.document ?? {});
      await options.scriptWorkspace.restoreLastSelection();
      await options.refreshSubscriptionStatus(false);
      options.runtime.finishInitialization("Runtime ready");
    } catch (error) {
      const message = getErrorMessage(error);
      options.onError(message);
      options.runtime.failInitialization(message);
    }
  }

  async function loadEnvironmentStatus() {
    try {
      const status = await options.runtimeRepository.getEnvironmentStatus();
      options.runtime.applyEnvironmentStatus(status);
    } catch (error) {
      options.runtime.applyEnvironmentStatus({
        ready: false,
        code: "load_failed",
        severity: "error",
        summary: getErrorMessage(error),
        recommendedAction: "",
        items: [],
        missing: [],
        canRebuild: false,
        runtimeArchiveExists: false,
      });
    }
  }

  function bindRuntimeEvents() {
    cleanupEvents = [
      EventsOn("env:status", (...payload) => {
        options.runtime.applyEnvironmentStatus(payload[0] as RuntimeStatusLike | undefined);
      }),
      EventsOn("env:progress", (...payload) => {
        options.runtime.applyProgress(payload[0] as { percent?: number; message?: string } | undefined);
      }),
      EventsOn("run:started", () => {
        options.isRunning.value = true;
      }),
      EventsOn("run:finished", () => {
        options.isRunning.value = false;
      }),
      EventsOn("run:stopped", () => {
        options.isRunning.value = false;
      }),
      EventsOn("run:failed", (...payload) => {
        const data = payload[0] as
          | { error?: string; errorType?: string; traceback?: string }
          | undefined;
        options.isRunning.value = false;
        options.onRunError(data?.traceback ?? data?.error ?? "Python 进程异常退出");
      }),
      EventsOn("app:error", (...payload) => {
        const data = payload[0] as { message?: string } | undefined;
        options.runtime.applyEnvironmentStatus({
          ready: false,
          code: "app_error",
          severity: "error",
          summary: data?.message ?? "未知错误",
          recommendedAction: "",
          items: [],
          missing: [],
          canRebuild: false,
          runtimeArchiveExists: false,
        });
        options.onError(data?.message ?? "未知错误");
      }),
    ];
  }

  async function rebuildRuntime() {
    if (options.runtime.isRebuilding.value || options.isRunning.value) {
      return;
    }

    options.runtime.isRebuilding.value = true;
    options.runtime.isInitializing.value = true;
    options.runtime.initProgressPercent.value = 0;
    options.runtime.initProgressMessage.value = "Preparing runtime rebuild";

    try {
      const status = await options.runtimeRepository.rebuildRuntime();
      options.runtime.applyEnvironmentStatus(status);
      options.runtime.finishInitialization(status.summary ?? "Runtime rebuilt");
    } catch (error) {
      const message = getErrorMessage(error);
      options.runtime.failInitialization(message);
      options.onError(message);
    } finally {
      options.runtime.isRebuilding.value = false;
    }
  }

  async function stopCurrentRun() {
    try {
      await options.runtimeRepository.stopCurrentRun();
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  function mount() {
    bindRuntimeEvents();
    void loadEnvironmentStatus();
    void initializeApp();
  }

  function unmount() {
    cleanupEvents.forEach((cleanup) => cleanup());
    cleanupEvents = [];
  }

  return {
    mount,
    rebuildRuntime,
    stopCurrentRun,
    unmount,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
