import { computed, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { createScriptRepository } from "../services/scriptRepository";
import { createScriptSelectionStorage } from "../services/scriptSelectionStorage";
import type { WorkspaceInfoLike, WorkspaceSnapshotLike } from "../services/scriptBridgeCompat";

type ErrorHandler = (message: string) => void;
type WorkspacePhase = "idle" | "syncing" | "creating" | "renaming" | "deleting";

const syncIntervalMs = 2000;
const createVisualDelayMs = 260;

export function useScriptWorkspaceMachine(onError: ErrorHandler, isRunning: Ref<boolean>) {
  const repository = createScriptRepository();
  const selectionStorage = createScriptSelectionStorage();
  const scripts = ref<string[]>([]);
  const workspaces = ref<WorkspaceInfoLike[]>([]);
  const currentWorkspace = ref("");
  const currentFile = ref("");
  const codeContent = ref("");
  const lastLoadedCode = ref("");
  const workspacePhase = ref<WorkspacePhase>("idle");
  const isCreateDialogOpen = ref(false);
  const typingScriptName = ref("");
  const deletingScriptName = ref("");

  let syncTimer = 0;

  const isCreatingScript = computedPhase("creating", workspacePhase);
  const isRenamingScript = computedPhase("renaming", workspacePhase);
  const isDeletingScript = computedPhase("deleting", workspacePhase);

  function applyWorkspaceSnapshot(
    snapshot?: WorkspaceSnapshotLike,
    options?: { preserveDirtyCurrent?: boolean },
  ) {
    const nextCurrentFile = snapshot?.currentFile ?? snapshot?.document?.filename ?? "";
    const nextCode = asString(snapshot?.document?.code);
    const preserveCurrentCode =
      options?.preserveDirtyCurrent &&
      nextCurrentFile !== "" &&
      nextCurrentFile === currentFile.value &&
      codeContent.value !== lastLoadedCode.value;

    scripts.value = snapshot?.scripts ?? [];
    workspaces.value = snapshot?.workspaces ?? [];
    currentWorkspace.value = snapshot?.currentWorkspace ?? currentWorkspace.value;
    currentFile.value = nextCurrentFile;
    if (!preserveCurrentCode) {
      codeContent.value = nextCode;
      lastLoadedCode.value = nextCode;
    }
  }

  async function selectScript(filename: string) {
    if (filename === currentFile.value) {
      return;
    }

    try {
      await saveCurrentScript();
      const document = await repository.getScriptContent(filename);
      currentFile.value = document.filename ?? filename;
      codeContent.value = asString(document.code);
      lastLoadedCode.value = codeContent.value;
    } catch (error) {
      onError(getErrorMessage(error));
    }
  }

  async function createScript(filename: string) {
    const nextFilename = filename.trim();
    if (!nextFilename || workspacePhase.value !== "idle") {
      return;
    }

    isCreateDialogOpen.value = false;
    workspacePhase.value = "creating";

    try {
      const document = await withTimeout(repository.createScript(nextFilename), "创建文件超时");
      await wait(createVisualDelayMs);
      const snapshot = await syncWorkspace(document.filename ?? nextFilename);
      const createdName = document.filename ?? nextFilename;
      typingScriptName.value = createdName;
      window.setTimeout(() => {
        if (typingScriptName.value === createdName) {
          typingScriptName.value = "";
        }
      }, getTypingDuration(createdName));
      currentFile.value = createdName;
      codeContent.value = asString(document.code);
      lastLoadedCode.value = codeContent.value;
      if (snapshot?.currentFile) {
        currentFile.value = snapshot.currentFile;
        codeContent.value = asString(snapshot.document?.code);
        lastLoadedCode.value = codeContent.value;
      }
    } catch (error) {
      onError(getErrorMessage(error));
    } finally {
      workspacePhase.value = "idle";
    }
  }

  function openCreateDialog() {
    if (workspacePhase.value !== "idle") {
      return;
    }

    isCreateDialogOpen.value = true;
  }

  function closeCreateDialog() {
    isCreateDialogOpen.value = false;
  }

  function updateCode(code: string) {
    codeContent.value = code;
  }

  async function saveCurrentScript() {
    if (!currentFile.value) {
      return;
    }

    await withTimeout(repository.saveScript(currentFile.value, codeContent.value), "保存文件超时");
    lastLoadedCode.value = codeContent.value;
  }

  async function syncWorkspace(
    preferredFile = currentFile.value,
    options?: { preserveDirtyCurrent?: boolean },
  ) {
    const previousPhase = workspacePhase.value;
    if (previousPhase === "idle") {
      workspacePhase.value = "syncing";
    }

    try {
      const snapshot = await withTimeout(
        repository.refreshWorkspace(preferredFile),
        "同步文件列表超时",
      );
      applyWorkspaceSnapshot(snapshot, {
        preserveDirtyCurrent: options?.preserveDirtyCurrent ?? true,
      });
      return snapshot;
    } finally {
      if (workspacePhase.value === "syncing") {
        workspacePhase.value = previousPhase === "idle" ? "idle" : previousPhase;
      }
    }
  }

  async function restoreLastSelection() {
    const savedFilename = selectionStorage.load();
    if (!savedFilename || savedFilename === currentFile.value) {
      return;
    }

    try {
      await syncWorkspace(savedFilename, { preserveDirtyCurrent: false });
    } catch (error) {
      onError(getErrorMessage(error));
    }
  }

  async function renameScript(oldFilename: string, nextFilename: string) {
    const targetName = nextFilename.trim();
    if (!oldFilename || !targetName || workspacePhase.value !== "idle") {
      return;
    }

    workspacePhase.value = "renaming";

    try {
      if (oldFilename === currentFile.value) {
        await saveCurrentScript();
      }

      const snapshot = await withTimeout(
        repository.renameScript(oldFilename, targetName),
        "重命名文件超时",
      );
      applyWorkspaceSnapshot(snapshot);
    } catch (error) {
      onError(getErrorMessage(error));
    } finally {
      workspacePhase.value = "idle";
    }
  }

  async function deleteScript(filename: string) {
    if (!filename || workspacePhase.value !== "idle") {
      return;
    }

    workspacePhase.value = "deleting";
    deletingScriptName.value = filename;

    try {
      await wait(getDeletingDuration(filename));
      const nextPreferred = currentFile.value === filename ? "" : currentFile.value;
      const snapshot = await withTimeout(repository.deleteScript(filename), "删除文件超时");
      applyWorkspaceSnapshot(snapshot);
      if (!snapshot.currentFile && nextPreferred) {
        await syncWorkspace(nextPreferred, { preserveDirtyCurrent: true });
      }
    } catch (error) {
      deletingScriptName.value = "";
      onError(getErrorMessage(error));
    } finally {
      window.setTimeout(() => {
        if (deletingScriptName.value === filename) {
          deletingScriptName.value = "";
        }
      }, 60);
      workspacePhase.value = "idle";
    }
  }

  async function switchWorkspace(name: string) {
    const targetName = name.trim();
    if (!targetName || targetName === currentWorkspace.value || workspacePhase.value !== "idle") {
      return;
    }

    workspacePhase.value = "syncing";

    try {
      await saveCurrentScript();
      const snapshot = await withTimeout(repository.switchWorkspace(targetName), "切换工作区超时");
      applyWorkspaceSnapshot(snapshot, { preserveDirtyCurrent: false });
    } catch (error) {
      onError(getErrorMessage(error));
    } finally {
      workspacePhase.value = "idle";
    }
  }

  async function createWorkspace(name: string) {
    const targetName = name.trim();
    if (!targetName || workspacePhase.value !== "idle") {
      return;
    }

    workspacePhase.value = "creating";

    try {
      await saveCurrentScript();
      const snapshot = await withTimeout(repository.createWorkspace(targetName), "创建工作区超时");
      applyWorkspaceSnapshot(snapshot, { preserveDirtyCurrent: false });
    } catch (error) {
      onError(getErrorMessage(error));
    } finally {
      workspacePhase.value = "idle";
    }
  }

  async function renameWorkspace(oldName: string, newName: string) {
    const targetName = newName.trim();
    if (!oldName || !targetName || workspacePhase.value !== "idle") {
      return;
    }

    workspacePhase.value = "renaming";

    try {
      await saveCurrentScript();
      const snapshot = await withTimeout(
        repository.renameWorkspace(oldName, targetName),
        "重命名工作区超时",
      );
      applyWorkspaceSnapshot(snapshot, { preserveDirtyCurrent: false });
    } catch (error) {
      onError(getErrorMessage(error));
    } finally {
      workspacePhase.value = "idle";
    }
  }

  async function deleteWorkspace(name: string) {
    if (!name || workspacePhase.value !== "idle") {
      return;
    }

    workspacePhase.value = "deleting";

    try {
      const snapshot = await withTimeout(repository.deleteWorkspace(name), "删除工作区超时");
      applyWorkspaceSnapshot(snapshot, { preserveDirtyCurrent: false });
    } catch (error) {
      onError(getErrorMessage(error));
    } finally {
      workspacePhase.value = "idle";
    }
  }

  async function runCurrentScript() {
    if (!currentFile.value || isRunning.value) {
      return;
    }

    try {
      await repository.saveAndRun(currentFile.value, codeContent.value);
    } catch (error) {
      isRunning.value = false;
      onError(getErrorMessage(error));
    }
  }

  function startAutoSync() {
    if (syncTimer) {
      return;
    }

    syncTimer = window.setInterval(() => {
      if (workspacePhase.value !== "idle") {
        return;
      }

      void syncWorkspace(currentFile.value, { preserveDirtyCurrent: true });
    }, syncIntervalMs);
  }

  function stopAutoSync() {
    if (!syncTimer) {
      return;
    }

    window.clearInterval(syncTimer);
    syncTimer = 0;
  }

  onMounted(startAutoSync);
  onUnmounted(stopAutoSync);

  watch(currentFile, (filename) => {
    selectionStorage.save(filename);
  });

  return {
    applyWorkspaceSnapshot,
    closeCreateDialog,
    codeContent,
    createWorkspace,
    createScript,
    currentFile,
    currentWorkspace,
    deleteScript,
    deleteWorkspace,
    deletingScriptName,
    isCreateDialogOpen,
    isCreatingScript,
    isDeletingScript,
    isRenamingScript,
    openCreateDialog,
    renameScript,
    renameWorkspace,
    restoreLastSelection,
    runCurrentScript,
    saveCurrentScript,
    scripts,
    selectScript,
    switchWorkspace,
    syncWorkspace,
    typingScriptName,
    updateCode,
    workspaces,
    workspacePhase,
  };
}

function computedPhase(target: WorkspacePhase, workspacePhase: Ref<WorkspacePhase>) {
  return computed(() => workspacePhase.value === target);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : String(value ?? "");
}

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

function wait(timeoutMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}

function getTypingDuration(filename: string) {
  return Math.max(600, filename.length * 85);
}

function getDeletingDuration(filename: string) {
  return Math.max(620, filename.length * 62);
}
