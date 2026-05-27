import type { Ref } from "vue";
import { repairCodeFromRunError } from "../../ai/services/aiBridgeCompat";
import type { AIProviderSettings } from "../../ai/services/aiTypes";
import { applyRepairPatch, type ChangedLineRange } from "../services/repairPatch";
import { getErrorMessage } from "../../../lib/errors";

type AIActivityStatus = {
  isAIGenerating: Ref<boolean>;
  start: () => void;
  stop: () => void;
};

type ErrorDialog = {
  closeRunErrorDialog: () => void;
  openRunErrorDialog: (errorText: string, options?: { repairable?: boolean }) => void;
  runErrorText: Ref<string>;
};

type AIRunErrorRepairOptions = {
  aiActivity: AIActivityStatus;
  aiSettings: Ref<AIProviderSettings>;
  codeContent: Ref<string>;
  currentFile: Ref<string>;
  errorDialog: ErrorDialog;
  isRunning: Ref<boolean>;
  onApplied: (ranges: ChangedLineRange[]) => void;
};

export function useAIRunErrorRepair(options: AIRunErrorRepairOptions) {
  async function repairCurrentRunError() {
    if (
      options.aiActivity.isAIGenerating.value ||
      options.isRunning.value ||
      !options.currentFile.value
    ) {
      return;
    }

    const errorText = options.errorDialog.runErrorText.value;
    options.errorDialog.closeRunErrorDialog();
    options.aiActivity.start();

    try {
      const result = await repairCodeFromRunError({
        sceneName: options.currentFile.value,
        currentCode: options.codeContent.value,
        errorText,
        settings: options.aiSettings.value,
      });
      const applied = applyRepairPatch(options.codeContent.value, result.patch);
      options.codeContent.value = applied.code;
      options.onApplied(applied.changedRanges);
    } catch (error) {
      options.errorDialog.openRunErrorDialog(getErrorMessage(error));
    } finally {
      options.aiActivity.stop();
    }
  }

  return {
    repairCurrentRunError,
  };
}
