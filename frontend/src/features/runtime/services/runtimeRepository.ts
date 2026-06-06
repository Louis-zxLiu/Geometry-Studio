import * as bridge from "./runtimeBridgeCompat";

export function createRuntimeRepository() {
  return {
    getEnvironmentStatus: bridge.getEnvironmentStatus,
    initializeApp: bridge.initializeApp,
    rebuildRuntime: bridge.rebuildRuntime,
    stopCurrentRun: bridge.stopCurrentRun,
  };
}
