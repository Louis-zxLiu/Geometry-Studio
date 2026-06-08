import type { CodeAIVersion, CreateCodeAIVersionRequest } from "../../ai/services/aiTypes";

type BridgeAppCompat = {
  ListCodeAIVersions?: (sceneName: string) => Promise<CodeAIVersion[]>;
  CreateCodeAIVersion?: (
    request: CreateCodeAIVersionRequest,
  ) => Promise<CodeAIVersion>;
  DeleteCodeAIVersion?: (
    sceneName: string,
    id: string,
  ) => Promise<CodeAIVersion[]>;
};

export async function listCodeAIVersions(sceneName: string): Promise<CodeAIVersion[]> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.ListCodeAIVersions === "function") {
    return bridgeApp.ListCodeAIVersions(sceneName);
  }

  return [];
}

export async function createCodeAIVersion(
  request: CreateCodeAIVersionRequest,
): Promise<CodeAIVersion> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.CreateCodeAIVersion === "function") {
    return bridgeApp.CreateCodeAIVersion(request);
  }

  throw new Error("当前运行中的后端版本还不支持 AI 优化历史，请重启应用后再试");
}

export async function deleteCodeAIVersion(
  sceneName: string,
  id: string,
): Promise<CodeAIVersion[]> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.DeleteCodeAIVersion === "function") {
    return bridgeApp.DeleteCodeAIVersion(sceneName, id);
  }

  return [];
}

function getBridgeApp(): BridgeAppCompat {
  return ((window as typeof window & {
    go?: { bridge?: { App?: BridgeAppCompat } };
  }).go?.bridge?.App ?? {}) as BridgeAppCompat;
}
