<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import CreateScriptDialog from "./components/CreateScriptDialog.vue";
import AIAskDialog from "./components/AIAskDialog.vue";
import AIAskPins from "./components/AIAskPins.vue";
import AISettingsDialog from "./components/AISettingsDialog.vue";
import CodeAIOptimizeContextMenu from "./components/codeAIOptimize/CodeAIOptimizeContextMenu.vue";
import CodeAIOptimizeDialog from "./components/codeAIOptimize/CodeAIOptimizeDialog.vue";
import CodeAIVersionRail from "./components/codeAIOptimize/CodeAIVersionRail.vue";
import DesignCardOptimizeDialog from "./features/designCard/components/DesignCardOptimizeDialog.vue";
import DesignCardReviewRoom from "./features/designCard/components/DesignCardReviewRoom.vue";
import EditorPane from "./components/editor/EditorPane.vue";
import EnvironmentIndicator from "./components/EnvironmentIndicator.vue";
import GeometryAgentTimeline from "./features/geometry/components/GeometryAgentTimeline.vue";
import GeometryProblemDialog from "./features/geometry/components/GeometryProblemDialog.vue";
import GeometryReviewDialog from "./features/geometry/components/GeometryReviewDialog.vue";
import PackageTransferDialog from "./components/PackageTransferDialog.vue";
import NotePanel from "./components/note/NotePanel.vue";
import RunErrorDialog from "./components/RunErrorDialog.vue";
import RuntimeLoadingScreen from "./components/RuntimeLoadingScreen.vue";
import ScreeningDialog from "./components/ScreeningDialog.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import SidebarPanel from "./components/sidebar/SidebarPanel.vue";
import TopBar from "./components/TopBar.vue";
import UpdateRestartDialog from "./components/UpdateRestartDialog.vue";
import { usePlotWorkspace } from "./features/plot/model/usePlotWorkspace";
import { useTheme } from "./composables/useTheme";

const workspace = reactive(usePlotWorkspace());
const theme = reactive(useTheme());
const isSceneSwitching = ref(false);
const isLoadingScreenVisible = ref(true);
const appShell = ref<HTMLElement | null>(null);
const workspaceBody = ref<HTMLElement | null>(null);
const sidebarWidth = ref(clamp(loadStoredNumber("geometry-studio:sidebar-width", 320), 236, 520));
const workspaceSplitRatio = ref(
  clamp(loadStoredNumber("geometry-studio:workspace-split-ratio", 0.58), 0.28, 0.72),
);
const activeResize = ref<"" | "sidebar" | "workspace">("");

let sceneSwitchTimer = 0;
let hasMountedScene = false;
let resizeMoveHandler: ((event: PointerEvent) => void) | null = null;
let resizeEndHandler: (() => void) | null = null;

const shellStyle = computed<Record<string, string>>(() => ({
  "--sidebar-width": `${sidebarWidth.value}px`,
  "--editor-pane-fr": `${Math.max(1, workspaceSplitRatio.value * 1000)}fr`,
  "--note-pane-fr": `${Math.max(1, (1 - workspaceSplitRatio.value) * 1000)}fr`,
}));

watch(
  () => workspace.currentFile,
  () => {
    if (!hasMountedScene) {
      hasMountedScene = true;
      return;
    }

    window.clearTimeout(sceneSwitchTimer);
    isSceneSwitching.value = true;
    sceneSwitchTimer = window.setTimeout(() => {
      isSceneSwitching.value = false;
      sceneSwitchTimer = 0;
    }, 260);
  },
);

watch(
  () => workspace.isInitializing,
  (isInitializing) => {
    if (isInitializing) {
      isLoadingScreenVisible.value = true;
    }
  },
  { immediate: true },
);

function handleLoadingScreenSettled() {
  if (!workspace.isInitializing) {
    isLoadingScreenVisible.value = false;
  }
}

function startSidebarResize(event: PointerEvent) {
  beginResize("sidebar", event, (nextEvent) => {
    const viewportWidth = window.innerWidth || 1440;
    const maxWidth = Math.max(236, Math.min(520, viewportWidth - 560));
    sidebarWidth.value = clamp(nextEvent.clientX, 236, maxWidth);
    saveStoredNumber("geometry-studio:sidebar-width", sidebarWidth.value);
  });
}

