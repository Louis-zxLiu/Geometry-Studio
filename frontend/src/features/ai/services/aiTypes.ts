export type AIServiceMode = "custom" | "subscription";

export type AIProviderSettings = {
  mode: AIServiceMode;
  url: string;
  key: string;
  model: string;
};

export type AINoteSelectionItem =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "image";
      name: string;
      alt: string;
      dataUrl: string;
      relativePath: string;
    };

export type AINoteSelectionPayload = {
  items: AINoteSelectionItem[];
};

export type AIGenerationRequest = {
  sceneName: string;
  currentCode: string;
  settings: AIProviderSettings;
  selection: AINoteSelectionPayload;
};

export type AIGenerationResult = {
  code: string;
  source: string;
};

export type AISubscriptionStatus = {
  status: "active" | "inactive" | "unconfigured" | "error";
  activated: boolean;
  deviceId: string;
  expireAt: string;
  lastCheckedAt: string;
  message: string;
  model: string;
  baseUrl: string;
};

export type AISubscriptionPurchaseResult = {
  configured: boolean;
  url: string;
  deviceId: string;
  message: string;
};
