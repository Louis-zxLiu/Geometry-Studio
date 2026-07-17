import type { AIProviderSettings } from "./aiTypes";

type BridgeAppCompat = {
  ClearAISettings?: () => Promise<AIProviderSettings>;
  GetAISettings?: () => Promise<AIProviderSettings>;
  SaveAISettings?: (settings: AIProviderSettings) => Promise<AIProviderSettings>;
};

export async function getAISettings(): Promise<AIProviderSettings> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.GetAISettings === "function") {
    return normalizeAISettings(await bridgeApp.GetAISettings());
  }

  return createDefaultAISettings();
}

export async function saveAISettings(settings: AIProviderSettings): Promise<AIProviderSettings> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.SaveAISettings === "function") {
    return normalizeAISettings(await bridgeApp.SaveAISettings(settings));
  }

  throw new Error("当前后端版本不支持保存 AI 设置，请重启应用后再试。");
}

export async function clearAISettings(): Promise<AIProviderSettings> {
  const bridgeApp = getBridgeApp();
  if (typeof bridgeApp.ClearAISettings === "function") {
    return normalizeAISettings(await bridgeApp.ClearAISettings());
  }

  return createDefaultAISettings();
}

export function createDefaultAISettings(): AIProviderSettings {
  return {
    mode: "custom",
    url: "",
    key: "",
    model: "",
  };
}

function normalizeAISettings(value: Partial<AIProviderSettings> | null | undefined): AIProviderSettings {
  return {
    mode: value?.mode === "subscription" ? "subscription" : "custom",
    url: typeof value?.url === "string" ? value.url : "",
    key: typeof value?.key === "string" ? value.key : "",
    model: typeof value?.model === "string" ? value.model : "",
  };
}

function getBridgeApp(): BridgeAppCompat {
  return ((window as typeof window & {
    go?: { bridge?: { App?: BridgeAppCompat } };
  }).go?.bridge?.App ?? {}) as BridgeAppCompat;
}
