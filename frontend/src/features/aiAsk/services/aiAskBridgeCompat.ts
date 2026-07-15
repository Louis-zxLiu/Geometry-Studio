import type { AIAskRequest, AIAskResult } from "../../ai/services/aiTypes";

type BridgeAppCompat = {
  AskAI?: (request: AIAskRequest) => Promise<AIAskResult>;
};

export async function askAI(request: AIAskRequest): Promise<AIAskResult> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.AskAI === "function") {
    const result = await bridgeApp.AskAI(request);
    return {
      answer: String(result?.answer ?? ""),
      source: String(result?.source ?? ""),
    };
  }

  throw new Error("当前运行中的后端版本还不支持 AI 提问，请重启应用后再试");
}

function getBridgeApp(): BridgeAppCompat {
  return ((window as typeof window & {
    go?: { bridge?: { App?: BridgeAppCompat } };
  }).go?.bridge?.App ?? {}) as BridgeAppCompat;
}
