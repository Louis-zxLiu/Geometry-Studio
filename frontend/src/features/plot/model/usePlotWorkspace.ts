import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  GetSubscriptionStatus,
  OpenSubscriptionPurchase,
} from "../../../../wailsjs/go/bridge/App";
import {
  createDefaultAISettings,
  getAISettings,
  saveAISettings,
} from "../../ai/services/aiSettingsBridgeCompat";
import type {
  AppUpdateStatus,
  AIProviderSettings,
  AISubscriptionStatus,
} from "../../ai/services/aiTypes";
import { useAIRunErrorRepair } from "../../aiRepair/model/useAIRunErrorRepair";
import type { ChangedLineRange } from "../../aiRepair/services/repairPatch";
import { useRunErrorDialog } from "../../errors/model/useRunErrorDialog";
import { useCodeAIOptimize } from "../../codeAIOptimize/model/useCodeAIOptimize";
import { useDesignCardWorkspace } from "../../designCard/model/useDesignCardWorkspace";
import { extractDesignCardReferenceIDs } from "../../designCard/services/designCardMarkdownCodec";
import type { DesignCardDragSource } from "../../designCard/services/designCardDragData";
import type { DesignCard } from "../../designCard/services/designCardTypes";
import { useNoteWorkspace } from "../../notebook/model/useNoteWorkspace";
import { createRuntimeRepository } from "../../runtime/services/runtimeRepository";
import { useRuntimeState } from "../../runtime/model/useRuntimeState";
import { createScriptRepository } from "../../scripts/services/scriptRepository";
import { asString } from "../../scripts/model/scriptWorkspaceUtils";
import { useScriptWorkspaceMachine } from "../../scripts/model/useScriptWorkspaceMachine";
import { getErrorMessage } from "../../../lib/errors";
import { useAIActivityStatus } from "./useAIActivityStatus";
import {
  useAICodeExecutionLoop,
  type AICodeRunResult,
} from "../../aiExecution/model/useAICodeExecutionLoop";
import { useAIRunResultCoordinator } from "./useAIRunResultCoordinator";
import { useAINoteGeneration } from "./useAINoteGeneration";
import { useSceneCodeExecutionTask } from "./useSceneCodeExecutionTask";
import { useCodeStreaming } from "./useCodeStreaming";
import { usePackageTransfer } from "./usePackageTransfer";
import { usePkcDropImport } from "./usePkcDropImport";
import { useWorkspaceLifecycle } from "./useWorkspaceLifecycle";
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  installUpdateAndRestart,
  type UpdateStatusLike,
} from "../../updates/services/updateBridgeCompat";

