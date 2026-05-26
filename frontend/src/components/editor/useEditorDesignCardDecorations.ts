import { ref, type ComputedRef, type ShallowRef } from "vue";
import {
  Compartment,
  Decoration,
  type DecorationSet,
  EditorState,
  EditorView,
} from "../../lib/codemirror";
import type { DesignCard, DesignCardPlacement } from "../../features/designCard/services/designCardTypes";
import { DesignCardCodeWidget } from "./DesignCardCodeWidget";

type EditorDesignCardDecorationsOptions = {
  editorView: ShallowRef<EditorView | null>;
  normalizedCode: ComputedRef<string>;
  getDesignCards: () => DesignCard[] | undefined;
  getDesignCardPlacements: () => DesignCardPlacement[] | undefined;
  getAnimatedLineRanges: () => Array<{ startLine: number; endLine: number }> | undefined;
  getAnimationKey: () => number | undefined;
  getIsStreaming: () => boolean | undefined;
  onDeleteCard: (cardId: string) => void;
  onMoveCard: (payload: { cardId: string; delta: number }) => void;
  onOpenCard: (cardId: string) => void;
};

export function useEditorDesignCardDecorations(options: EditorDesignCardDecorationsOptions) {
  const cardDecorations = new Compartment();
  const cardViewportWidth = ref(0);

  function buildDecorations(): DecorationSet {
    const view = options.editorView.value;
    const doc = view?.state.doc ?? EditorState.create({ doc: options.normalizedCode.value }).doc;
    const decorations = [];
    const cardMap = new Map((options.getDesignCards() ?? []).map((card) => [card.id, card]));

    for (const placement of options.getDesignCardPlacements() ?? []) {
      const card = cardMap.get(placement.cardId);
      if (!card) {
        continue;
      }

      const afterLine = Math.max(
        1,
        Math.min(doc.lines, Number.isFinite(placement.afterLine) ? placement.afterLine : doc.lines),
      );
      const position = doc.line(afterLine).to;
      decorations.push(
        Decoration.widget({
          block: true,
          side: 1,
          widget: new DesignCardCodeWidget(card, {
            delete: options.onDeleteCard,
            move: options.onMoveCard,
            open: options.onOpenCard,
          }, cardViewportWidth.value),
        }).range(position),
      );
    }

    const animatedLines = new Set<number>();
    void options.getAnimationKey();
    for (const range of options.getAnimatedLineRanges() ?? []) {
      for (let line = range.startLine; line <= range.endLine; line += 1) {
        animatedLines.add(line);
      }
    }

    for (const lineNumber of animatedLines) {
      if (lineNumber >= 1 && lineNumber <= doc.lines) {
        decorations.push(Decoration.line({ class: "cm-repair-revealed" }).range(doc.line(lineNumber).from));
      }
    }

    if (options.getIsStreaming() && doc.lines > 0) {
      decorations.push(Decoration.line({ class: "cm-streaming-line" }).range(doc.line(doc.lines).from));
    }

    return Decoration.set(decorations, true);
  }

  function reconfigureDecorations() {
    options.editorView.value?.dispatch({
      effects: cardDecorations.reconfigure(EditorView.decorations.of(buildDecorations())),
    });
  }

  function updateCardViewportWidth(view: EditorView) {
    const gutterWidth = view.dom.querySelector(".cm-gutters")?.getBoundingClientRect().width ?? 0;
    const nextWidth = Math.max(0, Math.floor(view.scrollDOM.clientWidth - gutterWidth));
    if (Math.abs(nextWidth - cardViewportWidth.value) < 1) {
      return;
    }

    cardViewportWidth.value = nextWidth;
    reconfigureDecorations();
  }

  return {
    buildDecorations,
    cardDecorations,
    reconfigureDecorations,
    updateCardViewportWidth,
  };
}
