import type { Ref } from "vue";
import { repairCodeFromRunError } from "../../ai/services/aiBridgeCompat";
import type { AIProviderSettings } from "../../ai/services/aiTypes";
import { applyRepairPatch, type ChangedLineRange } from "../services/repairPatch";
import { getErrorMessage } from "../../../lib/errors";

type AIActivityStatus = {
  isAIGenerating: Ref<boolean>;
  startChecking: () => void;
  startWorking: () => void;
  start: () => void;
  stop: () => void;
};

type ErrorDialog = {
  closeRunErrorDialog: () => void;
  openRunErrorDialog: (
    errorText: string,
    options?: { repairable?: boolean; repairSceneName?: string; repairText?: string },
  ) => void;
  runErrorRepairSceneName: Ref<string>;
  runErrorRepairText: Ref<string>;
  runErrorText: Ref<string>;
};

type AIRunErrorRepairOptions = {
  aiActivity: AIActivityStatus;
  aiSettings: Ref<AIProviderSettings>;
  codeContent: Ref<string>;
  currentFile: Ref<string>;
  executeAICodeLoop?: () => Promise<boolean>;
  executeSceneCodeLoop?: (sceneName: string, code: string) => Promise<boolean>;
  errorDialog: ErrorDialog;
  isRunning: Ref<boolean>;
  loadSceneCode?: (sceneName: string) => Promise<string>;
  onApplied: (ranges: ChangedLineRange[]) => void;
  saveSceneCode?: (sceneName: string, code: string) => Promise<void>;
};

export function useAIRunErrorRepair(options: AIRunErrorRepairOptions) {
  async function repairCodeWithError(errorText: string, sceneName = options.currentFile.value, currentCode = options.codeContent.value) {
    const result = await repairCodeFromRunError({
      sceneName,
      currentCode,
      errorText,
      settings: options.aiSettings.value,
    });
    const applied = applyRepairPatch(currentCode, result.patch);
    if (sceneName === options.currentFile.value) {
      options.codeContent.value = applied.code;
      options.onApplied(applied.changedRanges);
    } else if (options.saveSceneCode) {
      await options.saveSceneCode(sceneName, applied.code);
    }
    return applied;
  }

  async function repairCurrentRunError() {
    const repairSceneName = options.errorDialog.runErrorRepairSceneName.value || options.currentFile.value;
    if (
      options.aiActivity.isAIGenerating.value ||
      options.isRunning.value ||
      !repairSceneName
    ) {
      return;
    }

    const errorText = options.errorDialog.runErrorRepairText.value || options.errorDialog.runErrorText.value;
    options.errorDialog.closeRunErrorDialog();
    options.aiActivity.startWorking();

    try {
      const currentCode = repairSceneName === options.currentFile.value
        ? options.codeContent.value
        : await options.loadSceneCode?.(repairSceneName) ?? "";
      const applied = await repairCodeWithError(errorText, repairSceneName, currentCode);
      if (repairSceneName !== options.currentFile.value && options.executeSceneCodeLoop) {
        options.aiActivity.startChecking();
        await options.executeSceneCodeLoop(repairSceneName, applied.code);
      } else if (options.executeAICodeLoop) {
        options.aiActivity.startChecking();
        await options.executeAICodeLoop();
      }
    } catch (error) {
      options.errorDialog.openRunErrorDialog(getErrorMessage(error), {
        repairSceneName,
        repairText: getErrorMessage(error),
      });
    } finally {
      options.aiActivity.stop();
    }
  }

  return {
    repairCodeWithError,
    repairCurrentRunError,
  };
}
