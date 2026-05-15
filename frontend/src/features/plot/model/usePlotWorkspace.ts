import { onMounted, onUnmounted, ref } from "vue";
import { EventsOn } from "../../../../wailsjs/runtime/runtime";
import {
  GetSubscriptionStatus,
  OpenSubscriptionPurchase,
} from "../../../../wailsjs/go/bridge/App";
import {
  generateCodeFromSelection,
} from "../../ai/services/aiBridgeCompat";
import {
  createAISettingsStorage,
} from "../../ai/services/aiSettingsStorage";
import type {
  AINoteSelectionPayload,
  AIProviderSettings,
  AISubscriptionPurchaseResult,
  AISubscriptionStatus,
} from "../../ai/services/aiTypes";
import { useRunErrorDialog } from "../../errors/model/useRunErrorDialog";
import { useNoteWorkspace } from "../../notebook/model/useNoteWorkspace";
import { createRuntimeRepository } from "../../runtime/services/runtimeRepository";
import { useRuntimeState } from "../../runtime/model/useRuntimeState";
import { createScriptRepository } from "../../scripts/services/scriptRepository";
import { useScriptWorkspaceMachine } from "../../scripts/model/useScriptWorkspaceMachine";

export function usePlotWorkspace() {
  const aiSettingsStorage = createAISettingsStorage();
  const isRunning = ref(false);
  const isAIGenerating = ref(false);
  const isAISettingsDialogOpen = ref(false);
  const aiSettings = ref<AIProviderSettings>(aiSettingsStorage.load());
  const subscriptionStatus = ref<AISubscriptionStatus>({
    status: "unconfigured",
    activated: false,
    deviceId: "",
    expireAt: "",
    lastCheckedAt: "",
    message: "订阅服务未配置",
    model: "",
    baseUrl: "",
  });
  const subscriptionPurchaseState = ref<AISubscriptionPurchaseResult | null>(null);
  const isPackageTransferDialogOpen = ref(false);
  const packageTransferMessage = ref("");
  const packageTransferPendingAction = ref<"" | "import" | "export">("");
  const isSettingsDialogOpen = ref(false);
  const runtime = useRuntimeState();
  const runtimeRepository = createRuntimeRepository();
  const scriptRepository = createScriptRepository();
  const runErrorDialog = useRunErrorDialog();
  const scriptWorkspace = useScriptWorkspaceMachine(
    runErrorDialog.openRunErrorDialog,
    isRunning,
  );
  const noteWorkspace = useNoteWorkspace(
    scriptWorkspace.currentFile,
    runErrorDialog.openRunErrorDialog,
  );

  let cleanupEvents: Array<() => void> = [];

  async function initializeApp() {
    try {
      const snapshot = await runtimeRepository.initializeApp();
      runtime.applyEnvironmentStatus(snapshot.environment);
      scriptWorkspace.applyWorkspaceSnapshot(snapshot.workspace);
      noteWorkspace.hydrateFromScriptDocument(snapshot.workspace.document ?? {});
      await refreshSubscriptionStatus(false);
      runtime.finishInitialization("Runtime ready");
    } catch (error) {
      const message = getErrorMessage(error);
      runErrorDialog.openRunErrorDialog(message);
      runtime.failInitialization(message);
    }
  }

  async function loadEnvironmentStatus() {
    try {
      const status = await runtimeRepository.getEnvironmentStatus();
      runtime.applyEnvironmentStatus(status);
    } catch (error) {
      runtime.applyEnvironmentStatus({
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
        const data = payload[0] as
          | {
              ready?: boolean;
              code?: string;
              severity?: string;
              summary?: string;
              recommendedAction?: string;
              missing?: string[];
              items?: Array<Record<string, unknown>>;
              canRebuild?: boolean;
              runtimeArchiveExists?: boolean;
            }
          | undefined;
        runtime.applyEnvironmentStatus(data);
      }),
      EventsOn("env:progress", (...payload) => {
        const data = payload[0] as
          | { percent?: number; message?: string }
          | undefined;
        runtime.applyProgress(data);
      }),
      EventsOn("run:started", () => {
        isRunning.value = true;
      }),
      EventsOn("run:finished", () => {
        isRunning.value = false;
      }),
      EventsOn("run:stopped", () => {
        isRunning.value = false;
      }),
      EventsOn("run:failed", (...payload) => {
        const data = payload[0] as
          | { error?: string; errorType?: string; traceback?: string }
          | undefined;
        isRunning.value = false;
        runErrorDialog.openRunErrorDialog(
          data?.traceback ?? data?.error ?? "Python 进程异常退出",
        );
      }),
      EventsOn("app:error", (...payload) => {
        const data = payload[0] as { message?: string } | undefined;
        runtime.applyEnvironmentStatus({
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
        runErrorDialog.openRunErrorDialog(data?.message ?? "未知错误");
      }),
    ];
  }

  function openPackageTransferDialog() {
    packageTransferMessage.value = "";
    isPackageTransferDialogOpen.value = true;
  }

  function toggleNotePanel() {
    noteWorkspace.togglePanel();
  }

  function closePackageTransferDialog() {
    if (packageTransferPendingAction.value !== "") {
      return;
    }

    isPackageTransferDialogOpen.value = false;
  }

  function openSettings() {
    isSettingsDialogOpen.value = true;
  }

  function openAISettings() {
    isAISettingsDialogOpen.value = true;
    subscriptionPurchaseState.value = null;
    void refreshSubscriptionStatus(true);
  }

  function closeAISettings() {
    isAISettingsDialogOpen.value = false;
  }

  function updateAISettings(nextSettings: AIProviderSettings) {
    aiSettings.value = nextSettings;
    aiSettingsStorage.save(nextSettings);
  }

  function closeSettings() {
    isSettingsDialogOpen.value = false;
  }

  async function rebuildRuntime() {
    if (runtime.isRebuilding.value || isRunning.value) {
      return;
    }

    runtime.isRebuilding.value = true;
    runtime.isInitializing.value = true;
    runtime.initProgressPercent.value = 0;
    runtime.initProgressMessage.value = "Preparing runtime rebuild";

    try {
      const status = await runtimeRepository.rebuildRuntime();
      runtime.applyEnvironmentStatus(status);
      runtime.finishInitialization(status.summary ?? "Runtime rebuilt");
    } catch (error) {
      const message = getErrorMessage(error);
      runtime.failInitialization(message);
      runErrorDialog.openRunErrorDialog(message);
    } finally {
      runtime.isRebuilding.value = false;
    }
  }

  async function stopCurrentRun() {
    try {
      await runtimeRepository.stopCurrentRun();
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    }
  }

  async function exportCurrentScenePackage() {
    if (!scriptWorkspace.currentFile.value || packageTransferPendingAction.value !== "") {
      return;
    }

    packageTransferPendingAction.value = "export";
    packageTransferMessage.value = "";

    try {
      await scriptWorkspace.saveCurrentScript();
      await noteWorkspace.flushPendingSave(scriptWorkspace.currentFile.value);
      const result = await scriptRepository.exportScenePackage(scriptWorkspace.currentFile.value);
      if (result?.path) {
        packageTransferMessage.value = `已导出到 ${result.path}`;
      }
    } catch (error) {
      const message = getErrorMessage(error);
      packageTransferMessage.value = message;
      runErrorDialog.openRunErrorDialog(message);
    } finally {
      packageTransferPendingAction.value = "";
    }
  }

  async function importScenePackage() {
    if (packageTransferPendingAction.value !== "") {
      return;
    }

    packageTransferPendingAction.value = "import";
    packageTransferMessage.value = "";

    try {
      await scriptWorkspace.saveCurrentScript();
      await noteWorkspace.flushPendingSave(scriptWorkspace.currentFile.value);
      const result = await scriptRepository.importScenePackage();
      if (result?.cancelled) {
        return;
      }

      if (result?.workspace) {
        scriptWorkspace.applyWorkspaceSnapshot(result.workspace);
        noteWorkspace.hydrateFromScriptDocument(result.workspace.document ?? {});
        packageTransferMessage.value = `已导入场景 ${result.workspace.currentFile ?? ""}`.trim();
      }
    } catch (error) {
      const message = getErrorMessage(error);
      packageTransferMessage.value = message;
      runErrorDialog.openRunErrorDialog(message);
    } finally {
      packageTransferPendingAction.value = "";
    }
  }

  async function generateCodeFromNoteSelection(selection: AINoteSelectionPayload) {
    if (
      !scriptWorkspace.currentFile.value ||
      isRunning.value ||
      isAIGenerating.value ||
      !selection.items.length
    ) {
      return;
    }

    isAIGenerating.value = true;

    try {
      const result = await generateCodeFromSelection({
        sceneName: scriptWorkspace.currentFile.value,
        currentCode: scriptWorkspace.codeContent.value,
        settings: aiSettings.value,
        selection,
      });

      await streamGeneratedCode(result.code);
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    } finally {
      isAIGenerating.value = false;
    }
  }

  async function refreshSubscriptionStatus(force: boolean) {
    try {
      subscriptionStatus.value = await GetSubscriptionStatus(force);
    } catch (error) {
      subscriptionStatus.value = {
        ...subscriptionStatus.value,
        status: "error",
        activated: false,
        message: getErrorMessage(error),
      };
    }
  }

  async function purchaseSubscription() {
    try {
      subscriptionPurchaseState.value = await OpenSubscriptionPurchase();
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    }
  }

  async function refreshSubscriptionStatusManually() {
    await refreshSubscriptionStatus(true);
  }

  async function streamGeneratedCode(generatedCode: string) {
    const normalizedGeneratedCode = normalizeGeneratedCode(generatedCode);
    if (!normalizedGeneratedCode) {
      return;
    }

    const prefix = buildGenerationPrefix(scriptWorkspace.codeContent.value);
    scriptWorkspace.codeContent.value = prefix;
    const lines = normalizedGeneratedCode.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (index > 0) {
        scriptWorkspace.codeContent.value += "\n";
      }

      scriptWorkspace.codeContent.value += lines[index];
      await wait(index === 0 ? 170 : 95);
    }
  }

  onMounted(() => {
    bindRuntimeEvents();
    void loadEnvironmentStatus();
    void initializeApp();
  });

  onUnmounted(() => {
    cleanupEvents.forEach((cleanup) => cleanup());
    cleanupEvents = [];
  });

  return {
    aiSettings,
    codeContent: scriptWorkspace.codeContent,
    closeAISettings,
    currentNoteDocument: noteWorkspace.currentDocument,
    closePackageTransferDialog,
    closeCreateDialog: scriptWorkspace.closeCreateDialog,
    closeRunErrorDialog: runErrorDialog.closeRunErrorDialog,
    closeSettings,
    copyRunError: async () => {
      try {
        await runErrorDialog.copyRunError();
      } catch (error) {
        runErrorDialog.openRunErrorDialog(getErrorMessage(error));
      }
    },
    createScript: scriptWorkspace.createScript,
    currentFile: scriptWorkspace.currentFile,
    deleteScript: scriptWorkspace.deleteScript,
    deletingScriptName: scriptWorkspace.deletingScriptName,
    environmentStatus: runtime.environmentStatus,
    exportCurrentScenePackage,
    addNoteImages: noteWorkspace.addImages,
    generateCodeFromNoteSelection,
    hasNoteContent: noteWorkspace.hasContent,
    initProgressMessage: runtime.initProgressMessage,
    initProgressPercent: runtime.initProgressPercent,
    isAIGenerating,
    isAISettingsDialogOpen,
    isCreateDialogOpen: scriptWorkspace.isCreateDialogOpen,
    isCreatingScript: scriptWorkspace.isCreatingScript,
    isDeletingScript: scriptWorkspace.isDeletingScript,
    isInitializing: runtime.isInitializing,
    importScenePackage,
    isPackageTransferDialogOpen,
    isRebuildingRuntime: runtime.isRebuilding,
    isRenamingScript: scriptWorkspace.isRenamingScript,
    packageTransferMessage,
    packageTransferPendingAction,
    purchaseSubscription,
    isRunErrorCopied: runErrorDialog.isRunErrorCopied,
    isRunErrorDialogOpen: runErrorDialog.isRunErrorDialogOpen,
    isRunning,
    isSettingsDialogOpen,
    isNotePanelOpen: noteWorkspace.isPanelOpen,
    openCreateDialog: scriptWorkspace.openCreateDialog,
    openAISettings,
    openPackageTransferDialog,
    openSettings,
    noteRenderBlocks: noteWorkspace.renderBlocks,
    noteSaveState: noteWorkspace.saveState,
    renameScript: scriptWorkspace.renameScript,
    removeNoteImage: noteWorkspace.removeImage,
    rebuildRuntime,
    runCurrentScript: scriptWorkspace.runCurrentScript,
    runErrorText: runErrorDialog.runErrorText,
    scripts: scriptWorkspace.scripts,
    selectScript: scriptWorkspace.selectScript,
    stopCurrentRun,
    subscriptionPurchaseState,
    subscriptionStatus,
    toggleNotePanel,
    typingScriptName: scriptWorkspace.typingScriptName,
    updateCode: scriptWorkspace.updateCode,
    updateAISettings,
    updateNoteMarkdown: noteWorkspace.updateMarkdown,
    workspacePhase: scriptWorkspace.workspacePhase,
    refreshSubscriptionStatusManually,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeGeneratedCode(code: string) {
  return code.replace(/\r\n/g, "\n").trim();
}

function buildGenerationPrefix(currentCode: string) {
  const normalizedCurrentCode = currentCode.replace(/\r\n/g, "\n");
  if (normalizedCurrentCode.trim() === "") {
    return "";
  }

  return normalizedCurrentCode.replace(/\n*$/, "") + "\n\n\n";
}

function wait(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}
