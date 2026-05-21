import { ref } from "vue";
import type { WorkspaceSnapshotLike } from "../../scripts/services/scriptBridgeCompat";

type PackageTransferAction = "" | "import" | "export";

type ScriptRepository = {
  exportScenePackage: (filename: string) => Promise<{ path?: string }>;
  importScenePackage: () => Promise<{
    cancelled?: boolean;
    workspace?: WorkspaceSnapshotLike;
  }>;
};

type ScriptWorkspace = {
  applyWorkspaceSnapshot: (snapshot?: WorkspaceSnapshotLike) => void;
  currentFile: { value: string };
  saveCurrentScript: () => Promise<void>;
};

type NoteWorkspace = {
  flushPendingSave: (filename: string) => Promise<void>;
  hydrateFromScriptDocument: (note: { noteMarkdown?: unknown; noteImages?: unknown }) => void;
};

type PackageTransferOptions = {
  noteWorkspace: NoteWorkspace;
  onError: (message: string) => void;
  scriptRepository: ScriptRepository;
  scriptWorkspace: ScriptWorkspace;
};

export function usePackageTransfer(options: PackageTransferOptions) {
  const isPackageTransferDialogOpen = ref(false);
  const packageTransferMessage = ref("");
  const packageTransferPendingAction = ref<PackageTransferAction>("");

  function openPackageTransferDialog() {
    packageTransferMessage.value = "";
    isPackageTransferDialogOpen.value = true;
  }

  function closePackageTransferDialog() {
    if (packageTransferPendingAction.value !== "") {
      return;
    }

    isPackageTransferDialogOpen.value = false;
  }

  async function exportCurrentScenePackage() {
    if (!options.scriptWorkspace.currentFile.value || packageTransferPendingAction.value !== "") {
      return;
    }

    packageTransferPendingAction.value = "export";
    packageTransferMessage.value = "";

    try {
      await options.scriptWorkspace.saveCurrentScript();
      await options.noteWorkspace.flushPendingSave(options.scriptWorkspace.currentFile.value);
      const result = await options.scriptRepository.exportScenePackage(
        options.scriptWorkspace.currentFile.value,
      );
      if (result?.path) {
        packageTransferMessage.value = `已导出到 ${result.path}`;
      }
    } catch (error) {
      const message = getErrorMessage(error);
      packageTransferMessage.value = message;
      options.onError(message);
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
      await options.scriptWorkspace.saveCurrentScript();
      await options.noteWorkspace.flushPendingSave(options.scriptWorkspace.currentFile.value);
      const result = await options.scriptRepository.importScenePackage();
      if (result?.cancelled) {
        return;
      }

      if (result?.workspace) {
        options.scriptWorkspace.applyWorkspaceSnapshot(result.workspace);
        options.noteWorkspace.hydrateFromScriptDocument(result.workspace.document ?? {});
        packageTransferMessage.value = `已导入场景 ${result.workspace.currentFile ?? ""}`.trim();
      }
    } catch (error) {
      const message = getErrorMessage(error);
      packageTransferMessage.value = message;
      options.onError(message);
    } finally {
      packageTransferPendingAction.value = "";
    }
  }

  return {
    closePackageTransferDialog,
    exportCurrentScenePackage,
    importScenePackage,
    isPackageTransferDialogOpen,
    openPackageTransferDialog,
    packageTransferMessage,
    packageTransferPendingAction,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
