import type { AINoteSceneActionRequest, AINoteSelectionPayload } from "../../features/ai/services/aiTypes";

type NoteAIActionsOptions = {
  buildSelectionPayload: () => AINoteSelectionPayload | null;
  closeContextMenu: () => void;
  currentFile: () => string;
  onDesign: (request: AINoteSceneActionRequest) => void;
  onGenerate: (request: AINoteSceneActionRequest) => void;
};

export function useNoteAIActions(options: NoteAIActionsOptions) {
  function runAIGeneration() {
    runAIAction("generate");
  }

  function runAIDesign() {
    runAIAction("design");
  }

  function runAIAction(kind: "generate" | "design") {
    const selection = options.buildSelectionPayload();
    const sceneName = options.currentFile().trim();
    if (!selection || !sceneName) {
      options.closeContextMenu();
      return;
    }

    const request = { sceneName, selection };

    if (kind === "design") {
      options.onDesign(request);
    } else {
      options.onGenerate(request);
    }
    options.closeContextMenu();
  }

  return {
    runAIDesign,
    runAIGeneration,
  };
}
