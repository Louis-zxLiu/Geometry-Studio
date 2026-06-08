import type { Ref } from "vue";
import type {
  AINoteActionRequest,
  AINoteSceneActionRequest,
} from "../../ai/services/aiTypes";
import { getErrorMessage } from "../../../lib/errors";

type AINoteGenerationOptions = {
  onError: (message: string) => void;
  resolveSceneCode: (sceneName: string) => Promise<string>;
  startWorkflow: (payload: {
    sceneName: string;
    currentCode: string;
    selection: AINoteActionRequest["selection"];
  }) => Promise<void>;
};

export function useAINoteGeneration(options: AINoteGenerationOptions) {
  async function runAINoteAction(request: AINoteActionRequest) {
    const targetScene = request.sceneName.trim();
    if (!targetScene || !request.selection.items.length) {
      return;
    }

    try {
      const targetCode = await options.resolveSceneCode(targetScene);
      await options.startWorkflow({
        sceneName: targetScene,
        currentCode: targetCode,
        selection: request.selection,
      });
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  function generateCodeFromNoteSelection(request: AINoteSceneActionRequest) {
    return runAINoteAction({ kind: "visualize", ...request });
  }

  return {
    generateCodeFromNoteSelection,
    runAINoteAction,
  };
}
