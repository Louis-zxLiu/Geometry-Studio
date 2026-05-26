import type { AINoteSelectionPayload } from "../../features/ai/services/aiTypes";

type NoteAIActionsOptions = {
  buildSelectionPayload: () => AINoteSelectionPayload | null;
  closeContextMenu: () => void;
  onDesign: (selection: AINoteSelectionPayload) => void;
  onGenerate: (selection: AINoteSelectionPayload) => void;
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
    if (!selection) {
      options.closeContextMenu();
      return;
    }

    if (kind === "design") {
      options.onDesign(selection);
    } else {
      options.onGenerate(selection);
    }
    options.closeContextMenu();
  }

  return {
    runAIDesign,
    runAIGeneration,
  };
}
