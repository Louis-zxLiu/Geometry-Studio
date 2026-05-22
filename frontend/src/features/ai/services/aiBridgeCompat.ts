import type {
  AIGenerationRequest,
  AIGenerationResult,
  AIRepairRequest,
  AIRepairResult,
} from "./aiTypes";

type BridgeAppCompat = {
  GenerateCodeFromSelection?: (
    request: AIGenerationRequest,
  ) => Promise<AIGenerationResult>;
  RepairCodeFromRunError?: (
    request: AIRepairRequest,
  ) => Promise<AIRepairResult>;
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

function getBridgeApp(): BridgeAppCompat {
  return ((window as typeof window & {
    go?: { bridge?: { App?: BridgeAppCompat } };
  }).go?.bridge?.App ?? {}) as BridgeAppCompat;
}
