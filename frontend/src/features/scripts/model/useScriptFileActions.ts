import { ref, type Ref } from "vue";
import type { ScriptDocumentLike, WorkspaceSnapshotLike } from "./scriptWorkspaceTypes";
import {
  asString,
  createVisualDelayMs,
  getDeletingDuration,
  getErrorMessage,
  getTypingDuration,
  wait,
  withTimeout,
  type ErrorHandler,
  type WorkspacePhase,
} from "./scriptWorkspaceUtils";

type ScriptFileActionsRepository = {
  createScript: (filename: string) => Promise<ScriptDocumentLike>;
  deleteScript: (filename: string) => Promise<WorkspaceSnapshotLike>;
  getScriptContent: (filename: string) => Promise<ScriptDocumentLike>;
  reorderScripts: (scripts: string[], currentFile: string) => Promise<WorkspaceSnapshotLike>;
  renameScript: (oldFilename: string, nextFilename: string) => Promise<WorkspaceSnapshotLike>;
  saveAndRun: (filename: string, code: string) => Promise<unknown>;
  saveScript: (filename: string, code: string) => Promise<unknown>;
};

type ScriptSelectionStorage = {
  load: () => string;
};

type ScriptFileActionsOptions = {
  applyWorkspaceSnapshot: (
    snapshot?: WorkspaceSnapshotLike,
    options?: { preserveDirtyCurrent?: boolean; preservePreviousOnEmptySnapshot?: boolean },
  ) => void;
  codeContent: Ref<string>;
  currentFile: Ref<string>;
  isRunning: Ref<boolean>;
  lastLoadedCode: Ref<string>;
  onError: ErrorHandler;
  repository: ScriptFileActionsRepository;
  selectionStorage: ScriptSelectionStorage;
  syncWorkspace: (
    preferredFile?: string,
    options?: { preserveDirtyCurrent?: boolean },
  ) => Promise<WorkspaceSnapshotLike | undefined>;
  workspacePhase: Ref<WorkspacePhase>;
};

export function useScriptFileActions(options: ScriptFileActionsOptions) {
  const isCreateDialogOpen = ref(false);
  const typingScriptName = ref("");
  const deletingScriptName = ref("");

  async function selectScript(filename: string) {
    if (filename === options.currentFile.value) {
      return;
    }

    try {
      await saveCurrentScript();
      const document = await options.repository.getScriptContent(filename);
      options.currentFile.value = document.filename ?? filename;
      options.codeContent.value = asString(document.code);
      options.lastLoadedCode.value = options.codeContent.value;
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  async function createScript(filename: string) {
    const nextFilename = filename.trim();
    if (!nextFilename || options.workspacePhase.value !== "idle") {
      return;
    }

    isCreateDialogOpen.value = false;
    options.workspacePhase.value = "creating";

    try {
      const document = await withTimeout(
        options.repository.createScript(nextFilename),
        "创建文件超时",
      );
      await wait(createVisualDelayMs);
      const snapshot = await options.syncWorkspace(document.filename ?? nextFilename);
      const createdName = document.filename ?? nextFilename;
      typingScriptName.value = createdName;
      window.setTimeout(() => {
        if (typingScriptName.value === createdName) {
          typingScriptName.value = "";
        }
      }, getTypingDuration(createdName));
      options.currentFile.value = createdName;
      options.codeContent.value = asString(document.code);
      options.lastLoadedCode.value = options.codeContent.value;
      if (snapshot?.currentFile) {
        options.currentFile.value = snapshot.currentFile;
        options.codeContent.value = asString(snapshot.document?.code);
        options.lastLoadedCode.value = options.codeContent.value;
      }
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      options.workspacePhase.value = "idle";
    }
  }

  function openCreateDialog() {
    if (options.workspacePhase.value !== "idle") {
      return;
    }

    isCreateDialogOpen.value = true;
  }

  function closeCreateDialog() {
    isCreateDialogOpen.value = false;
  }

  function updateCode(code: string) {
    options.codeContent.value = code;
  }

  async function saveCurrentScript() {
    if (!options.currentFile.value) {
      return;
    }

    await withTimeout(
      options.repository.saveScript(options.currentFile.value, options.codeContent.value),
      "保存文件超时",
    );
    options.lastLoadedCode.value = options.codeContent.value;
  }

  async function restoreLastSelection() {
    const savedFilename = options.selectionStorage.load();
    if (!savedFilename || savedFilename === options.currentFile.value) {
      return;
    }

    try {
      await options.syncWorkspace(savedFilename, { preserveDirtyCurrent: false });
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  async function renameScript(oldFilename: string, nextFilename: string) {
    const targetName = nextFilename.trim();
    if (!oldFilename || !targetName || options.workspacePhase.value !== "idle") {
      return;
    }

    options.workspacePhase.value = "renaming";

    try {
      if (oldFilename === options.currentFile.value) {
        await saveCurrentScript();
      }

      const snapshot = await withTimeout(
        options.repository.renameScript(oldFilename, targetName),
        "重命名文件超时",
      );
      options.applyWorkspaceSnapshot(snapshot);
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      options.workspacePhase.value = "idle";
    }
  }

  async function reorderScripts(scripts: string[]) {
    if (scripts.length === 0 || options.workspacePhase.value !== "idle") {
      return;
    }

    try {
      const snapshot = await withTimeout(
        options.repository.reorderScripts(scripts, options.currentFile.value),
        "调整文件顺序超时",
      );
      options.applyWorkspaceSnapshot(snapshot, { preserveDirtyCurrent: true });
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  async function deleteScript(filename: string) {
    if (!filename || options.workspacePhase.value !== "idle") {
      return;
    }

    options.workspacePhase.value = "deleting";
    deletingScriptName.value = filename;

    try {
      await wait(getDeletingDuration(filename));
      const nextPreferred = options.currentFile.value === filename ? "" : options.currentFile.value;
      const snapshot = await withTimeout(
        options.repository.deleteScript(filename),
        "删除文件超时",
      );
      options.applyWorkspaceSnapshot(snapshot);
      if (!snapshot.currentFile && nextPreferred) {
        await options.syncWorkspace(nextPreferred, { preserveDirtyCurrent: true });
      }
    } catch (error) {
      deletingScriptName.value = "";
      options.onError(getErrorMessage(error));
    } finally {
      window.setTimeout(() => {
        if (deletingScriptName.value === filename) {
          deletingScriptName.value = "";
        }
      }, 60);
      options.workspacePhase.value = "idle";
    }
  }

  async function runCurrentScript() {
    if (!options.currentFile.value || options.isRunning.value) {
      return;
    }

    try {
      await options.repository.saveAndRun(options.currentFile.value, options.codeContent.value);
    } catch (error) {
      options.isRunning.value = false;
      options.onError(getErrorMessage(error));
    }
  }

  return {
    closeCreateDialog,
    createScript,
    deleteScript,
    deletingScriptName,
    isCreateDialogOpen,
    openCreateDialog,
    reorderScripts,
    renameScript,
    restoreLastSelection,
    runCurrentScript,
    saveCurrentScript,
    selectScript,
    typingScriptName,
    updateCode,
  };
}
