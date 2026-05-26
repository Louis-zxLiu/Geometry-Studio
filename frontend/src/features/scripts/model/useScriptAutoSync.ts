import { onMounted, onUnmounted, type Ref } from "vue";
import type { WorkspacePhase } from "./scriptWorkspaceUtils";

type ScriptAutoSyncRepository = {
  saveScript: (filename: string, code: string) => Promise<unknown>;
};

type ScriptAutoSyncOptions = {
  codeContent: Ref<string>;
  currentFile: Ref<string>;
  lastLoadedCode: Ref<string>;
  onAutoSaveError: (error: unknown) => void;
  repository: ScriptAutoSyncRepository;
  syncWorkspace: (preferredFile?: string, options?: { preserveDirtyCurrent?: boolean }) => Promise<unknown>;
  workspacePhase: Ref<WorkspacePhase>;
};

const syncIntervalMs = 2000;
const codeAutoSaveIntervalMs = 500;

export function useScriptAutoSync(options: ScriptAutoSyncOptions) {
  let syncTimer = 0;
  let codeAutoSaveTimer = 0;

  function startAutoSync() {
    if (syncTimer) {
      return;
    }

    codeAutoSaveTimer = window.setInterval(() => {
      if (options.workspacePhase.value !== "idle") {
        return;
      }

      if (options.currentFile.value && options.codeContent.value !== options.lastLoadedCode.value) {
        options.repository.saveScript(options.currentFile.value, options.codeContent.value)
          .then(() => { options.lastLoadedCode.value = options.codeContent.value; })
          .catch(options.onAutoSaveError);
      }
    }, codeAutoSaveIntervalMs);

    syncTimer = window.setInterval(() => {
      if (options.workspacePhase.value !== "idle") {
        return;
      }

      void options.syncWorkspace(options.currentFile.value, { preserveDirtyCurrent: true });
    }, syncIntervalMs);
  }

  function stopAutoSync() {
    if (codeAutoSaveTimer) {
      window.clearInterval(codeAutoSaveTimer);
      codeAutoSaveTimer = 0;
    }

    if (syncTimer) {
      window.clearInterval(syncTimer);
      syncTimer = 0;
    }
  }

  onMounted(startAutoSync);
  onUnmounted(stopAutoSync);

  return {
    startAutoSync,
    stopAutoSync,
  };
}
