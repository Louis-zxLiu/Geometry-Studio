import type {
  AIGenerationRequest,
  AIGenerationResult,
  AIOptimizeRequest,
  AIOptimizeResult,
  AIRepairRequest,
  AIRepairResult,
  CodeAIVersion,
  CreateCodeAIVersionRequest,
} from "./aiTypes";

type BridgeAppCompat = {
  GenerateCodeFromSelection?: (
    request: AIGenerationRequest,
  ) => Promise<AIGenerationResult>;
  RepairCodeFromRunError?: (
    request: AIRepairRequest,
  ) => Promise<AIRepairResult>;
  OptimizeCode?: (request: AIOptimizeRequest) => Promise<AIOptimizeResult>;
  ListCodeAIVersions?: (sceneName: string) => Promise<CodeAIVersion[]>;
  CreateCodeAIVersion?: (
    request: CreateCodeAIVersionRequest,
  ) => Promise<CodeAIVersion>;
  DeleteCodeAIVersion?: (
    sceneName: string,
    id: string,
  ) => Promise<CodeAIVersion[]>;
};

export async function generateCodeFromSelection(
  request: AIGenerationRequest,
): Promise<AIGenerationResult> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.GenerateCodeFromSelection === "function") {
    return bridgeApp.GenerateCodeFromSelection(request);
  }

  throw new Error("当前运行中的后端版本还不支持 AI 生成功能，请重启应用后再试");
}

export async function repairCodeFromRunError(
  request: AIRepairRequest,
): Promise<AIRepairResult> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.RepairCodeFromRunError === "function") {
    return bridgeApp.RepairCodeFromRunError(request);
  }

  throw new Error("当前运行中的后端版本还不支持 AI 修复，请重启应用后再试");
}

export async function optimizeCode(
  request: AIOptimizeRequest,
): Promise<AIOptimizeResult> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.OptimizeCode === "function") {
    return bridgeApp.OptimizeCode(request);
  }

  throw new Error("当前运行中的后端版本还不支持 AI 优化，请重启应用后再试");
}

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
