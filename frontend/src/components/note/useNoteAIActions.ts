import type { AINoteSceneActionRequest, AINoteSelectionPayload } from "../../features/ai/services/aiTypes";

type NoteAIActionsOptions = {
  buildSelectionPayload: () => AINoteSelectionPayload | null;
  closeContextMenu: () => void;
  currentFile: () => string;
  getOriginPosition?: () => { x: number; y: number } | null;
  onDesign: (request: AINoteSceneActionRequest) => void;
  onGenerate: (request: AINoteSceneActionRequest) => void;
  onGeometry: (request: AINoteSceneActionRequest) => void;
  onAsk: (request: AINoteSceneActionRequest) => void;
};

export function useNoteAIActions(options: NoteAIActionsOptions) {
  function runAIAsk() {
    runAIAction("ask");
  }

  function runAIGeneration() {
    runAIAction("generate");
  }

  function runAIDesign() {
    runAIAction("design");
  }

  function runAIGeometry() {
    runAIAction("geometry");
  }

  function runAIAction(kind: "ask" | "generate" | "design" | "geometry") {
    const selection = options.buildSelectionPayload();
    const sceneName = options.currentFile().trim();
    if (!selection || !sceneName) {
      options.closeContextMenu();
      return;
    }

    const request = {
      sceneName,
      selection,
      ...(kind === "ask" ? { origin: options.getOriginPosition?.() ?? undefined } : {}),
    };

    if (kind === "ask") {
      options.onAsk(request);
    } else if (kind === "design") {
      options.onDesign(request);
    } else if (kind === "geometry") {
      options.onGeometry(request);
    } else {
      options.onGenerate(request);
    }
    options.closeContextMenu();
  }

  return {
    runAIAsk,
    runAIDesign,
    runAIGeneration,
    runAIGeometry,
  };
}
