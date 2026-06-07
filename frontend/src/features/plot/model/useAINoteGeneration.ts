import type { Ref } from "vue";
import { generateCodeFromSelection } from "../../ai/services/aiBridgeCompat";
import type {
  AIGenerationKind,
  AINoteActionRequest,
  AINoteSceneActionRequest,
  AIProviderSettings,
} from "../../ai/services/aiTypes";
import { getErrorMessage } from "../../../lib/errors";
import type { CodeStreamingResult } from "./useCodeStreaming";
import { composeGeneratedCode } from "./useCodeStreaming";

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
  currentFile: Ref<string>;
  executeSceneCodeLoop: (sceneName: string, code: string) => Promise<boolean>;
  isRunning: Ref<boolean>;
  onError: (message: string) => void;
  resolveSceneCode: (sceneName: string) => Promise<string>;
  saveSceneCode: (sceneName: string, code: string) => Promise<void>;
  streamGeneratedCode: (generatedCode: string) => Promise<CodeStreamingResult>;
};

export function useAINoteGeneration(options: AINoteGenerationOptions) {
  async function runAINoteAction(request: AINoteActionRequest) {
    const targetScene = request.sceneName.trim();
    if (
      !targetScene ||
      options.isRunning.value ||
      options.aiActivity.isAIGenerating.value ||
      !request.selection.items.length
    ) {
      return;
    }

    options.aiActivity.startWorking();
    try {
      const targetCode = await options.resolveSceneCode(targetScene);
      const result = await generateCodeFromSelection({
        kind: request.kind,
        sceneName: targetScene,
        currentCode: targetCode,
        settings: options.aiSettings.value,
        selection: request.selection,
      });

      const nextCode = composeGeneratedCode(targetCode, result.code);
      if (options.currentFile.value !== targetScene) {
        await options.saveSceneCode(targetScene, nextCode);
        options.aiActivity.startChecking();
        await options.executeSceneCodeLoop(targetScene, nextCode);
        return;
      }

      const streamingResult = await options.streamGeneratedCode(result.code);
      if (streamingResult === "cancelled") {
        await options.saveSceneCode(targetScene, nextCode);
        options.aiActivity.startChecking();
        await options.executeSceneCodeLoop(targetScene, nextCode);
        return;
      }

      options.aiActivity.startChecking();
      await options.executeSceneCodeLoop(targetScene, nextCode);
    } catch (error) {
      options.onError(getErrorMessage(error));
    } finally {
      options.aiActivity.stop();
    }
  }

  function generateCodeFromNoteSelection(request: AINoteSceneActionRequest) {
    return runTypedAINoteAction("visualize", request);
  }

  function runTypedAINoteAction(kind: AIGenerationKind, request: AINoteSceneActionRequest) {
    return runAINoteAction({ kind, ...request });
  }

  return {
    generateCodeFromNoteSelection,
    runAINoteAction,
  };
}
