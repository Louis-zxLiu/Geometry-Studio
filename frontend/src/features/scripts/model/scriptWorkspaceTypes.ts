export type WorkspaceInfoLike = {
  name?: string;
  sceneCount?: number;
  [key: string]: unknown;
};

export type ScriptDocumentLike = {
  code?: unknown;
  filename?: string;
};

export type WorkspaceSnapshotLike = {
  currentFile?: string;
  currentWorkspace?: string;
  document?: ScriptDocumentLike;
  scripts?: string[];
  workspaces?: WorkspaceInfoLike[];
};

export type ScriptWorkspaceRepository = {
  createScript: (filename: string) => Promise<ScriptDocumentLike>;
  createWorkspace: (name: string) => Promise<WorkspaceSnapshotLike>;
  deleteScript: (filename: string) => Promise<WorkspaceSnapshotLike>;
  deleteWorkspace: (name: string) => Promise<WorkspaceSnapshotLike>;
  exportWorkspacePackage?: (workspaceNames: string[]) => Promise<{ path?: string; workspaces?: string[] }>;
  getScriptContent: (filename: string) => Promise<ScriptDocumentLike>;
  importWorkspacePackage?: () => Promise<{
    cancelled?: boolean;
    importedWorkspaces?: string[];
    workspace?: WorkspaceSnapshotLike;
  }>;
  refreshWorkspace: (preferredFile?: string) => Promise<WorkspaceSnapshotLike>;
  reorderScripts: (scripts: string[], currentFile: string) => Promise<WorkspaceSnapshotLike>;
  renameScript: (oldFilename: string, nextFilename: string) => Promise<WorkspaceSnapshotLike>;
  renameWorkspace: (oldName: string, newName: string) => Promise<WorkspaceSnapshotLike>;
  saveAndRun: (filename: string, code: string) => Promise<unknown>;
  saveScript: (filename: string, code: string) => Promise<unknown>;
  switchWorkspace: (name: string) => Promise<WorkspaceSnapshotLike>;
};
