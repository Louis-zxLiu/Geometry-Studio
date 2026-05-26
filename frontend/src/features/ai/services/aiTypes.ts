export type AIServiceMode = "custom" | "subscription";
export type AIGenerationKind = "visualize";

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
  kind: AIGenerationKind;
  sceneName: string;
  currentCode: string;
  settings: AIProviderSettings;
  selection: AINoteSelectionPayload;
};

export type AINoteActionRequest = {
  kind: AIGenerationKind;
  selection: AINoteSelectionPayload;
};

export type AIGenerationResult = {
  code: string;
  source: string;
};

export type AIRepairRequest = {
  sceneName: string;
  currentCode: string;
  errorText: string;
  settings: AIProviderSettings;
};

export type AIRepairResult = {
  patch: string;
  source: string;
};

export type AIOptimizeRequest = {
  sceneName: string;
  currentCode: string;
  instruction: string;
  settings: AIProviderSettings;
};

export type AIOptimizeResult = {
  patch: string;
  source: string;
};

export type CodeAIVersion = {
  id: string;
  label: string;
  note: string;
  code: string;
  createdAt: number;
};

export type CreateCodeAIVersionRequest = {
  sceneName: string;
  note: string;
  code: string;
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

export type AppUpdateStatus = {
  currentVersion: string;
  latestVersion: string;
  notes: string;
  publishedAt: string;
  lastCheckedAt: string;
  message: string;
  updateAvailable: boolean;
  downloaded: boolean;
  readyToInstall: boolean;
  actionLabel: string;
};
