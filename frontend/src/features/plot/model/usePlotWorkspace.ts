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
import { askAI } from "../../aiAsk/services/aiAskBridgeCompat";
import type {
  AppUpdateStatus,
  AIProviderSettings,
  AINoteSceneActionRequest,
  AINoteSelectionPayload,
  AISubscriptionStatus,
  ChangedLineRange,
} from "../../ai/services/aiTypes";
import type {
  GeometryFailedEvent,
  GeometryWorkflowResult,
  GeometryWorkflowSucceededEvent,
} from "../../geometry/services/geometryTypes";
import { useRunErrorDialog } from "../../errors/model/useRunErrorDialog";
import { useDesignCardWorkspace } from "../../designCard/model/useDesignCardWorkspace";
import { extractDesignCardReferenceIDs } from "../../designCard/services/designCardMarkdownCodec";
import type { DesignCardDragSource } from "../../designCard/services/designCardDragData";
import type { DesignCard } from "../../designCard/services/designCardTypes";
import { useGeometryWorkflowSession } from "../../geometry/model/useGeometryWorkflowSession";
import { useNoteWorkspace } from "../../notebook/model/useNoteWorkspace";
import { createRuntimeRepository } from "../../runtime/services/runtimeRepository";
import { useRuntimeState } from "../../runtime/model/useRuntimeState";
import { useScreeningWorkspace } from "../../screening/model/useScreeningWorkspace";
import { createScriptRepository } from "../../scripts/services/scriptRepository";
import { asString } from "../../scripts/model/scriptWorkspaceUtils";
import { useScriptWorkspaceMachine } from "../../scripts/model/useScriptWorkspaceMachine";
import { useWorkspacePackageTransfer } from "../../scripts/model/useWorkspacePackageTransfer";
import { getErrorMessage } from "../../../lib/errors";
import { useAIActivityStatus } from "./useAIActivityStatus";
import { usePlotAIWorkflow } from "./usePlotAIWorkflow";
import { usePackageTransfer } from "./usePackageTransfer";
import { usePkcDropImport } from "./usePkcDropImport";
import { useWorkspaceLifecycle } from "./useWorkspaceLifecycle";
import {
  createWorkspaceLayoutStorage,
  type WorkspaceLayoutMode,
} from "../services/workspaceLayoutStorage";
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  installUpdateAndRestart,
  type UpdateStatusLike,
} from "../../updates/services/updateBridgeCompat";

type AIAskContextKind = "note" | "code";

type AIAskPinnedContext = {
  answer: string;
  contextKind: AIAskContextKind;
  contextLabel: string;
  id: string;
  position: { x: number; y: number };
  question: string;
  sceneName: string;
  selection: AINoteSelectionPayload;
};

