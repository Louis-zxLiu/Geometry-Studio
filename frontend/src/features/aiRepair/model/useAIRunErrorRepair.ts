import type { Ref } from "vue";
import { getErrorMessage } from "../../../lib/errors";

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
  codeContent: Ref<string>;
  currentFile: Ref<string>;
  errorDialog: ErrorDialog;
  loadSceneCode?: (sceneName: string) => Promise<string>;
  startWorkflow: (payload: {
    sceneName: string;
    currentCode: string;
    errorText: string;
  }) => Promise<void>;
};

export function useAIRunErrorRepair(options: AIRunErrorRepairOptions) {
  async function repairCurrentRunError() {
    const repairSceneName = options.errorDialog.runErrorRepairSceneName.value || options.currentFile.value;
    if (!repairSceneName) {
      return;
    }

    const errorText = options.errorDialog.runErrorRepairText.value || options.errorDialog.runErrorText.value;
    options.errorDialog.closeRunErrorDialog();

    try {
      const currentCode = repairSceneName === options.currentFile.value
        ? options.codeContent.value
        : await options.loadSceneCode?.(repairSceneName) ?? "";
      await options.startWorkflow({
        sceneName: repairSceneName,
        currentCode,
        errorText,
      });
    } catch (error) {
      options.errorDialog.openRunErrorDialog(getErrorMessage(error), {
        repairSceneName,
        repairText: getErrorMessage(error),
      });
    }
  }

  return {
    repairCurrentRunError,
  };
}