export function usePlotWorkspace() {
  const isRunning = ref(false);
  const repairAnimatedLineRanges = ref<ChangedLineRange[]>([]);
  const repairAnimationKey = ref(0);
  const isAISettingsDialogOpen = ref(false);
  const aiSettings = ref<AIProviderSettings>(createDefaultAISettings());
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
  const isSettingsDialogOpen = ref(false);
  const updateStatus = ref<AppUpdateStatus>(normalizeUpdateStatus({}));
  const isCheckingUpdates = ref(false);
  const isDownloadingUpdate = ref(false);
  const isInstallingUpdate = ref(false);
  const isUpdateInstallDialogOpen = ref(false);
  const isUpdatePending = computed(
    () => isCheckingUpdates.value || isDownloadingUpdate.value || isInstallingUpdate.value,
  );
  const runtime = useRuntimeState();
  const runtimeRepository = createRuntimeRepository();
  const scriptRepository = createScriptRepository();
  const runErrorDialog = useRunErrorDialog();
  const aiActivity = useAIActivityStatus();
  const aiRunResultCoordinator = useAIRunResultCoordinator({
    onManualRunError: (message) => runErrorDialog.openRunErrorDialog(message, { repairable: true }),
  });
  const scriptWorkspace = useScriptWorkspaceMachine(
    runErrorDialog.openRunErrorDialog,
    isRunning,
    aiActivity.isAIGenerating,
  );
  const designCardsForNote = ref<DesignCard[]>([]);
  const noteWorkspace = useNoteWorkspace(
    scriptWorkspace.currentFile,
    runErrorDialog.openRunErrorDialog,
    designCardsForNote,
  );
  const codeStreaming = useCodeStreaming(scriptWorkspace.codeContent, scriptWorkspace.currentFile);
  const aiRepair = useAIRunErrorRepair({
    aiActivity,
    aiSettings,
    codeContent: scriptWorkspace.codeContent,
    currentFile: scriptWorkspace.currentFile,
    executeAICodeLoop: () => aiCodeExecutionLoop.execute(),
    executeSceneCodeLoop: (sceneName, code) => sceneCodeExecutionTask.execute(sceneName, code),
    errorDialog: runErrorDialog,
    isRunning,
    loadSceneCode: async (sceneName) => {
      if (sceneName === scriptWorkspace.currentFile.value) {
        return scriptWorkspace.codeContent.value;
      }

      const document = await scriptRepository.getScriptContent(sceneName);
      return asString(document.code);
    },
    onApplied: animateRepairRanges,
    saveSceneCode: async (sceneName, code) => {
      await scriptRepository.saveScript(sceneName, code);
      if (sceneName === scriptWorkspace.currentFile.value) {
        scriptWorkspace.updateCode(code);
      }
    },
  });
  const aiCodeExecutionLoop = useAICodeExecutionLoop({
    clearRunError: runErrorDialog.clearRunError,
    currentFile: scriptWorkspace.currentFile,
    isRunning,
    maxRepairAttempts: 8,
    onFailure: ({ message, repairable }) =>
      runErrorDialog.openRunErrorDialog(message, { repairable }),
    onInterrupted: () => runErrorDialog.openRunErrorDialog("已中断 AI 检查"),
    repairCodeWithError: aiRepair.repairCodeWithError,
    runCurrentCodeAndWait,
  });
  const sceneCodeExecutionTask = useSceneCodeExecutionTask({
    aiSettings: () => aiSettings.value,
    clearRunError: runErrorDialog.clearRunError,
    loadSceneCode: async (sceneName) => {
      if (sceneName === scriptWorkspace.currentFile.value) {
        return scriptWorkspace.codeContent.value;
      }

      const document = await scriptRepository.getScriptContent(sceneName);
      return asString(document.code);
    },
    maxRepairAttempts: 8,
    onFailure: ({ message, repairable, sceneName }) =>
      runErrorDialog.openRunErrorDialog(
        sceneName === scriptWorkspace.currentFile.value
          ? message
          : `[${sceneName}] ${message}`,
        {
          repairable,
          repairSceneName: sceneName,
          repairText: message,
        },
      ),
    onInterrupted: (sceneName) =>
      runErrorDialog.openRunErrorDialog(
        sceneName === scriptWorkspace.currentFile.value
          ? "已中断 AI 检查"
          : `[${sceneName}] 已中断 AI 检查`,
      ),
    runSceneCodeAndWait,
    saveSceneCode: async (sceneName, code) => {
      await scriptRepository.saveScript(sceneName, code);
      if (sceneName === scriptWorkspace.currentFile.value) {
        scriptWorkspace.updateCode(code);
      }
    },
  });
  const codeAIOptimize = useCodeAIOptimize({
    aiActivity,
    aiSettings,
    codeContent: scriptWorkspace.codeContent,
    currentFile: scriptWorkspace.currentFile,
    executeAICodeLoop: () => aiCodeExecutionLoop.execute(),
    isRunning,
    onApplied: animateRepairRanges,
    onError: runErrorDialog.openRunErrorDialog,
  });
  const aiGeneration = useAINoteGeneration({
    aiActivity,
    aiSettings,
    currentFile: scriptWorkspace.currentFile,
    executeSceneCodeLoop: (sceneName, code) => sceneCodeExecutionTask.execute(sceneName, code),
    isRunning,
    onError: runErrorDialog.openRunErrorDialog,
    resolveSceneCode: async (sceneName) => {
      if (sceneName === scriptWorkspace.currentFile.value) {
        return scriptWorkspace.codeContent.value;
      }

      const document = await scriptRepository.getScriptContent(sceneName);
      return asString(document.code);
    },
    saveSceneCode: async (sceneName, code) => {
      await scriptRepository.saveScript(sceneName, code);
    },
    streamGeneratedCode: codeStreaming.streamGeneratedCode,
  });
  const designCardWorkspace = useDesignCardWorkspace({
    aiActivity,
    aiSettings,
    codeContent: scriptWorkspace.codeContent,
    currentFile: scriptWorkspace.currentFile,
    isRunning,
    noteMarkdown: computed(() => noteWorkspace.currentDocument.value.markdown),
    onError: runErrorDialog.openRunErrorDialog,
  });
  const packageTransfer = usePackageTransfer({
    noteWorkspace,
    onError: runErrorDialog.openRunErrorDialog,
    scriptRepository,
    scriptWorkspace,
  });
  usePkcDropImport({
    onImport: packageTransfer.importScenePackageFromPath,
  });

  function insertDesignCardReferenceIntoNote(payload: {
    cardId: string;
    insertAt?: number;
    source?: "editor" | "note";
  }) {
    noteWorkspace.insertDesignCardReference({
      ...payload,
      persist: "immediate",
    });
    if (payload.source === "editor") {
      designCardWorkspace.removeCardPlacement(payload.cardId);
    }
  }

  function placeDesignCard(payload: {
    cardId: string;
    afterLine: number;
    source: DesignCardDragSource;
  }) {
    designCardWorkspace.setCardPlacement(payload.cardId, payload.afterLine);
    if (payload.source === "note") {
      noteWorkspace.removeDesignCardReference({
        cardId: payload.cardId,
        persist: "immediate",
      });
    }
  }

  async function deleteDesignCardFromNote(cardId: string) {
    const hasCodePlacement = designCardWorkspace.placements.value.some(
      (placement) => placement.cardId === cardId,
    );
    noteWorkspace.removeDesignCardReference({
      cardId,
      persist: "immediate",
    });
    if (!hasCodePlacement) {
      await designCardWorkspace.deleteCard(cardId);
    }
  }

  async function deleteDesignCardFromCode(cardId: string) {
    const stillReferencedInNote = extractDesignCardReferenceIDs(
      noteWorkspace.currentDocument.value.markdown,
    ).includes(cardId);
    if (!stillReferencedInNote) {
      await designCardWorkspace.deleteCard(cardId);
      return;
    }

    designCardWorkspace.removeCardPlacement(cardId);
  }

  const lifecycle = useWorkspaceLifecycle({
    isRunning,
    noteWorkspace,
    onError: runErrorDialog.openRunErrorDialog,
    onRunFailed: aiRunResultCoordinator.handleRunFailed,
    onRunFinished: aiRunResultCoordinator.handleRunFinished,
    onRunReady: aiRunResultCoordinator.handleRunReady,
    onRunStopped: aiRunResultCoordinator.handleRunStopped,
    refreshSubscriptionStatus,
    runtime,
    runtimeRepository,
    scriptWorkspace,
  });

  async function runCurrentCodeAndWait(): Promise<AICodeRunResult> {
    return runSceneCodeAndWait(scriptWorkspace.currentFile.value, scriptWorkspace.codeContent.value);
  }

  async function runSceneCodeAndWait(sceneName: string, code: string): Promise<AICodeRunResult> {
    const resultPromise = aiRunResultCoordinator.createPendingAICodeRun();

    try {
      await scriptRepository.saveAndRun(sceneName, code);
      return await resultPromise;
    } catch (error) {
      aiRunResultCoordinator.settlePendingAICodeRun({
        ok: false,
        errorText: getErrorMessage(error),
        reason: "failed",
      });
      throw error;
    }
  }

  function toggleNotePanel() {
    noteWorkspace.togglePanel();
  }

  function openSettings() {
    isSettingsDialogOpen.value = true;
  }

  async function createScript(name: string) {
    codeStreaming.cancelStreaming();
    await scriptWorkspace.createScript(name);
  }

  async function renameScript(oldName: string, newName: string) {
    codeStreaming.cancelStreaming();
    await scriptWorkspace.renameScript(oldName, newName);
  }

  async function deleteScript(name: string) {
    codeStreaming.cancelStreaming();
    await scriptWorkspace.deleteScript(name);
  }

  function openAISettings() {
    isAISettingsDialogOpen.value = true;
    void refreshSubscriptionStatus(true);
  }

  function closeAISettings() {
    isAISettingsDialogOpen.value = false;
  }

  async function updateAISettings(nextSettings: AIProviderSettings) {
    try {
      aiSettings.value = await saveAISettings(nextSettings);
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    }
  }

  function closeSettings() {
    isSettingsDialogOpen.value = false;
  }

  async function switchWorkspace(name: string) {
    codeStreaming.cancelStreaming();
    await noteWorkspace.flushPendingSave(scriptWorkspace.currentFile.value);
    await scriptWorkspace.switchWorkspace(name);
  }

  async function createWorkspace(name: string) {
    codeStreaming.cancelStreaming();
    await noteWorkspace.flushPendingSave(scriptWorkspace.currentFile.value);
    await scriptWorkspace.createWorkspace(name);
  }

  async function renameWorkspace(oldName: string, newName: string) {
    codeStreaming.cancelStreaming();
    await noteWorkspace.flushPendingSave(scriptWorkspace.currentFile.value);
    await scriptWorkspace.renameWorkspace(oldName, newName);
  }

  async function deleteWorkspace(name: string) {
    codeStreaming.cancelStreaming();
    await noteWorkspace.flushPendingSave(scriptWorkspace.currentFile.value);
    await scriptWorkspace.deleteWorkspace(name);
  }

  async function selectScript(name: string) {
    codeStreaming.cancelStreaming();
    await scriptWorkspace.selectScript(name);
  }

  async function refreshSubscriptionStatus(force: boolean) {
    try {
      subscriptionStatus.value = normalizeSubscriptionStatus(await GetSubscriptionStatus(force));
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
      await OpenSubscriptionPurchase();
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    }
  }

  async function refreshSubscriptionStatusManually() {
    await refreshSubscriptionStatus(true);
  }

  async function refreshAISettings() {
    try {
      aiSettings.value = await getAISettings();
    } catch (error) {
      aiSettings.value = createDefaultAISettings();
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    }
  }

  async function refreshUpdateStatus() {
    try {
      updateStatus.value = normalizeUpdateStatus(await getUpdateStatus());
    } catch (error) {
      updateStatus.value = {
        ...updateStatus.value,
        message: getErrorMessage(error),
      };
    }
  }

  async function checkUpdates(force: boolean, quiet = false) {
    if (isCheckingUpdates.value || isDownloadingUpdate.value || isInstallingUpdate.value) {
      return;
    }

    isCheckingUpdates.value = true;
    try {
      updateStatus.value = normalizeUpdateStatus(await checkForUpdates(force));
    } catch (error) {
      if (!quiet) {
        runErrorDialog.openRunErrorDialog(getErrorMessage(error));
      }
    } finally {
      isCheckingUpdates.value = false;
    }
  }

  async function handleUpdateAction() {
    if (updateStatus.value.readyToInstall) {
      isUpdateInstallDialogOpen.value = true;
      return;
    }

    if (updateStatus.value.actionLabel === "检查更新") {
      await checkUpdates(true);
      return;
    }

    if (isDownloadingUpdate.value || isInstallingUpdate.value) {
      return;
    }

    isDownloadingUpdate.value = true;
    try {
      updateStatus.value = normalizeUpdateStatus(await downloadUpdate());
      if (updateStatus.value.readyToInstall) {
        isUpdateInstallDialogOpen.value = true;
      }
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    } finally {
      isDownloadingUpdate.value = false;
    }
  }

  function closeUpdateInstallDialog() {
    if (isInstallingUpdate.value) {
      return;
    }

    isUpdateInstallDialogOpen.value = false;
  }

  async function installPreparedUpdate() {
    if (isInstallingUpdate.value) {
      return;
    }

    isInstallingUpdate.value = true;
    try {
      await installUpdateAndRestart();
    } catch (error) {
      isInstallingUpdate.value = false;
      isUpdateInstallDialogOpen.value = false;
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    }
  }

  function animateRepairRanges(ranges: ChangedLineRange[]) {
    repairAnimatedLineRanges.value = ranges;
    repairAnimationKey.value += 1;
    window.setTimeout(() => {
      repairAnimatedLineRanges.value = [];
    }, 720);
  }

  onMounted(() => {
    void refreshAISettings();
    void refreshUpdateStatus();
    void checkUpdates(false, true);
    lifecycle.mount();
  });

  onUnmounted(() => {
    codeStreaming.cancelStreaming();
    void designCardWorkspace.flushPlanSave();
    void noteWorkspace.flushPendingSave(scriptWorkspace.currentFile.value);
    lifecycle.unmount();
    aiActivity.stop();
  });

  watch(
    designCardWorkspace.cards,
    (cards) => {
      designCardsForNote.value = cards;
    },
    { immediate: true },
  );

  return {
    aiSettings,
    aiStatusLabel: aiActivity.aiStatusLabel,
    codeContent: scriptWorkspace.codeContent,
    designCards: designCardWorkspace.cards,
    designCardPlacements: designCardWorkspace.placements,
    designCardReviewCard: designCardWorkspace.activeCard,
    designCardReviewSaveState: designCardWorkspace.saveState,
    closeAISettings,
    currentNoteDocument: noteWorkspace.currentDocument,
    closePackageTransferDialog: packageTransfer.closePackageTransferDialog,
    closeCreateDialog: scriptWorkspace.closeCreateDialog,
    closeRunErrorDialog: runErrorDialog.closeRunErrorDialog,
    closeSettings,
    codeAIOptimizeActiveVersionId: codeAIOptimize.activeVersionId,
    codeAIOptimizeContextMenu: codeAIOptimize.contextMenu,
    codeAIOptimizeVersions: codeAIOptimize.versions,
    closeCodeAIOptimizeContextMenu: codeAIOptimize.closeContextMenu,
    closeCodeAIOptimizeDialog: codeAIOptimize.closeDialog,
    copyRunError: async () => {
      try {
        await runErrorDialog.copyRunError();
      } catch (error) {
        runErrorDialog.openRunErrorDialog(getErrorMessage(error));
      }
    },
    createScript,
    createWorkspace,
    currentFile: scriptWorkspace.currentFile,
    currentWorkspace: scriptWorkspace.currentWorkspace,
    deleteScript,
    deleteWorkspace,
    deletingScriptName: scriptWorkspace.deletingScriptName,
    environmentStatus: runtime.environmentStatus,
    exportCurrentScenePackage: packageTransfer.exportCurrentScenePackage,
    addNoteImages: noteWorkspace.addImages,
    generateCodeFromNoteSelection: aiGeneration.generateCodeFromNoteSelection,
    generateDesignFromNoteSelection: designCardWorkspace.generateFromNoteSelection,
    hasNoteContent: noteWorkspace.hasContent,
    initProgressMessage: runtime.initProgressMessage,
    initProgressPercent: runtime.initProgressPercent,
    isAIGenerating: aiActivity.isAIGenerating,
    isAISettingsDialogOpen,
    isCodeAIOptimizeDialogOpen: codeAIOptimize.isDialogOpen,
    isDesignCardOptimizeDialogOpen: designCardWorkspace.isOptimizeDialogOpen,
    isDesignCardReviewRoomOpen: designCardWorkspace.isReviewRoomOpen,
    isCreateDialogOpen: scriptWorkspace.isCreateDialogOpen,
    isCreatingScript: scriptWorkspace.isCreatingScript,
    isDeletingScript: scriptWorkspace.isDeletingScript,
    isInitializing: runtime.isInitializing,
    importScenePackage: packageTransfer.importScenePackage,
    isPackageTransferDialogOpen: packageTransfer.isPackageTransferDialogOpen,
    isRebuildingRuntime: runtime.isRebuilding,
    isRenamingScript: scriptWorkspace.isRenamingScript,
    packageTransferMessage: packageTransfer.packageTransferMessage,
    packageTransferPendingAction: packageTransfer.packageTransferPendingAction,
    purchaseSubscription,
    isRunErrorCopied: runErrorDialog.isRunErrorCopied,
    isRunErrorDialogOpen: runErrorDialog.isRunErrorDialogOpen,
    isRunErrorRepairable: runErrorDialog.isRunErrorRepairable,
    isRunning,
    isSettingsDialogOpen,
    isUpdateInstallDialogOpen,
    isInstallingUpdate,
    isUpdatePending,
    isNotePanelOpen: noteWorkspace.isPanelOpen,
    handleUpdateAction,
    openCreateDialog: scriptWorkspace.openCreateDialog,
    openAISettings,
    openCodeAIOptimizeContextMenu: codeAIOptimize.openContextMenu,
    openCodeAIOptimizeDialog: codeAIOptimize.openDialog,
    openDesignCardReviewRoom: designCardWorkspace.openReviewRoom,
    openDesignCardOptimizeDialog: designCardWorkspace.openOptimizeDialog,
    openPackageTransferDialog: packageTransfer.openPackageTransferDialog,
    openSettings,
    noteRenderBlocks: noteWorkspace.renderBlocks,
    noteSaveState: noteWorkspace.saveState,
    reorderScripts: scriptWorkspace.reorderScripts,
    renameScript,
    renameWorkspace,
    moveNoteImage: noteWorkspace.moveImage,
    removeNoteImage: noteWorkspace.removeImage,
    insertDesignCardReferenceIntoNote,
    placeDesignCard,
    deleteDesignCard: deleteDesignCardFromCode,
    deleteDesignCardFromNote,
    rebuildRuntime: lifecycle.rebuildRuntime,
    repairAnimationKey,
    repairAnimatedLineRanges,
    repairCurrentRunError: aiRepair.repairCurrentRunError,
    runCurrentScript: scriptWorkspace.runCurrentScript,
    runErrorText: runErrorDialog.runErrorText,
    scripts: scriptWorkspace.scripts,
    selectScript,
    selectCodeAIOptimizeVersion: codeAIOptimize.selectVersion,
    switchWorkspace,
    stopCurrentRun: lifecycle.stopCurrentRun,
    subscriptionStatus,
    updateStatus,
    toggleNotePanel,
    typingScriptName: scriptWorkspace.typingScriptName,
    updateCode: scriptWorkspace.updateCode,
    updateAISettings,
    submitCodeAIOptimize: codeAIOptimize.submitOptimization,
    submitDesignCardOptimize: designCardWorkspace.submitOptimization,
    closeDesignCardOptimizeDialog: designCardWorkspace.closeOptimizeDialog,
    closeDesignCardReviewRoom: designCardWorkspace.closeReviewRoom,
    moveDesignCard: designCardWorkspace.moveCard,
    setDesignCardPlacement: designCardWorkspace.setCardPlacement,
    setDesignCardAnchorLine: designCardWorkspace.setEditorAnchorLine,
    updateDesignCardPlan: designCardWorkspace.updateActivePlan,
    updateNoteMarkdown: noteWorkspace.updateMarkdown,
    workspaces: scriptWorkspace.workspaces,
    workspacePhase: scriptWorkspace.workspacePhase,
    refreshSubscriptionStatusManually,
    closeUpdateInstallDialog,
    installUpdateAndRestart: installPreparedUpdate,
  };
}

