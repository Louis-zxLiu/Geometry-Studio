<script setup lang="ts">
import { reactive } from "vue";
import CreateScriptDialog from "./components/CreateScriptDialog.vue";
import AISettingsDialog from "./components/AISettingsDialog.vue";
import CodeAIOptimizeContextMenu from "./components/codeAIOptimize/CodeAIOptimizeContextMenu.vue";
import CodeAIOptimizeDialog from "./components/codeAIOptimize/CodeAIOptimizeDialog.vue";
import CodeAIVersionRail from "./components/codeAIOptimize/CodeAIVersionRail.vue";
import DesignCardOptimizeDialog from "./features/designCard/components/DesignCardOptimizeDialog.vue";
import DesignCardReviewRoom from "./features/designCard/components/DesignCardReviewRoom.vue";
import EditorPane from "./components/editor/EditorPane.vue";
import EnvironmentIndicator from "./components/EnvironmentIndicator.vue";
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
</script>

<template>
  <div class="app-shell">
    <RuntimeLoadingScreen
      v-if="workspace.isInitializing"
      :progress="workspace.initProgressPercent"
      :message="workspace.initProgressMessage"
    />

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

    <main class="workspace">
      <div
        class="workspace-body"
        :class="{ 'notebook-collapsed': !workspace.isNotePanelOpen }"
      >
        <section class="editor-workspace-column">
          <TopBar
            :is-running="workspace.isRunning"
            :is-screening-active="workspace.isScreeningActive"
            @packages="workspace.openPackageTransferDialog"
            @screening="workspace.openScreeningDialog"
            @stop="workspace.stopCurrentRun"
            @run="workspace.runCurrentScript"
          />

          <EditorPane
            :key="workspace.currentFile || '__empty_scene__'"
            :code="workspace.codeContent"
            :design-cards="workspace.designCards"
            :design-card-placements="workspace.designCardPlacements"
            :disabled="workspace.isAIGenerating"
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

          <EnvironmentIndicator
            :is-running="workspace.isRunning"
            :ai-busy="workspace.isAIGenerating"
            :ai-label="workspace.aiStatusLabel"
          />
        </section>

        <NotePanel
          :key="workspace.currentFile || '__empty_scene__'"
          :current-file="workspace.currentFile"
          :document="workspace.currentNoteDocument"
          :design-cards="workspace.designCards"
          :is-open="workspace.isNotePanelOpen"
          :render-blocks="workspace.noteRenderBlocks"
          :save-state="workspace.noteSaveState"
          :ai-busy="workspace.isAIGenerating"
          @toggle="workspace.toggleNotePanel"
          @update:markdown="workspace.updateNoteMarkdown"
          @add-images="workspace.addNoteImages"
          @move-image="workspace.moveNoteImage"
          @remove-image="workspace.removeNoteImage"
          @delete-design-card="workspace.deleteDesignCardFromNote"
          @insert-design-card="workspace.insertDesignCardReferenceIntoNote"
          @open-design-card="workspace.openDesignCardReviewRoom"
          @ai-generate="workspace.generateCodeFromNoteSelection"
          @ai-design="workspace.generateDesignFromNoteSelection"
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
      :disabled="workspace.isAIGenerating || workspace.isRunning"
      @close="workspace.closeCodeAIOptimizeContextMenu"
      @optimize="workspace.openCodeAIOptimizeDialog"
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
