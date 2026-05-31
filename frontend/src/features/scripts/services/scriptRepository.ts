import {
  createScript,
  createWorkspace,
  deleteScript,
  deleteWorkspace,
  exportScenePackage,
  getScriptContent,
  importScenePackage,
  importScenePackageFromPath,
  refreshWorkspace,
  reorderScripts,
  renameScript,
  renameWorkspace,
  saveAndRun,
  saveScript,
  switchWorkspace,
} from "./scriptBridgeCompat";

export function createScriptRepository() {
  return {
    createScript,
    createWorkspace,
    deleteScript,
    deleteWorkspace,
    exportScenePackage,
    getScriptContent,
    importScenePackage,
    importScenePackageFromPath,
    refreshWorkspace,
    reorderScripts,
    renameScript,
    renameWorkspace,
    saveAndRun,
    saveScript,
    switchWorkspace,
  };
}
