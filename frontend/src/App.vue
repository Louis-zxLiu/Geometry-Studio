<script setup lang="ts">
import { proxyRefs } from "vue";
import CreateScriptDialog from "./components/CreateScriptDialog.vue";
import AISettingsDialog from "./components/AISettingsDialog.vue";
import EditorPane from "./components/EditorPane.vue";
import EnvironmentIndicator from "./components/EnvironmentIndicator.vue";
import PackageTransferDialog from "./components/PackageTransferDialog.vue";
import NotePanel from "./components/note/NotePanel.vue";
import RunErrorDialog from "./components/RunErrorDialog.vue";
import RuntimeLoadingScreen from "./components/RuntimeLoadingScreen.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import SidebarPanel from "./components/sidebar/SidebarPanel.vue";
import TopBar from "./components/TopBar.vue";
import { usePlotWorkspace } from "./features/plot/model/usePlotWorkspace";
import { useTheme } from "./composables/useTheme";

const workspace = proxyRefs(usePlotWorkspace());
const theme = proxyRefs(useTheme());
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
      @select="workspace.selectScript"
      @create="workspace.openCreateDialog"
      @rename="workspace.renameScript"
      @delete="workspace.deleteScript"
      @switch-workspace="workspace.switchWorkspace"
      @create-workspace="workspace.createWorkspace"
      @rename-workspace="workspace.renameWorkspace"
      @delete-workspace="workspace.deleteWorkspace"
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
            @packages="workspace.openPackageTransferDialog"
            @stop="workspace.stopCurrentRun"
            @run="workspace.runCurrentScript"
          />

          <EditorPane
            :code="workspace.codeContent"
            :disabled="workspace.isAIGenerating"
            :is-streaming="workspace.isAIGenerating"
            @update:code="workspace.updateCode"
          />

          <EnvironmentIndicator
            :status="workspace.environmentStatus"
            :is-running="workspace.isRunning"
          />
        </section>

        <NotePanel
          :current-file="workspace.currentFile"
          :document="workspace.currentNoteDocument"
          :is-open="workspace.isNotePanelOpen"
          :render-blocks="workspace.noteRenderBlocks"
          :save-state="workspace.noteSaveState"
          :ai-busy="workspace.isAIGenerating"
          @toggle="workspace.toggleNotePanel"
          @update:markdown="workspace.updateNoteMarkdown"
          @add-images="workspace.addNoteImages"
          @remove-image="workspace.removeNoteImage"
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

    <SettingsDialog
      :open="workspace.isSettingsDialogOpen"
      :pending="workspace.isRebuildingRuntime"
      :running="workspace.isRunning"
      :status="workspace.environmentStatus"
      @close="workspace.closeSettings"
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
      @close="workspace.closeRunErrorDialog"
      @copy="workspace.copyRunError"
    />
  </div>
</template>
