import type { Ref } from "vue";
import type { WorkspaceSnapshotLike } from "./scriptWorkspaceTypes";
import {
  getErrorMessage,
  withTimeout,
  type ErrorHandler,
  type WorkspacePhase,
} from "./scriptWorkspaceUtils";

type WorkspaceActionsRepository = {
  createWorkspace: (name: string) => Promise<WorkspaceSnapshotLike>;
  deleteWorkspace: (name: string) => Promise<WorkspaceSnapshotLike>;
  renameWorkspace: (oldName: string, newName: string) => Promise<WorkspaceSnapshotLike>;
  switchWorkspace: (name: string) => Promise<WorkspaceSnapshotLike>;
};

type WorkspaceActionsOptions = {
  applyWorkspaceSnapshot: (
    snapshot?: WorkspaceSnapshotLike,
    options?: { preserveDirtyCurrent?: boolean; preservePreviousOnEmptySnapshot?: boolean },
  ) => void;
  currentWorkspace: Ref<string>;
  onError: ErrorHandler;
  repository: WorkspaceActionsRepository;
  saveCurrentScript: () => Promise<void>;
  workspacePhase: Ref<WorkspacePhase>;
};

export function useWorkspaceActions(options: WorkspaceActionsOptions) {
  async function switchWorkspace(name: string) {
    const targetName = name.trim();
    if (
      !targetName ||
      targetName === options.currentWorkspace.value ||
      options.workspacePhase.value !== "idle"
    ) {
      return;
    }

    options.workspacePhase.value = "syncing";

    try {
      await options.saveCurrentScript();
      const snapshot = await withTimeout(
        options.repository.switchWorkspace(targetName),
        "切换工作区超时",
      );
      options.applyWorkspaceSnapshot(snapshot, { preserveDirtyCurrent: false });
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      options.workspacePhase.value = "idle";
    }
  }

  async function createWorkspace(name: string) {
    const targetName = name.trim();
    if (!targetName || options.workspacePhase.value !== "idle") {
      return;
    }

    options.workspacePhase.value = "creating";

    try {
      await options.saveCurrentScript();
      const snapshot = await withTimeout(
        options.repository.createWorkspace(targetName),
        "创建工作区超时",
      );
      options.applyWorkspaceSnapshot(snapshot, { preserveDirtyCurrent: false });
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      options.workspacePhase.value = "idle";
    }
  }

  async function renameWorkspace(oldName: string, newName: string) {
    const targetName = newName.trim();
    if (!oldName || !targetName || options.workspacePhase.value !== "idle") {
      return;
    }

    options.workspacePhase.value = "renaming";

    try {
      await options.saveCurrentScript();
      const snapshot = await withTimeout(
        options.repository.renameWorkspace(oldName, targetName),
        "重命名工作区超时",
      );
      options.applyWorkspaceSnapshot(snapshot, { preserveDirtyCurrent: false });
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      options.workspacePhase.value = "idle";
    }
  }

  async function deleteWorkspace(name: string) {
    if (!name || options.workspacePhase.value !== "idle") {
      return;
    }

    options.workspacePhase.value = "deleting";

    try {
      const snapshot = await withTimeout(
        options.repository.deleteWorkspace(name),
        "删除工作区超时",
      );
      options.applyWorkspaceSnapshot(snapshot, { preserveDirtyCurrent: false });
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      options.workspacePhase.value = "idle";
    }
  }

  return {
    createWorkspace,
    deleteWorkspace,
    renameWorkspace,
    switchWorkspace,
  };
}
