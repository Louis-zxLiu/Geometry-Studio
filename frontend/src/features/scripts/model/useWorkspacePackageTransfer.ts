import { ref, type Ref } from "vue";
import type { WorkspaceInfoLike, WorkspaceSnapshotLike } from "./scriptWorkspaceTypes";
import { getErrorMessage } from "../../../lib/errors";

type WorkspacePackageRepository = {
  exportWorkspacePackage?: (workspaceNames: string[]) => Promise<{ path?: string; workspaces?: string[] }>;
  importWorkspacePackage?: () => Promise<{
    cancelled?: boolean;
    importedWorkspaces?: string[];
    workspace?: WorkspaceSnapshotLike;
  }>;
};

type WorkspacePackageTransferOptions = {
  applyWorkspaceSnapshot: (
    snapshot?: WorkspaceSnapshotLike,
    options?: { preserveDirtyCurrent?: boolean; preservePreviousOnEmptySnapshot?: boolean },
  ) => void;
  currentWorkspace: Ref<string>;
  onError: (message: string) => void;
  repository: WorkspacePackageRepository;
  workspaces: Ref<WorkspaceInfoLike[]>;
};

type WorkspacePackageAction = "" | "import" | "export";

export function useWorkspacePackageTransfer(options: WorkspacePackageTransferOptions) {
  const isExportMode = ref(false);
  const pendingAction = ref<WorkspacePackageAction>("");
  const selectedWorkspaceNames = ref<string[]>([]);

  function beginExportMode() {
    if (pendingAction.value !== "") {
      return;
    }

    isExportMode.value = true;
    selectedWorkspaceNames.value = options.currentWorkspace.value
      ? [options.currentWorkspace.value]
      : [];
  }

  function cancelExportMode() {
    if (pendingAction.value !== "") {
      return;
    }

    isExportMode.value = false;
    selectedWorkspaceNames.value = [];
  }

  function toggleWorkspaceSelection(name?: string) {
    if (!isExportMode.value || pendingAction.value !== "" || !name) {
      return;
    }

    if (selectedWorkspaceNames.value.includes(name)) {
      selectedWorkspaceNames.value = selectedWorkspaceNames.value.filter((item) => item !== name);
      return;
    }

    selectedWorkspaceNames.value = [...selectedWorkspaceNames.value, name];
  }

  async function exportSelectedWorkspaces() {
    if (!isExportMode.value || pendingAction.value !== "") {
      return;
    }

    const available = new Set(
      options.workspaces.value
        .map((workspace) => workspace.name ?? "")
        .filter((name) => name !== ""),
    );
    const workspaceNames = selectedWorkspaceNames.value.filter((name) => available.has(name));
    if (workspaceNames.length === 0) {
      return;
    }

    pendingAction.value = "export";
    try {
      await options.repository.exportWorkspacePackage?.(workspaceNames);
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      pendingAction.value = "";
      isExportMode.value = false;
      selectedWorkspaceNames.value = [];
    }
  }

  async function importWorkspacePackage() {
    if (pendingAction.value !== "") {
      return;
    }

    pendingAction.value = "import";
    try {
      const result = await options.repository.importWorkspacePackage?.();
      if (result?.cancelled) {
        return;
      }
      if (result?.workspace) {
        options.applyWorkspaceSnapshot(result.workspace, { preserveDirtyCurrent: false });
      }
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      pendingAction.value = "";
      isExportMode.value = false;
      selectedWorkspaceNames.value = [];
    }
  }

  return {
    beginExportMode,
    cancelExportMode,
    exportSelectedWorkspaces,
    importWorkspacePackage,
    isExportMode,
    pendingAction,
    selectedWorkspaceNames,
    toggleWorkspaceSelection,
  };
}