export function usePlotWorkspace() {
  const layoutStorage = createWorkspaceLayoutStorage();
  const isRunning = ref(false);
  const repairAnimatedLineRanges = ref<ChangedLineRange[]>([]);
  const repairAnimationKey = ref(0);
  const isAISettingsDialogOpen = ref(false);
  const isAIAskDialogOpen = ref(false);
  const isAIAskPending = ref(false);
  const aiAskAnswer = ref("");
  const aiAskContextLabel = ref("");
  const aiAskDialogPosition = ref<{ x: number; y: number } | null>(null);
  const aiAskPins = ref<AIAskPinnedContext[]>([]);
  const aiAskQuestion = ref("");
  const activeAIAskPinId = ref("");
  const pendingAIAskContext = ref<{
    contextKind: AIAskContextKind;
    contextLabel: string;
    origin?: { x: number; y: number };
    sceneName: string;
    selection: AINoteSelectionPayload;
  } | null>(null);
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
  const isGeometryProblemDialogOpen = ref(false);
  const updateStatus = ref<AppUpdateStatus>(normalizeUpdateStatus({}));
  const isCheckingUpdates = ref(false);
  const isDownloadingUpdate = ref(false);
  const isInstallingUpdate = ref(false);
  const isUpdateInstallDialogOpen = ref(false);
  const hasCheckedUpdatesThisSession = ref(false);
  const isUpdatePending = computed(
    () => isCheckingUpdates.value || isDownloadingUpdate.value || isInstallingUpdate.value,
  );
  const runtime = useRuntimeState();
  const runtimeRepository = createRuntimeRepository();
  const scriptRepository = createScriptRepository();
  const runErrorDialog = useRunErrorDialog();
  const aiActivity = useAIActivityStatus();
  const scriptWorkspace = useScriptWorkspaceMachine(
    runErrorDialog.openRunErrorDialog,
    isRunning,
    aiActivity.isAIGenerating,
  );
  const screeningWorkspace = useScreeningWorkspace({
    currentFile: scriptWorkspace.currentFile,
    onError: runErrorDialog.openRunErrorDialog,
    scripts: scriptWorkspace.scripts,
  });
  const workspacePackageTransfer = useWorkspacePackageTransfer({
    applyWorkspaceSnapshot: scriptWorkspace.applyWorkspaceSnapshot,
    currentWorkspace: scriptWorkspace.currentWorkspace,
    onError: runErrorDialog.openRunErrorDialog,
    repository: scriptRepository,
    workspaces: scriptWorkspace.workspaces,
  });
  const designCardsForNote = ref<DesignCard[]>([]);
  const noteWorkspace = useNoteWorkspace(
    scriptWorkspace.currentFile,
    runErrorDialog.openRunErrorDialog,
    designCardsForNote,
  );
  const workspaceLayoutMode = ref<WorkspaceLayoutMode>(
    layoutStorage.loadLayoutMode(noteWorkspace.isPanelOpen.value ? "split" : "code"),
  );
  const plotAIWorkflow = usePlotAIWorkflow({
    aiActivity,
    aiSettings,
    loadSceneCode: async (sceneName) => {
      if (sceneName === scriptWorkspace.currentFile.value) {
        return scriptWorkspace.codeContent.value;
      }

      const document = await scriptRepository.getScriptContent(sceneName);
      return asString(document.code);
    },
    onAnimateChangedRanges: animateRepairRanges,
    runErrorDialog,
    scriptWorkspace,
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
  const geometryWorkflowSession = useGeometryWorkflowSession(aiActivity);

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
    onRunFailed: (message) => {
      if (
        plotAIWorkflow.aiWorkflowSession.isSessionActive.value ||
        geometryWorkflowSession.isSessionActive.value
      ) {
        return;
      }

      runErrorDialog.openRunErrorDialog(message, { repairable: true });
    },
    onRunFinished: () => undefined,
    onRunReady: () => undefined,
    onRunStopped: () => undefined,
    refreshSubscriptionStatus,
    runtime,
    runtimeRepository,
    scriptWorkspace,
  });

  function setWorkspaceLayoutMode(mode: WorkspaceLayoutMode) {
    workspaceLayoutMode.value = mode;
    layoutStorage.saveLayoutMode(mode);
    noteWorkspace.setPanelOpen(mode !== "code");
  }

  function toggleCodePane() {
    setWorkspaceLayoutMode(workspaceLayoutMode.value === "code" ? "split" : "code");
  }

  function toggleNotePane() {
    setWorkspaceLayoutMode(workspaceLayoutMode.value === "note" ? "split" : "note");
  }

  function showSplitPane() {
    setWorkspaceLayoutMode("split");
  }

  function toggleNotePanel() {
    setWorkspaceLayoutMode(workspaceLayoutMode.value === "code" ? "split" : "code");
  }

  function openSettings() {
    resetUpdateButtonState();
    isSettingsDialogOpen.value = true;
  }

  async function createScript(name: string) {
    await scriptWorkspace.createScript(name);
  }

  async function renameScript(oldName: string, newName: string) {
    await scriptWorkspace.renameScript(oldName, newName);
  }

  async function deleteScript(name: string) {
    await scriptWorkspace.deleteScript(name);
  }

  function openAISettings() {
    isAISettingsDialogOpen.value = true;
    void refreshSubscriptionStatus(true);
  }

  function openGeometryProblemDialog() {
    if (!scriptWorkspace.currentFile.value || isRunning.value || aiActivity.isAIGenerating.value) {
      return;
    }
    isGeometryProblemDialogOpen.value = true;
  }

  function openAIAskFromNoteSelection(request: AINoteSceneActionRequest) {
    const sceneName = request.sceneName.trim();
    if (!sceneName || !request.selection.items.length || isRunning.value || aiActivity.isAIGenerating.value) {
      return;
    }

    openAIAskDialog({
      sceneName,
      contextKind: "note",
      contextLabel: "笔记区选中内容",
      origin: request.origin,
      selection: request.selection,
    });
  }

  function openAIAskFromCodeContext() {
    const menu = plotAIWorkflow.codeAIOptimize.contextMenu.value;
    plotAIWorkflow.codeAIOptimize.closeContextMenu();
    const selectedText = menu?.selectedText.trim() ?? "";
    const sceneName = scriptWorkspace.currentFile.value.trim();
    if (!sceneName || !selectedText || isRunning.value || aiActivity.isAIGenerating.value) {
      return;
    }

    openAIAskDialog({
      sceneName,
      contextKind: "code",
      contextLabel: "代码区选中内容",
      origin: { x: menu?.x ?? window.innerWidth - 360, y: menu?.y ?? 80 },
      selection: {
        items: [
          {
            kind: "text",
            text: selectedText,
          },
        ],
      },
    });
  }

  function openAIAskDialog(context: {
    contextKind: AIAskContextKind;
    contextLabel: string;
    origin?: { x: number; y: number };
    sceneName: string;
    selection: AINoteSelectionPayload;
  }) {
    activeAIAskPinId.value = "";
    pendingAIAskContext.value = context;
    aiAskAnswer.value = "";
    aiAskQuestion.value = "";
    aiAskContextLabel.value = `${context.contextLabel} · ${formatSelectionSummary(context.selection)}`;
    aiAskDialogPosition.value = getAIAskDialogPosition(context.origin);
    isAIAskDialogOpen.value = true;
  }

  function reopenAIAskPin(id: string) {
    const pin = aiAskPins.value.find((item) => item.id === id);
    if (!pin || isRunning.value || aiActivity.isAIGenerating.value) {
      return;
    }

    activeAIAskPinId.value = pin.id;
    pendingAIAskContext.value = {
      contextKind: pin.contextKind,
      contextLabel: pin.contextLabel,
      origin: pin.position,
      sceneName: pin.sceneName,
      selection: pin.selection,
    };
    aiAskAnswer.value = pin.answer;
    aiAskQuestion.value = pin.question;
    aiAskContextLabel.value = `${pin.contextLabel} · ${formatSelectionSummary(pin.selection)}`;
    aiAskDialogPosition.value = getAIAskDialogPosition(pin.position);
    isAIAskDialogOpen.value = true;
  }

  function removeAIAskPin(id: string) {
    aiAskPins.value = aiAskPins.value.filter((pin) => pin.id !== id);
    if (activeAIAskPinId.value === id) {
      activeAIAskPinId.value = "";
      if (isAIAskDialogOpen.value) {
        isAIAskDialogOpen.value = false;
        aiAskAnswer.value = "";
        aiAskContextLabel.value = "";
        aiAskDialogPosition.value = null;
        aiAskQuestion.value = "";
        pendingAIAskContext.value = null;
      }
    }
  }

  function closeAIAskDialog() {
    if (isAIAskPending.value) {
      return;
    }

    persistCurrentAIAskPin();
    isAIAskDialogOpen.value = false;
    aiAskAnswer.value = "";
    aiAskContextLabel.value = "";
    aiAskDialogPosition.value = null;
    aiAskQuestion.value = "";
    activeAIAskPinId.value = "";
    pendingAIAskContext.value = null;
  }

  async function submitAIAsk(question: string) {
    const context = pendingAIAskContext.value;
    const trimmedQuestion = question.trim();
    if (!context || !trimmedQuestion || isAIAskPending.value || isRunning.value || aiActivity.isAIGenerating.value) {
      return;
    }

    aiAskQuestion.value = trimmedQuestion;
    isAIAskPending.value = true;
    aiActivity.startWorking();
    try {
      const currentCode = await plotAIWorkflowLoadSceneCode(context.sceneName);
      const result = await askAI({
        sceneName: context.sceneName,
        currentCode,
        contextKind: context.contextKind,
        question: trimmedQuestion,
        selection: context.selection,
        settings: aiSettings.value,
      });
      aiAskAnswer.value = result.answer || "AI 没有返回内容。";
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    } finally {
      isAIAskPending.value = false;
      aiActivity.stop();
    }
  }

  function persistCurrentAIAskPin() {
    const context = pendingAIAskContext.value;
    if (!context) {
      return;
    }

    const id = activeAIAskPinId.value || createAIAskPinId();
    const nextPin: AIAskPinnedContext = {
      id,
      answer: aiAskAnswer.value,
      contextKind: context.contextKind,
      contextLabel: context.contextLabel,
      position: getAIAskPinPosition(context.origin ?? aiAskDialogPosition.value),
      question: aiAskQuestion.value,
      sceneName: context.sceneName,
      selection: context.selection,
    };
    const existingIndex = aiAskPins.value.findIndex((pin) => pin.id === id);
    if (existingIndex >= 0) {
      aiAskPins.value = aiAskPins.value.map((pin) => (pin.id === id ? nextPin : pin));
    } else {
      aiAskPins.value = [...aiAskPins.value, nextPin];
    }
    activeAIAskPinId.value = id;
  }

  function createAIAskPinId() {
    return `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getAIAskDialogPosition(origin?: { x: number; y: number } | null) {
    if (origin) {
      return clampViewportPosition({
        x: origin.x + 28,
        y: origin.y + 8,
      }, 760, 360);
    }

    return null;
  }

  function getAIAskPinPosition(origin?: { x: number; y: number } | null) {
    const fallback = {
      x: window.innerWidth - 86,
      y: 96,
    };
    return clampViewportPosition(origin ?? fallback, 36, 36);
  }

  function clampViewportPosition(
    position: { x: number; y: number },
    width: number,
    height: number,
  ) {
    const margin = 12;
    const maxX = Math.max(margin, window.innerWidth - width - margin);
    const maxY = Math.max(margin, window.innerHeight - height - margin);
    return {
      x: Math.min(maxX, Math.max(margin, position.x)),
      y: Math.min(maxY, Math.max(margin, position.y)),
    };
  }

  function closeGeometryProblemDialog() {
    if (aiActivity.isAIGenerating.value) {
      return;
    }
    isGeometryProblemDialogOpen.value = false;
  }

  async function startGeometryFromProblem(payload: { imageDataUrl: string; problemText: string }) {
    const sceneName = scriptWorkspace.currentFile.value.trim();
    if (!sceneName) {
      return;
    }

    isGeometryProblemDialogOpen.value = false;
    await beginGeometryWorkflow({
      sceneName,
      imageDataUrl: payload.imageDataUrl,
      problemText: payload.problemText,
    });
  }

  async function generateGeometryFromNoteSelection(request: AINoteSceneActionRequest) {
    const targetScene = request.sceneName.trim();
    if (!targetScene || !request.selection.items.length) {
      return;
    }

    await beginGeometryWorkflow({
      sceneName: targetScene,
      imageDataUrl: firstGeometryImage(request.selection),
      problemText: collectGeometryText(request.selection),
    });
  }

  async function beginGeometryWorkflow(payload: {
    sceneName: string;
    imageDataUrl: string;
    problemText: string;
  }) {
    if (isRunning.value || aiActivity.isAIGenerating.value) {
      return;
    }

    try {
      const currentCode = await plotAIWorkflowLoadSceneCode(payload.sceneName);
      setWorkspaceLayoutMode("split");
      await geometryWorkflowSession.startWorkflow(
        {
          sceneName: payload.sceneName,
          imageDataUrl: payload.imageDataUrl,
          problemText: payload.problemText,
          currentCode,
          settings: aiSettings.value,
          maxAttempts: 5,
        },
        createGeometryWorkflowOptions(),
      );
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    }
  }

  function createGeometryWorkflowOptions() {
    return {
      onCodeApplied: (event: { sceneName: string; code: string }) => {
        if (event.sceneName === scriptWorkspace.currentFile.value) {
          scriptWorkspace.updateCode(event.code);
        }
      },
      onSucceeded: (event: GeometryWorkflowSucceededEvent) => {
        runErrorDialog.clearRunError();
        void refreshGeometryResult(event.sceneName, event.result.noteMarkdown, event.result.code);
      },
      onFailed: (event: GeometryFailedEvent) => {
        const repairable = !!event.repairable && !!event.result?.code;
        runErrorDialog.openRunErrorDialog(
          formatGeometryFailure(event.errorText, event.diagnostics),
          {
            repairable,
            repairSceneName: event.sceneName,
            repairText: event.errorText,
          },
        );
      },
      onInterrupted: (event: { message: string }) => {
        runErrorDialog.openRunErrorDialog(event.message);
      },
    };
  }

  async function repairGeometryFailure() {
    const failure = geometryWorkflowSession.lastFailure.value;
    if (!failure?.repairable) {
      await plotAIWorkflow.aiRepair.repairCurrentRunError();
      return;
    }

    const sceneName = failure.sceneName || scriptWorkspace.currentFile.value;
    if (!sceneName) {
      return;
    }

    try {
      const currentCode = failure.result?.code || await plotAIWorkflowLoadSceneCode(sceneName);
      runErrorDialog.closeRunErrorDialog();
      await geometryWorkflowSession.repairWorkflow(
        {
          sceneName,
          currentCode,
          errorText: failure.errorText,
          diagnostics: failure.diagnostics ?? [],
          result: normalizeGeometryRepairResult(failure.result, currentCode),
          settings: aiSettings.value,
          maxAttempts: 3,
        },
        createGeometryWorkflowOptions(),
      );
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    }
  }

  async function plotAIWorkflowLoadSceneCode(sceneName: string) {
    if (sceneName === scriptWorkspace.currentFile.value) {
      return scriptWorkspace.codeContent.value;
    }

    const document = await scriptRepository.getScriptContent(sceneName);
    return asString(document.code);
  }

  async function refreshGeometryResult(sceneName: string, noteMarkdown: string, code: string) {
    try {
      if (sceneName === scriptWorkspace.currentFile.value) {
        if (code) {
          scriptWorkspace.updateCode(code);
        }
        if (noteMarkdown) {
          noteWorkspace.hydrateFromScriptDocument({ noteMarkdown });
        }
        const document = await scriptRepository.getScriptContent(sceneName);
        noteWorkspace.hydrateFromScriptDocument(document);
      }
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    }
  }

  async function confirmGeometryReview(spec: Parameters<typeof geometryWorkflowSession.resumeReview>[0]) {
    try {
      await geometryWorkflowSession.resumeReview(spec);
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    }
  }

  async function cancelGeometryReview() {
    try {
      await geometryWorkflowSession.stopActiveWorkflow();
    } catch (error) {
      runErrorDialog.openRunErrorDialog(getErrorMessage(error));
    }
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
    resetUpdateButtonState();
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

  async function selectScript(name: string) {
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
      const nextStatus = await getUpdateStatus();
      updateStatus.value = normalizeUpdateStatus(nextStatus, {
        hasCheckedThisSession: hasCheckedUpdatesThisSession.value,
      });
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
      hasCheckedUpdatesThisSession.value = true;
      updateStatus.value = normalizeUpdateStatus(await checkForUpdates(force), {
        hasCheckedThisSession: hasCheckedUpdatesThisSession.value,
      });
    } catch (error) {
      hasCheckedUpdatesThisSession.value = false;
      if (!quiet) {
        runErrorDialog.openRunErrorDialog(getErrorMessage(error));
      }
    } finally {
      isCheckingUpdates.value = false;
    }
  }

  async function handleUpdateAction() {
    if (updateStatus.value.actionKind === "install") {
      isUpdateInstallDialogOpen.value = true;
      return;
    }

    if (
      updateStatus.value.actionKind === "check" ||
      updateStatus.value.actionKind === "latest"
    ) {
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

  function resetUpdateButtonState() {
    hasCheckedUpdatesThisSession.value = false;
    updateStatus.value = normalizeUpdateStatus({
      currentVersion: updateStatus.value.currentVersion,
    });
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
    lifecycle.mount();
  });

  onUnmounted(() => {
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

  watch(
    workspaceLayoutMode,
    (mode) => {
      noteWorkspace.setPanelOpen(mode !== "code");
    },
    { immediate: true },
  );

  return {
    aiSettings,
    aiStatusLabel: computed(() => geometryWorkflowSession.agentStatusLabel.value || aiActivity.aiStatusLabel.value),
    aiAskAnswer,
    aiAskContextLabel,
    aiAskDialogPosition,
    aiAskPins,
    codeContent: scriptWorkspace.codeContent,
    designCards: designCardWorkspace.cards,
    designCardPlacements: designCardWorkspace.placements,
    designCardReviewCard: designCardWorkspace.activeCard,
    designCardReviewSaveState: designCardWorkspace.saveState,
    closeAISettings,
    closeAIAskDialog,
    currentNoteDocument: noteWorkspace.currentDocument,
    closePackageTransferDialog: packageTransfer.closePackageTransferDialog,
    closeCreateDialog: scriptWorkspace.closeCreateDialog,
    closeRunErrorDialog: runErrorDialog.closeRunErrorDialog,
    closeScreeningDialog: screeningWorkspace.closeScreeningDialog,
    closeSettings,
    cancelWorkspaceExportMode: workspacePackageTransfer.cancelExportMode,
    codeAIOptimizeActiveVersionId: plotAIWorkflow.codeAIOptimize.activeVersionId,
    codeAIOptimizeContextMenu: plotAIWorkflow.codeAIOptimize.contextMenu,
    codeAIOptimizeVersions: plotAIWorkflow.codeAIOptimize.versions,
    closeCodeAIOptimizeContextMenu: plotAIWorkflow.codeAIOptimize.closeContextMenu,
    closeCodeAIOptimizeDialog: plotAIWorkflow.codeAIOptimize.closeDialog,
    closeGeometryProblemDialog,
    copyRunError: async () => {
      try {
        await runErrorDialog.copyRunError();
      } catch (error) {
        runErrorDialog.openRunErrorDialog(getErrorMessage(error));
      }
    },
    createScript,
    createWorkspace,
    beginScreening: screeningWorkspace.beginScreening,
    canStartScreening: screeningWorkspace.canStartScreening,
    currentFile: scriptWorkspace.currentFile,
    currentScreeningIndex: screeningWorkspace.currentScreeningIndex,
    currentScreeningSceneName: screeningWorkspace.currentScreeningSceneName,
    currentWorkspace: scriptWorkspace.currentWorkspace,
    deleteScript,
    deleteWorkspace,
    deletingScriptName: scriptWorkspace.deletingScriptName,
    environmentStatus: runtime.environmentStatus,
    exportSelectedWorkspaces: workspacePackageTransfer.exportSelectedWorkspaces,
    exportCurrentScenePackage: packageTransfer.exportCurrentScenePackage,
    addNoteImages: noteWorkspace.addImages,
    generateCodeFromNoteSelection: plotAIWorkflow.aiGeneration.generateCodeFromNoteSelection,
    generateDesignFromNoteSelection: designCardWorkspace.generateFromNoteSelection,
    generateGeometryFromNoteSelection,
    geometryAgentLogs: geometryWorkflowSession.agentLogs,
    geometryAgentStatusLabel: geometryWorkflowSession.agentStatusLabel,
    geometryAgentTimeline: geometryWorkflowSession.agentTimeline,
    geometryCanRepairLastFailure: geometryWorkflowSession.canRepairLastFailure,
    geometryHasAgentTimeline: geometryWorkflowSession.hasAgentTimeline,
    geometryProgressLabel: geometryWorkflowSession.progressLabel,
    geometryReviewSpec: geometryWorkflowSession.reviewSpec,
    goToNextScreeningPage: screeningWorkspace.goToNextScreeningPage,
    hasNoteContent: noteWorkspace.hasContent,
    initProgressMessage: runtime.initProgressMessage,
    initProgressPercent: runtime.initProgressPercent,
    isAIGenerating: aiActivity.isAIGenerating,
    isAIAskDialogOpen,
    isAIAskPending,
    isAISettingsDialogOpen,
    isCodeAIOptimizeDialogOpen: plotAIWorkflow.codeAIOptimize.isDialogOpen,
    isDesignCardOptimizeDialogOpen: designCardWorkspace.isOptimizeDialogOpen,
    isDesignCardReviewRoomOpen: designCardWorkspace.isReviewRoomOpen,
    isGeometryProblemDialogOpen,
    isGeometryReviewDialogOpen: geometryWorkflowSession.isReviewing,
    isCreateDialogOpen: scriptWorkspace.isCreateDialogOpen,
    isCreatingScript: scriptWorkspace.isCreatingScript,
    isDeletingScript: scriptWorkspace.isDeletingScript,
    isInitializing: runtime.isInitializing,
    importScenePackage: packageTransfer.importScenePackage,
    importWorkspacePackage: workspacePackageTransfer.importWorkspacePackage,
    isPackageTransferDialogOpen: packageTransfer.isPackageTransferDialogOpen,
    isRebuildingRuntime: runtime.isRebuilding,
    isRenamingScript: scriptWorkspace.isRenamingScript,
    isScreeningActive: screeningWorkspace.isScreeningActive,
    isScreeningDialogOpen: screeningWorkspace.isScreeningDialogOpen,
    isStartingScreening: screeningWorkspace.isStartingScreening,
    isStoppingScreening: screeningWorkspace.isStoppingScreening,
    isWorkspaceExportMode: workspacePackageTransfer.isExportMode,
    packageTransferMessage: packageTransfer.packageTransferMessage,
    packageTransferPendingAction: packageTransfer.packageTransferPendingAction,
    purchaseSubscription,
    isRunErrorCopied: runErrorDialog.isRunErrorCopied,
    isRunErrorDialogOpen: runErrorDialog.isRunErrorDialogOpen,
    isRunErrorRepairable: runErrorDialog.isRunErrorRepairable,
    isRunning,
    isStoppingAIWorkflow: computed(
      () =>
        plotAIWorkflow.aiWorkflowSession.isSessionActive.value ||
        geometryWorkflowSession.isSessionActive.value,
    ),
    isSettingsDialogOpen,
    isUpdateInstallDialogOpen,
    isInstallingUpdate,
    isUpdatePending,
    isNotePanelOpen: computed(() => workspaceLayoutMode.value !== "code"),
    handleUpdateAction,
    openCreateDialog: scriptWorkspace.openCreateDialog,
    openAISettings,
    openAIAskFromCodeContext,
    openAIAskFromNoteSelection,
    openCodeAIOptimizeContextMenu: plotAIWorkflow.codeAIOptimize.openContextMenu,
    openCodeAIOptimizeDialog: plotAIWorkflow.codeAIOptimize.openDialog,
    openGeometryProblemDialog,
    openDesignCardReviewRoom: designCardWorkspace.openReviewRoom,
    openDesignCardOptimizeDialog: designCardWorkspace.openOptimizeDialog,
    openPackageTransferDialog: packageTransfer.openPackageTransferDialog,
    openScreeningDialog: screeningWorkspace.openScreeningDialog,
    triggerScreeningAction: screeningWorkspace.triggerScreeningAction,
    openSettings,
    openWorkspaceExportMode: workspacePackageTransfer.beginExportMode,
    noteRenderBlocks: noteWorkspace.renderBlocks,
    noteSaveState: noteWorkspace.saveState,
    reorderScripts: scriptWorkspace.reorderScripts,
    renameScript,
    renameWorkspace,
    reopenAIAskPin,
    removeAIAskPin,
    moveNoteImage: noteWorkspace.moveImage,
    removeNoteImage: noteWorkspace.removeImage,
    insertDesignCardReferenceIntoNote,
    placeDesignCard,
    deleteDesignCard: deleteDesignCardFromCode,
    deleteDesignCardFromNote,
    rebuildRuntime: lifecycle.rebuildRuntime,
    repairAnimationKey,
    repairAnimatedLineRanges,
    repairCurrentRunError: async () => {
      if (geometryWorkflowSession.canRepairLastFailure.value) {
        await repairGeometryFailure();
        return;
      }
      await plotAIWorkflow.aiRepair.repairCurrentRunError();
    },
    repairGeometryFailure,
    runCurrentScript: scriptWorkspace.runCurrentScript,
    runErrorText: runErrorDialog.runErrorText,
    screeningDialogItems: screeningWorkspace.screeningDialogItems,
    scripts: scriptWorkspace.scripts,
    selectedScreeningScenes: screeningWorkspace.selectedScreeningScenes,
    selectScript,
    selectCodeAIOptimizeVersion: plotAIWorkflow.codeAIOptimize.selectVersion,
    switchWorkspace,
    stopCurrentRun: lifecycle.stopCurrentRun,
    stopScreening: screeningWorkspace.stopScreening,
    subscriptionStatus,
    showSplitPane,
    startGeometryFromProblem,
    confirmGeometryReview,
    cancelGeometryReview,
    workspaceLayoutMode,
    toggleCodePane,
    toggleNotePane,
    toggleScreeningScene: screeningWorkspace.toggleScreeningScene,
    toggleWorkspaceExportSelection: workspacePackageTransfer.toggleWorkspaceSelection,
    updateStatus,
    toggleNotePanel,
    typingScriptName: scriptWorkspace.typingScriptName,
    updateCode: scriptWorkspace.updateCode,
    updateAISettings,
    submitAIAsk,
    submitCodeAIOptimize: plotAIWorkflow.codeAIOptimize.submitOptimization,
    submitDesignCardOptimize: designCardWorkspace.submitOptimization,
    closeDesignCardOptimizeDialog: designCardWorkspace.closeOptimizeDialog,
    closeDesignCardReviewRoom: designCardWorkspace.closeReviewRoom,
    moveDesignCard: designCardWorkspace.moveCard,
    setDesignCardPlacement: designCardWorkspace.setCardPlacement,
    setDesignCardAnchorLine: designCardWorkspace.setEditorAnchorLine,
    updateDesignCardPlan: designCardWorkspace.updateActivePlan,
    updateNoteMarkdown: noteWorkspace.updateMarkdown,
    workspaces: scriptWorkspace.workspaces,
    workspacePackagePendingAction: workspacePackageTransfer.pendingAction,
    workspacePackageSelectedNames: workspacePackageTransfer.selectedWorkspaceNames,
    workspacePhase: scriptWorkspace.workspacePhase,
    refreshSubscriptionStatusManually,
    closeUpdateInstallDialog,
    installUpdateAndRestart: installPreparedUpdate,
    stopAIWorkflow: async () => {
      if (geometryWorkflowSession.isSessionActive.value) {
        await geometryWorkflowSession.stopActiveWorkflow();
        return;
      }
      await plotAIWorkflow.aiWorkflowSession.stopActiveWorkflow();
    },
  };
}

function collectGeometryText(selection: AINoteSelectionPayload) {
  return selection.items
    .filter((item) => item.kind === "text")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function formatSelectionSummary(selection: AINoteSelectionPayload) {
  const textLength = selection.items
    .reduce((total, item) => item.kind === "text" ? total + item.text.trim().length : total, 0);
  const imageCount = selection.items.filter((item) => item.kind === "image").length;
  const parts: string[] = [];
  if (textLength > 0) {
    parts.push(`${textLength} 字`);
  }
  if (imageCount > 0) {
    parts.push(`${imageCount} 张图片`);
  }

  return parts.join("，") || "已选中内容";
}

function firstGeometryImage(selection: AINoteSelectionPayload) {
  return selection.items.find((item) => item.kind === "image" && item.dataUrl.trim())?.dataUrl ?? "";
}

function formatGeometryFailure(errorText: string, diagnostics: string[]) {
  const readableError = formatLLMServiceError(errorText);
  const detail = diagnostics.filter(Boolean).join("\n");
  return detail ? `${readableError}\n\n${detail}` : readableError;
}

function normalizeGeometryRepairResult(
  result: GeometryWorkflowResult | undefined,
  currentCode: string,
): GeometryWorkflowResult {
  return {
    code: result?.code || currentCode,
    noteMarkdown: result?.noteMarkdown ?? "",
    proofMarkdown: result?.proofMarkdown ?? "",
    spec: result?.spec ?? {
      problemText: "",
      goalText: "",
      entities: [],
      constraints: [],
      constructionHints: [],
      confidence: 0,
    },
    scene: result?.scene ?? {
      version: 1,
      title: "",
      sourceImage: "",
      points: [],
      segments: [],
      circles: [],
      polygons: [],
      controls: [],
      measurements: [],
      constraints: [],
      annotations: [],
      proofSteps: [],
    },
    diagnostics: result?.diagnostics ?? [],
  };
}

function formatLLMServiceError(errorText: string) {
  const normalized = errorText.trim();
  if (!normalized) {
    return "几何建模失败";
  }
  if (
    normalized.includes("upstream_error") ||
    normalized.includes("Upstream service temporarily unavailable")
  ) {
    return [
      "LLM 上游服务暂时不可用。",
      "请求已经发出，但模型服务返回 upstream_error。请在 AI 模型服务商里切换更稳定的 URL / MODEL，或稍后重试。",
      "",
      "原始错误：",
      normalized,
    ].join("\n");
  }
  return normalized;
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

function normalizeUpdateStatus(
  status: UpdateStatusLike,
  options?: { hasCheckedThisSession?: boolean },
): AppUpdateStatus {
  const readyToInstall = !!status.readyToInstall;
  const updateAvailable = !!status.updateAvailable;
  const hasChecked = !!options?.hasCheckedThisSession;
  const latestVersion = typeof status.latestVersion === "string" ? status.latestVersion : "";
  const actionKind = readyToInstall
    ? "install"
    : updateAvailable
      ? "download"
      : hasChecked
        ? "latest"
        : "check";

  return {
    currentVersion: typeof status.currentVersion === "string" ? status.currentVersion : "0.0.3.1",
    latestVersion,
    notes: typeof status.notes === "string" ? status.notes : "",
    publishedAt: typeof status.publishedAt === "string" ? status.publishedAt : "",
    lastCheckedAt: typeof status.lastCheckedAt === "string" ? status.lastCheckedAt : "",
    message: typeof status.message === "string" ? status.message : "当前已经是最新版本",
    updateAvailable,
    downloaded: !!status.downloaded,
    readyToInstall,
    actionKind,
    actionLabel: getUpdateActionLabel(actionKind, latestVersion),
  };
}

function getUpdateActionLabel(
  actionKind: AppUpdateStatus["actionKind"],
  latestVersion: string,
): string {
  switch (actionKind) {
    case "install":
      return "立即安装";
    case "download":
      return latestVersion ? `下载 v${latestVersion}` : "下载更新";
    case "latest":
      return "已是最新版";
    case "check":
    default:
      return "检查更新";
  }
}
