export type WorkspaceInfoLike = {
  name?: string;
  sceneCount?: number;
  [key: string]: unknown;
};

export type NoteImageLike = {
  name?: string;
  alt?: string;
  dataUrl?: string;
  relativePath?: string;
};

export type NoteDocumentLike = {
  markdown?: string;
  images?: NoteImageLike[];
};

export type ScriptDocumentLike = {
  code?: string;
  filename?: string;
  noteImages?: NoteImageLike[];
  noteMarkdown?: string;
};

export type WorkspaceSnapshotLike = {
  currentFile?: string;
  currentWorkspace?: string;
  document?: ScriptDocumentLike;
  scripts?: string[];
  workspaces?: WorkspaceInfoLike[];
};

export type NoteImageInputLike = {
  name: string;
  alt: string;
  dataUrl: string;
};

export type ImportSceneResultLike = {
  cancelled?: boolean;
  workspace?: WorkspaceSnapshotLike;
};

export type ImportWorkspaceResultLike = {
  cancelled?: boolean;
  importedWorkspaces?: string[];
  workspace?: WorkspaceSnapshotLike;
};

type BridgeAppCompat = {
  AddScriptNoteImages?: (filename: string, images: NoteImageInputLike[]) => Promise<NoteDocumentLike>;
  BootstrapWorkspace?: () => Promise<WorkspaceSnapshotLike>;
  CreateScript?: (filename: string) => Promise<ScriptDocumentLike>;
  CreateWorkspace?: (name: string) => Promise<WorkspaceSnapshotLike>;
  DeleteScript?: (filename: string) => Promise<WorkspaceSnapshotLike>;
  DeleteWorkspace?: (name: string) => Promise<WorkspaceSnapshotLike>;
  ExportScenePackage?: (sceneName: string) => Promise<{ path?: string; sceneName?: string }>;
  ExportWorkspacePackage?: (workspaceNames: string[]) => Promise<{ path?: string; workspaces?: string[] }>;
  GetScriptContent?: (filename: string) => Promise<ScriptDocumentLike>;
  GetScriptList?: () => Promise<string[]>;
  GetScriptNote?: (filename: string) => Promise<NoteDocumentLike>;
  ImportScenePackage?: () => Promise<ImportSceneResultLike>;
  ImportScenePackageFromPath?: (path: string) => Promise<ImportSceneResultLike>;
  ImportWorkspacePackage?: () => Promise<ImportWorkspaceResultLike>;
  RefreshWorkspace?: (currentFile: string) => Promise<WorkspaceSnapshotLike>;
  ReorderScripts?: (scripts: string[], currentFile: string) => Promise<WorkspaceSnapshotLike>;
  RemoveScriptNoteImage?: (filename: string, relativePath: string) => Promise<NoteDocumentLike>;
  RenameScript?: (oldFilename: string, newFilename: string) => Promise<WorkspaceSnapshotLike>;
  RenameWorkspace?: (oldName: string, newName: string) => Promise<WorkspaceSnapshotLike>;
  SaveAndRun?: (filename: string, code: string) => Promise<void>;
  SaveScript?: (filename: string, code: string) => Promise<void>;
  SaveScriptNote?: (filename: string, markdown: string) => Promise<void>;
  SwitchWorkspace?: (name: string) => Promise<WorkspaceSnapshotLike>;
};

export async function addScriptNoteImages(filename: string, images: NoteImageInputLike[]) {
  return callBridge("AddScriptNoteImages", (app) => app.AddScriptNoteImages?.(filename, images));
}

export async function bootstrapWorkspace() {
  return callBridge("BootstrapWorkspace", (app) => app.BootstrapWorkspace?.());
}

export async function createScript(filename: string) {
  return callBridge("CreateScript", (app) => app.CreateScript?.(filename));
}

export async function createWorkspace(name: string) {
  return callBridge("CreateWorkspace", (app) => app.CreateWorkspace?.(name));
}

export async function deleteScript(filename: string) {
  return callBridge("DeleteScript", (app) => app.DeleteScript?.(filename));
}

export async function deleteWorkspace(name: string) {
  return callBridge("DeleteWorkspace", (app) => app.DeleteWorkspace?.(name));
}

export async function exportScenePackage(sceneName: string) {
  return callBridge("ExportScenePackage", (app) => app.ExportScenePackage?.(sceneName));
}

export async function exportWorkspacePackage(workspaceNames: string[]) {
  return callBridge("ExportWorkspacePackage", (app) => app.ExportWorkspacePackage?.(workspaceNames));
}

export async function getScriptContent(filename: string) {
  return callBridge("GetScriptContent", (app) => app.GetScriptContent?.(filename));
}

export async function getScriptNote(filename: string) {
  return callBridge("GetScriptNote", (app) => app.GetScriptNote?.(filename));
}

export async function importScenePackage() {
  return callBridge("ImportScenePackage", (app) => app.ImportScenePackage?.());
}

export async function importScenePackageFromPath(path: string) {
  return callBridge("ImportScenePackageFromPath", (app) => app.ImportScenePackageFromPath?.(path));
}

export async function importWorkspacePackage() {
  return callBridge("ImportWorkspacePackage", (app) => app.ImportWorkspacePackage?.());
}

export async function refreshWorkspace(currentFile = "") {
  return callBridge("RefreshWorkspace", (app) => app.RefreshWorkspace?.(currentFile));
}

export async function reorderScripts(scripts: string[], currentFile: string) {
  return callBridge("ReorderScripts", (app) => app.ReorderScripts?.(scripts, currentFile));
}

export async function removeScriptNoteImage(filename: string, relativePath: string) {
  return callBridge("RemoveScriptNoteImage", (app) => app.RemoveScriptNoteImage?.(filename, relativePath));
}

export async function renameScript(oldFilename: string, newFilename: string) {
  return callBridge("RenameScript", (app) => app.RenameScript?.(oldFilename, newFilename));
}

export async function renameWorkspace(oldName: string, newName: string) {
  return callBridge("RenameWorkspace", (app) => app.RenameWorkspace?.(oldName, newName));
}

export async function saveAndRun(filename: string, code: string) {
  return callBridge("SaveAndRun", (app) => app.SaveAndRun?.(filename, code));
}

export async function saveScript(filename: string, code: string) {
  return callBridge("SaveScript", (app) => app.SaveScript?.(filename, code));
}

export async function saveScriptNote(filename: string, markdown: string) {
  return callBridge("SaveScriptNote", (app) => app.SaveScriptNote?.(filename, markdown));
}

export async function switchWorkspace(name: string) {
  return callBridge("SwitchWorkspace", (app) => app.SwitchWorkspace?.(name));
}

function callBridge<T>(name: keyof BridgeAppCompat, call: (app: BridgeAppCompat) => Promise<T> | undefined) {
  const result = call(getBridgeApp());
  if (result) {
    return result;
  }

  throw new Error(`当前运行中的后端版本还不支持 ${String(name)}，请重启应用后再试`);
}

function getBridgeApp(): BridgeAppCompat {
  return ((window as typeof window & {
    go?: { bridge?: { App?: BridgeAppCompat } };
  }).go?.bridge?.App ?? {}) as BridgeAppCompat;
}