function startWorkspaceResize(event: PointerEvent) {
  if (workspace.workspaceLayoutMode !== "split") {
    workspace.showSplitPane();
  }

  beginResize("workspace", event, (nextEvent) => {
    const rect = workspaceBody.value?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return;
    }

    const minEditorWidth = 300;
    const minNoteWidth = 300;
    const minRatio = Math.min(0.72, minEditorWidth / rect.width);
    const maxRatio = Math.max(minRatio, 1 - Math.min(0.72, minNoteWidth / rect.width));
    const nextRatio = (nextEvent.clientX - rect.left) / rect.width;
    workspaceSplitRatio.value = clamp(nextRatio, minRatio, maxRatio);
    saveStoredNumber("geometry-studio:workspace-split-ratio", workspaceSplitRatio.value);
  });
}

function beginResize(
  kind: "sidebar" | "workspace",
  event: PointerEvent,
  onMove: (event: PointerEvent) => void,
) {
  event.preventDefault();
  activeResize.value = kind;
  document.body.classList.add("workspace-resizing");
  onMove(event);

  resizeMoveHandler = (nextEvent: PointerEvent) => onMove(nextEvent);
  resizeEndHandler = () => {
    activeResize.value = "";
    document.body.classList.remove("workspace-resizing");
    if (resizeMoveHandler) {
      window.removeEventListener("pointermove", resizeMoveHandler);
    }
    if (resizeEndHandler) {
      window.removeEventListener("pointerup", resizeEndHandler);
      window.removeEventListener("pointercancel", resizeEndHandler);
    }
    resizeMoveHandler = null;
    resizeEndHandler = null;
  };

  window.addEventListener("pointermove", resizeMoveHandler);
  window.addEventListener("pointerup", resizeEndHandler);
  window.addEventListener("pointercancel", resizeEndHandler);
}

function loadStoredNumber(key: string, fallback: number) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const stored = window.localStorage.getItem(key);
  if (stored === null) {
    return fallback;
  }

  const raw = Number(stored);
  return Number.isFinite(raw) ? raw : fallback;
}

function saveStoredNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Layout persistence is a convenience; failed writes should not block resizing.
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

onBeforeUnmount(() => {
  window.clearTimeout(sceneSwitchTimer);
  resizeEndHandler?.();
});
</script>

