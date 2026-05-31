import type { Ref, ShallowRef } from "vue";
import type { EditorView } from "../../lib/codemirror";
import {
  hasDesignCardDragData,
  readDesignCardDragData,
  type DesignCardDragSource,
} from "../../features/designCard/services/designCardDragData";

type EditorDesignCardDropOptions = {
  editorView: ShallowRef<EditorView | null>;
  isDraggingOver: Ref<boolean>;
  getViewportAnchorLine: (view: EditorView) => number;
  onPlaceCard: (payload: { cardId: string; afterLine: number; source: DesignCardDragSource }) => void;
  onUpdateAutoScroll: (event: DragEvent) => void;
  onStopAutoScroll: () => void;
};

export function useEditorDesignCardDrop(options: EditorDesignCardDropOptions) {
  function handleHostDragOver(event: DragEvent) {
    if (!hasDesignCardDragData(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    options.isDraggingOver.value = true;
    options.onUpdateAutoScroll(event);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleHostDrop(event: DragEvent) {
    const dragData = readDesignCardDragData(event.dataTransfer);
    if (!dragData) {
      return;
    }

    const view = options.editorView.value;
    if (!view) {
      return;
    }

    event.preventDefault();
    options.isDraggingOver.value = false;
    options.onStopAutoScroll();
    placeCardFromEvent(event, view, dragData.cardId, dragData.source);
  }

  function handleDragLeave(event: DragEvent) {
    if (
      event.currentTarget instanceof HTMLElement &&
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    clearDesignCardDragOver();
  }

  function clearDesignCardDragOver() {
    options.isDraggingOver.value = false;
    options.onStopAutoScroll();
  }

  function placeCardFromEvent(
    event: DragEvent,
    view: EditorView,
    cardId: string,
    source: DesignCardDragSource,
  ) {
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const afterLine = position === null
      ? options.getViewportAnchorLine(view)
      : view.state.doc.lineAt(position).number;
    options.onPlaceCard({ cardId, afterLine, source });
  }

  return {
    clearDesignCardDragOver,
    handleDragLeave,
    handleHostDragOver,
    handleHostDrop,
  };
}
