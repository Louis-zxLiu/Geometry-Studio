import type { AIProviderSettings } from "./aiTypes";

const settingsKey = "plotkitycat:ai:provider-settings";

export function createAISettingsStorage() {
  return {
    load(): AIProviderSettings {
      if (typeof window === "undefined") {
        return createDefaultAISettings();
      }

      try {
        const raw = window.localStorage.getItem(settingsKey);
        if (!raw) {
          return createDefaultAISettings();
        }

        return normalizeAISettings(JSON.parse(raw) as Partial<AIProviderSettings>);
      } catch {
        return createDefaultAISettings();
      }
    },
    save(settings: AIProviderSettings) {
      if (typeof window === "undefined") {
        return;
      }

      window.localStorage.setItem(settingsKey, JSON.stringify(settings));
    },
  };
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