<template>
  <div
    ref="appShell"
    class="app-shell"
    :class="{ 'resizing-shell': activeResize !== '' }"
    :style="shellStyle"
  >
    <Transition name="runtime-loading-shell">
      <RuntimeLoadingScreen
        v-if="isLoadingScreenVisible"
        :active="workspace.isInitializing"
        :progress="workspace.initProgressPercent"
        :message="workspace.initProgressMessage"
        :theme-id="theme.currentThemeId"
        @settled="handleLoadingScreenSettled"
      />
    </Transition>

    <SidebarPanel
      :scripts="workspace.scripts"
      :workspaces="workspace.workspaces"
      :current-file="workspace.currentFile"
      :current-workspace="workspace.currentWorkspace"
      :typing-script-name="workspace.typingScriptName"
      :deleting-script-name="workspace.deletingScriptName"
      :is-renaming="workspace.isRenamingScript"
      :is-deleting="workspace.isDeletingScript"
      :is-workspace-export-mode="workspace.isWorkspaceExportMode"
      :workspace-package-pending-action="workspace.workspacePackagePendingAction"
      :workspace-package-selected-names="workspace.workspacePackageSelectedNames"
      @select="workspace.selectScript"
      @create="workspace.openCreateDialog"
      @reorder="workspace.reorderScripts"
      @rename="workspace.renameScript"
      @delete="workspace.deleteScript"
      @switch-workspace="workspace.switchWorkspace"
      @create-workspace="workspace.createWorkspace"
      @rename-workspace="workspace.renameWorkspace"
      @delete-workspace="workspace.deleteWorkspace"
      @import-workspaces="workspace.importWorkspacePackage"
      @export-workspaces="workspace.exportSelectedWorkspaces"
      @toggle-workspace-export-mode="workspace.openWorkspaceExportMode"
      @cancel-workspace-export-mode="workspace.cancelWorkspaceExportMode"
      @toggle-workspace-export-selection="workspace.toggleWorkspaceExportSelection"
      @ai-settings="workspace.openAISettings"
      @settings="workspace.openSettings"
      @appearance="theme.cycleTheme"
    />

    <div
      class="app-resizer"
      :class="{ active: activeResize === 'sidebar' }"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整侧边栏宽度"
      @pointerdown="startSidebarResize"
    ></div>

    <main class="workspace">
      <TopBar
        :is-running="workspace.isRunning"
        :is-screening-active="workspace.isScreeningActive"
        :geometry-disabled="workspace.isAIGenerating || workspace.isRunning"
        @packages="workspace.openPackageTransferDialog"
        @geometry="workspace.openGeometryProblemDialog"
        @screening="workspace.triggerScreeningAction"
        @stop="workspace.stopCurrentRun"
        @run="workspace.runCurrentScript"
      />

      <div
        ref="workspaceBody"
        class="workspace-body"
        :class="[
          `layout-${workspace.workspaceLayoutMode}`,
          { 'resizing-panes': activeResize === 'workspace' },
        ]"
      >
        <section class="editor-workspace-column">
          <EditorPane
            :code="workspace.codeContent"
            :design-cards="workspace.designCards"
            :design-card-placements="workspace.designCardPlacements"
            :disabled="workspace.isAIGenerating"
            :is-scene-switching="isSceneSwitching"
            :is-streaming="workspace.isAIGenerating"
            :animated-line-ranges="workspace.repairAnimatedLineRanges"
            :animation-key="workspace.repairAnimationKey"
            @ai-optimize="workspace.openCodeAIOptimizeContextMenu"
            @delete-design-card="workspace.deleteDesignCard"
            @move-design-card="workspace.moveDesignCard"
            @open-design-card="workspace.openDesignCardReviewRoom"
            @place-design-card="workspace.placeDesignCard($event)"
            @design-card-anchor-line="workspace.setDesignCardAnchorLine"
            @update:code="workspace.updateCode"
          />

          <CodeAIVersionRail
            :versions="workspace.codeAIOptimizeVersions"
            :active-id="workspace.codeAIOptimizeActiveVersionId"
            @select="workspace.selectCodeAIOptimizeVersion"
          />

          <GeometryAgentTimeline
            v-if="workspace.geometryHasAgentTimeline"
            :steps="workspace.geometryAgentTimeline"
            :logs="workspace.geometryAgentLogs"
            :can-repair="workspace.geometryCanRepairLastFailure"
            @repair="workspace.repairGeometryFailure"
          />

          <EnvironmentIndicator
            :is-running="workspace.isRunning"
            :ai-busy="workspace.isAIGenerating"
            :ai-label="workspace.aiStatusLabel"
          />
        </section>

        <div
          class="workspace-divider-hotzone"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整代码区和笔记区宽度"
          @pointerdown="startWorkspaceResize"
        ></div>

        <NotePanel
          :current-file="workspace.currentFile"
          :document="workspace.currentNoteDocument"
          :design-cards="workspace.designCards"
          :is-open="workspace.isNotePanelOpen"
          :layout-mode="workspace.workspaceLayoutMode"
          :is-scene-switching="isSceneSwitching"
          :render-blocks="workspace.noteRenderBlocks"
          :save-state="workspace.noteSaveState"
          :ai-busy="workspace.isAIGenerating"
          @show-code="workspace.toggleCodePane"
          @show-split="workspace.showSplitPane"
          @show-note="workspace.toggleNotePane"
          @update:markdown="workspace.updateNoteMarkdown"
          @add-images="workspace.addNoteImages"
          @move-image="workspace.moveNoteImage"
          @remove-image="workspace.removeNoteImage"
          @delete-design-card="workspace.deleteDesignCardFromNote"
          @insert-design-card="workspace.insertDesignCardReferenceIntoNote"
          @open-design-card="workspace.openDesignCardReviewRoom"
          @ai-generate="workspace.generateCodeFromNoteSelection"
          @ai-design="workspace.generateDesignFromNoteSelection"
          @ai-geometry="workspace.generateGeometryFromNoteSelection"
          @ai-ask="workspace.openAIAskFromNoteSelection"
        />
      </div>
    </main>

    <CreateScriptDialog
      :open="workspace.isCreateDialogOpen"
      :pending="workspace.isCreatingScript"
      @cancel="workspace.closeCreateDialog"
      @confirm="workspace.createScript"
    />

    <ScreeningDialog
      :open="workspace.isScreeningDialogOpen"
      :items="workspace.screeningDialogItems"
      :pending="workspace.isStartingScreening"
      :start-disabled="!workspace.canStartScreening"
      @cancel="workspace.closeScreeningDialog"
      @confirm="workspace.beginScreening"
      @toggle="workspace.toggleScreeningScene"
    />

    <CodeAIOptimizeContextMenu
      v-if="workspace.codeAIOptimizeContextMenu"
      :position="workspace.codeAIOptimizeContextMenu"
      :can-ask="!!workspace.codeAIOptimizeContextMenu.selectedText"
      :disabled="workspace.isAIGenerating || workspace.isRunning"
      @close="workspace.closeCodeAIOptimizeContextMenu"
      @ask="workspace.openAIAskFromCodeContext"
      @optimize="workspace.openCodeAIOptimizeDialog"
    />

    <AIAskDialog
      :open="workspace.isAIAskDialogOpen"
      :pending="workspace.isAIAskPending"
      :answer="workspace.aiAskAnswer"
      :context-label="workspace.aiAskContextLabel"
      :initial-position="workspace.aiAskDialogPosition"
      @close="workspace.closeAIAskDialog"
      @submit="workspace.submitAIAsk"
    />

    <AIAskPins
      :pins="workspace.aiAskPins"
      @reopen="workspace.reopenAIAskPin"
      @remove="workspace.removeAIAskPin"
    />

    <CodeAIOptimizeDialog
      :open="workspace.isCodeAIOptimizeDialogOpen"
      :pending="workspace.isAIGenerating"
      @cancel="workspace.closeCodeAIOptimizeDialog"
      @confirm="workspace.submitCodeAIOptimize"
    />

    <DesignCardOptimizeDialog
      :open="workspace.isDesignCardOptimizeDialogOpen"
      :pending="workspace.isAIGenerating"
      @cancel="workspace.closeDesignCardOptimizeDialog"
      @confirm="workspace.submitDesignCardOptimize"
    />

    <DesignCardReviewRoom
      :open="workspace.isDesignCardReviewRoomOpen"
      :card="workspace.designCardReviewCard"
      :pending="workspace.isAIGenerating"
      :save-state="workspace.designCardReviewSaveState"
      @close="workspace.closeDesignCardReviewRoom"
      @optimize="workspace.openDesignCardOptimizeDialog"
      @update:plan="workspace.updateDesignCardPlan"
    />

    <GeometryProblemDialog
      :open="workspace.isGeometryProblemDialogOpen"
      :pending="workspace.isAIGenerating"
      @cancel="workspace.closeGeometryProblemDialog"
      @confirm="workspace.startGeometryFromProblem"
    />

    <GeometryReviewDialog
      :open="workspace.isGeometryReviewDialogOpen"
      :pending="workspace.isAIGenerating"
      :spec="workspace.geometryReviewSpec"
      @cancel="workspace.cancelGeometryReview"
      @confirm="workspace.confirmGeometryReview"
    />

    <SettingsDialog
      :open="workspace.isSettingsDialogOpen"
      :pending="workspace.isRebuildingRuntime"
      :running="workspace.isRunning"
      :status="workspace.environmentStatus"
      :update="workspace.updateStatus"
      :update-pending="workspace.isUpdatePending"
      @close="workspace.closeSettings"
      @check-update="workspace.handleUpdateAction"
      @rebuild="workspace.rebuildRuntime"
    />

    <AISettingsDialog
      :open="workspace.isAISettingsDialogOpen"
      :settings="workspace.aiSettings"
      :subscription-status="workspace.subscriptionStatus"
      @close="workspace.closeAISettings"
      @purchase-subscription="workspace.purchaseSubscription"
      @refresh-subscription="workspace.refreshSubscriptionStatusManually"
      @update:settings="workspace.updateAISettings"
    />

    <PackageTransferDialog
      :open="workspace.isPackageTransferDialogOpen"
      :current-file="workspace.currentFile"
      :last-message="workspace.packageTransferMessage"
      :pending-action="workspace.packageTransferPendingAction"
      :running="workspace.isRunning"
      @close="workspace.closePackageTransferDialog"
      @export="workspace.exportCurrentScenePackage"
      @import="workspace.importScenePackage"
    />

    <RunErrorDialog
      :open="workspace.isRunErrorDialogOpen"
      :error-text="workspace.runErrorText"
      :copied="workspace.isRunErrorCopied"
      :repairable="workspace.isRunErrorRepairable"
      :repair-disabled="workspace.isAIGenerating || workspace.isRunning"
      @close="workspace.closeRunErrorDialog"
      @copy="workspace.copyRunError"
      @repair="workspace.repairCurrentRunError"
    />

    <UpdateRestartDialog
      :open="workspace.isUpdateInstallDialogOpen"
      :pending="workspace.isInstallingUpdate"
      :version="workspace.updateStatus.latestVersion"
      @close="workspace.closeUpdateInstallDialog"
      @confirm="workspace.installUpdateAndRestart"
    />
  </div>
</template>
