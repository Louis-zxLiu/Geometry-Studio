import type { Ref, ShallowRef } from "vue";
import type { EditorView } from "../../lib/codemirror";
import {
  hasDesignCardDragData,
  readDesignCardDragData,
} from "../../features/designCard/services/designCardDragData";

type EditorDesignCardDropOptions = {
  editorView: ShallowRef<EditorView | null>;
  isDraggingOver: Ref<boolean>;
  getViewportAnchorLine: (view: EditorView) => number;
  onPlaceCard: (payload: { cardId: string; afterLine: number }) => void;
  onUpdateAutoScroll: (event: DragEvent) => void;
  onStopAutoScroll: () => void;
};

export function useEditorDesignCardDrop(options: EditorDesignCardDropOptions) {
  function handleDragOver(event: DragEvent) {
    if (!hasDesignCardDragData(event.dataTransfer)) {
      return false;
    }
    const dragData = readDesignCardDragData(event.dataTransfer);
    if (dragData?.source === "note") {
      return false;
    }

    event.preventDefault();
    options.isDraggingOver.value = true;
    options.onUpdateAutoScroll(event);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    return true;
  }

  function handleDrop(event: DragEvent, view: EditorView) {
    const dragData = readDesignCardDragData(event.dataTransfer);
    if (!dragData || dragData.source !== "editor") {
      return false;
    }

    event.preventDefault();
    options.isDraggingOver.value = false;
    options.onStopAutoScroll();
    placeCardFromEvent(event, view, dragData.cardId);
    return true;
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

  function handleSurfaceDragOver(event: DragEvent) {
    if (!hasDesignCardDragData(event.dataTransfer)) {
      return;
    }
    const dragData = readDesignCardDragData(event.dataTransfer);
    if (dragData?.source === "note") {
      return;
    }

    event.preventDefault();
    options.isDraggingOver.value = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleSurfaceDrop(event: DragEvent) {
    const dragData = readDesignCardDragData(event.dataTransfer);
    if (!dragData || dragData.source !== "editor") {
      return;
    }
    if (event.target instanceof Element && event.target.closest(".cm-content, .cm-editor")) {
      return;
    }

    event.preventDefault();
    options.isDraggingOver.value = false;
    options.onStopAutoScroll();
    const view = options.editorView.value;
    if (!view) {
      return;
    }

    placeCardFromEvent(event, view, dragData.cardId);
  }

  function placeCardFromEvent(event: DragEvent, view: EditorView, cardId: string) {
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const afterLine = position === null
      ? options.getViewportAnchorLine(view)
      : view.state.doc.lineAt(position).number;
    options.onPlaceCard({ cardId, afterLine });
  }

  return {
    clearDesignCardDragOver,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleSurfaceDragOver,
    handleSurfaceDrop,
  };
}
