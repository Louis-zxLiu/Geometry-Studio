import type { Ref } from "vue";
import { generateCodeFromSelection } from "../../ai/services/aiBridgeCompat";
import type {
  AIGenerationKind,
  AINoteActionRequest,
  AINoteSelectionPayload,
  AIProviderSettings,
} from "../../ai/services/aiTypes";
import { getErrorMessage } from "../../../lib/errors";

type AIActivityStatus = {
  isAIGenerating: Ref<boolean>;
  startChecking: () => void;
  startWorking: () => void;
  start: () => void;
  stop: () => void;
};

type AINoteGenerationOptions = {
  aiActivity: AIActivityStatus;
  aiSettings: Ref<AIProviderSettings>;
  codeContent: Ref<string>;
  currentFile: Ref<string>;
  executeAICodeLoop: () => Promise<boolean>;
  isRunning: Ref<boolean>;
  onError: (message: string) => void;
  streamGeneratedCode: (generatedCode: string) => Promise<void>;
};

export function useAINoteGeneration(options: AINoteGenerationOptions) {
  async function runAINoteAction(request: AINoteActionRequest) {
    if (
      !options.currentFile.value ||
      options.isRunning.value ||
      options.aiActivity.isAIGenerating.value ||
      !request.selection.items.length
    ) {
      return;
    }

    options.aiActivity.startWorking();
    try {
      const result = await generateCodeFromSelection({
        kind: request.kind,
        sceneName: options.currentFile.value,
        currentCode: options.codeContent.value,
        settings: options.aiSettings.value,
        selection: request.selection,
      });

      await options.streamGeneratedCode(result.code);
      options.aiActivity.startChecking();
      await options.executeAICodeLoop();
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      options.aiActivity.stop();
    }
  }

  function generateCodeFromNoteSelection(selection: AINoteSelectionPayload) {
    return runTypedAINoteAction("visualize", selection);
  }

  function runTypedAINoteAction(kind: AIGenerationKind, selection: AINoteSelectionPayload) {
    return runAINoteAction({ kind, selection });
  }

  return {
    generateCodeFromNoteSelection,
    runAINoteAction,
  };
}