function normalizeSubscriptionStatus(status: {
  status?: string;
  activated?: boolean;
  deviceId?: string;
  expireAt?: string;
  lastCheckedAt?: string;
  message?: string;
  model?: string;
  baseUrl?: string;
}): AISubscriptionStatus {
  return {
    status: normalizeSubscriptionStatusCode(status.status),
    activated: !!status.activated,
    deviceId: status.deviceId ?? "",
    expireAt: status.expireAt ?? "",
    lastCheckedAt: status.lastCheckedAt ?? "",
    message: status.message ?? "",
    model: status.model ?? "",
    baseUrl: status.baseUrl ?? "",
  };
}

function normalizeSubscriptionStatusCode(status?: string): AISubscriptionStatus["status"] {
  if (
    status === "active" ||
    status === "inactive" ||
    status === "unconfigured" ||
    status === "error"
  ) {
    return status;
  }

  return "error";
}

function normalizeUpdateStatus(status: UpdateStatusLike): AppUpdateStatus {
  const readyToInstall = !!status.readyToInstall;
  const updateAvailable = !!status.updateAvailable;

  return {
    currentVersion: typeof status.currentVersion === "string" ? status.currentVersion : "0.0.2.6",
    latestVersion: typeof status.latestVersion === "string" ? status.latestVersion : "",
    notes: typeof status.notes === "string" ? status.notes : "",
    publishedAt: typeof status.publishedAt === "string" ? status.publishedAt : "",
    lastCheckedAt: typeof status.lastCheckedAt === "string" ? status.lastCheckedAt : "",
    message: typeof status.message === "string" ? status.message : "当前已经是最新版本",
    updateAvailable,
    downloaded: !!status.downloaded,
    readyToInstall,
    actionLabel: readyToInstall ? "立即更新" : updateAvailable ? "下载新版本" : "检查更新",
  };
}
