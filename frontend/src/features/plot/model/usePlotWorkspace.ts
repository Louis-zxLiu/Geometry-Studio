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
import type { DesignCard } from "../../designCard/services/designCardTypes";
import { useNoteWorkspace } from "../../notebook/model/useNoteWorkspace";
import { createRuntimeRepository } from "../../runtime/services/runtimeRepository";
import { useRuntimeState } from "../../runtime/model/useRuntimeState";
import { createScriptRepository } from "../../scripts/services/scriptRepository";
import { useScriptWorkspaceMachine } from "../../scripts/model/useScriptWorkspaceMachine";
import { getErrorMessage } from "../../../lib/errors";
import { useAIActivityStatus } from "./useAIActivityStatus";
import { useAINoteGeneration } from "./useAINoteGeneration";
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
  const scriptWorkspace = useScriptWorkspaceMachine(
    runErrorDialog.openRunErrorDialog,
    isRunning,
  );
  const designCardsForNote = ref<DesignCard[]>([]);
  const noteWorkspace = useNoteWorkspace(
    scriptWorkspace.currentFile,
    runErrorDialog.openRunErrorDialog,
    designCardsForNote,
  );
  const aiActivity = useAIActivityStatus();
  const codeStreaming = useCodeStreaming(scriptWorkspace.codeContent);
  const codeAIOptimize = useCodeAIOptimize({
    aiActivity,
    aiSettings,
    codeContent: scriptWorkspace.codeContent,
    currentFile: scriptWorkspace.currentFile,
    isRunning,
    onApplied: animateRepairRanges,
    onError: runErrorDialog.openRunErrorDialog,
  });
  const aiGeneration = useAINoteGeneration({
    aiActivity,
    aiSettings,
    codeContent: scriptWorkspace.codeContent,
    currentFile: scriptWorkspace.currentFile,
    isRunning,
    onError: runErrorDialog.openRunErrorDialog,
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
    updateNoteMarkdown: noteWorkspace.updateMarkdown,
  });
  const aiRepair = useAIRunErrorRepair({
    aiActivity,
    aiSettings,
    codeContent: scriptWorkspace.codeContent,
    currentFile: scriptWorkspace.currentFile,
    errorDialog: runErrorDialog,
    isRunning,
    onApplied: animateRepairRanges,
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
    noteWorkspace.insertDesignCardReference(payload);
    if (payload.source === "editor") {
      designCardWorkspace.removeCardPlacement(payload.cardId);
    }
  }

  const lifecycle = useWorkspaceLifecycle({
    isRunning,
    noteWorkspace,
    onError: runErrorDialog.openRunErrorDialog,
    onRunError: (message) => runErrorDialog.openRunErrorDialog(message, { repairable: true }),
    refreshSubscriptionStatus,
    runtime,
    runtimeRepository,
    scriptWorkspace,
  });

  function toggleNotePanel() {
    noteWorkspace.togglePanel();
  }

  function openSettings() {
    isSettingsDialogOpen.value = true;
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
    await noteWorkspace.flushPendingSave(scriptWorkspace.currentFile.value);
    await scriptWorkspace.switchWorkspace(name);
  }

  async function createWorkspace(name: string) {
    await noteWorkspace.flushPendingSave(scriptWorkspace.currentFile.value);
    await scriptWorkspace.createWorkspace(name);
  }

  async function renameWorkspace(oldName: string, newName: string) {
    await noteWorkspace.flushPendingSave(scriptWorkspace.currentFile.value);
    await scriptWorkspace.renameWorkspace(oldName, newName);
  }

  async function deleteWorkspace(name: string) {
    await noteWorkspace.flushPendingSave(scriptWorkspace.currentFile.value);
    await scriptWorkspace.deleteWorkspace(name);
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
    void designCardWorkspace.flushPlanSave();
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
    createScript: scriptWorkspace.createScript,
    createWorkspace,
    currentFile: scriptWorkspace.currentFile,
    currentWorkspace: scriptWorkspace.currentWorkspace,
    deleteScript: scriptWorkspace.deleteScript,
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
    renameScript: scriptWorkspace.renameScript,
    renameWorkspace,
    removeNoteImage: noteWorkspace.removeImage,
    insertDesignCardReferenceIntoNote,
    deleteDesignCard: designCardWorkspace.deleteCard,
    deleteDesignCardFromNote: designCardWorkspace.deleteCardFromNote,
    rebuildRuntime: lifecycle.rebuildRuntime,
    repairAnimationKey,
    repairAnimatedLineRanges,
    repairCurrentRunError: aiRepair.repairCurrentRunError,
    runCurrentScript: scriptWorkspace.runCurrentScript,
    runErrorText: runErrorDialog.runErrorText,
    scripts: scriptWorkspace.scripts,
    selectScript: scriptWorkspace.selectScript,
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
    currentVersion: typeof status.currentVersion === "string" ? status.currentVersion : "0.0.1",
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
