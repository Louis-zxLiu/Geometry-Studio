import {
  GetEnvironmentStatus,
  InitializeApp,
  RebuildRuntime,
  StopCurrentRun,
} from "../../../../wailsjs/go/bridge/App";

export type RuntimeCheckItemLike = {
  key?: string;
  label?: string;
  relativePath?: string;
  category?: string;
  status?: string;
  message?: string;
  exists?: boolean;
};

export type RuntimeStatusLike = {
  ready?: boolean;
  code?: string;
  severity?: string;
  runtimeDir?: string;
  summary?: unknown;
  recommendedAction?: unknown;
  checkedAt?: string;
  items?: RuntimeCheckItemLike[];
  missing?: string[];
  canRebuild?: boolean;
  runtimeArchivePath?: string;
  runtimeArchiveExists?: boolean;
};

export type RunControlResultLike = {
  handled?: boolean;
  message?: string;
};

type RuntimeBridgeAppCompat = {
  RebuildRuntime?: () => Promise<RuntimeStatusLike>;
  StopCurrentRun?: () => Promise<RunControlResultLike>;
};

export async function getEnvironmentStatus() {
  return GetEnvironmentStatus();
}

export async function initializeApp() {
  return InitializeApp();
}

export async function rebuildRuntime(): Promise<RuntimeStatusLike> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.RebuildRuntime === "function") {
    return bridgeApp.RebuildRuntime();
  }

  return RebuildRuntime();
}

export async function stopCurrentRun(): Promise<RunControlResultLike> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.StopCurrentRun === "function") {
    return bridgeApp.StopCurrentRun();
  }

  return StopCurrentRun();
}

function getBridgeApp(): RuntimeBridgeAppCompat {
  return ((window as typeof window & {
    go?: { bridge?: { App?: RuntimeBridgeAppCompat } };
  }).go?.bridge?.App ?? {}) as RuntimeBridgeAppCompat;
}
