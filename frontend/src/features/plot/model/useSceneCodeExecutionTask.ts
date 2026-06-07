import { repairCodeFromRunError } from "../../ai/services/aiBridgeCompat";
import type { AIProviderSettings } from "../../ai/services/aiTypes";
import { applyRepairPatch } from "../../aiRepair/services/repairPatch";
import { getErrorMessage } from "../../../lib/errors";

export type SceneCodeRunResult =
  | { ok: true }
  | { ok: false; errorText: string; reason: "failed" | "stopped" };

type SceneCodeExecutionTaskOptions = {
  aiSettings: () => AIProviderSettings;
  clearRunError: () => void;
  loadSceneCode: (sceneName: string) => Promise<string>;
  maxRepairAttempts?: number;
  onFailure: (result: { message: string; repairable: boolean; sceneName: string }) => void;
  onInterrupted: (sceneName: string) => void;
  runSceneCodeAndWait: (sceneName: string, code: string) => Promise<SceneCodeRunResult>;
  saveSceneCode: (sceneName: string, code: string) => Promise<void>;
};

export function useSceneCodeExecutionTask(options: SceneCodeExecutionTaskOptions) {
  const maxRepairAttempts = options.maxRepairAttempts ?? 8;

  async function execute(sceneName: string, code?: string) {
    if (!sceneName.trim()) {
      return false;
    }

    let currentCode = typeof code === "string" ? code : await options.loadSceneCode(sceneName);

    try {
      for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
        const runResult = await options.runSceneCodeAndWait(sceneName, currentCode);
        if (runResult.ok) {
          options.clearRunError();
          return true;
        }

        if (runResult.reason === "stopped") {
          options.onInterrupted(sceneName);
          return false;
        }

        if (attempt === maxRepairAttempts) {
          options.onFailure({
            message: runResult.errorText,
            repairable: true,
            sceneName,
          });
          return false;
        }

        const repairResult = await repairCodeFromRunError({
          sceneName,
          currentCode,
          errorText: runResult.errorText,
          settings: options.aiSettings(),
        });
        const applied = applyRepairPatch(currentCode, repairResult.patch);
        currentCode = applied.code;
        await options.saveSceneCode(sceneName, currentCode);
      }
    } catch (error) {
      options.onFailure({
        message: getErrorMessage(error),
        repairable: false,
        sceneName,
      });
      return false;
    }

    return false;
  }

  return {
    execute,
  };
}
