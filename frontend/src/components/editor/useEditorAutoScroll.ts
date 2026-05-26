import type { Ref, ShallowRef } from "vue";
import type { EditorView } from "../../lib/codemirror";

type EditorAutoScrollOptions = {
  editorView: ShallowRef<EditorView | null>;
  isDraggingOver: Ref<boolean>;
  onScrolled: () => void;
};

export function useEditorAutoScroll(options: EditorAutoScrollOptions) {
  let autoScrollFrame = 0;
  let autoScrollSpeed = 0;
  const wheelListenerOptions = { capture: true, passive: false } as const;

  function handleDesignCardDragWheel(event: WheelEvent) {
    const view = options.editorView.value;
    if (!view || !options.isDraggingOver.value) {
      return;
    }

    event.preventDefault();
    view.scrollDOM.scrollTop += event.deltaY;
    view.scrollDOM.scrollLeft += event.deltaX;
    options.onScrolled();
  }

  function updateDesignCardAutoScroll(event: DragEvent) {
    const view = options.editorView.value;
    if (!view) {
      return;
    }

    const bounds = view.scrollDOM.getBoundingClientRect();
    const edgeSize = Math.min(140, Math.max(72, bounds.height * 0.18));
    const distanceToTop = event.clientY - bounds.top;
    const distanceToBottom = bounds.bottom - event.clientY;
    const maxSpeed = 26;

    if (distanceToTop >= 0 && distanceToTop < edgeSize) {
      const strength = (edgeSize - distanceToTop) / edgeSize;
      autoScrollSpeed = -Math.max(5, maxSpeed * strength);
    } else if (distanceToBottom >= 0 && distanceToBottom < edgeSize) {
      const strength = (edgeSize - distanceToBottom) / edgeSize;
      autoScrollSpeed = Math.max(5, maxSpeed * strength);
    } else {
      stopDesignCardAutoScroll();
      return;
    }

    if (!autoScrollFrame) {
      autoScrollFrame = window.requestAnimationFrame(runDesignCardAutoScroll);
    }
  }

  function runDesignCardAutoScroll() {
    autoScrollFrame = 0;
    const view = options.editorView.value;
    if (!view || !options.isDraggingOver.value || autoScrollSpeed === 0) {
      return;
    }

    const before = view.scrollDOM.scrollTop;
    view.scrollDOM.scrollTop += autoScrollSpeed;
    if (view.scrollDOM.scrollTop !== before) {
      options.onScrolled();
    }

    autoScrollFrame = window.requestAnimationFrame(runDesignCardAutoScroll);
  }

  function stopDesignCardAutoScroll() {
    autoScrollSpeed = 0;
    if (autoScrollFrame) {
      window.cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = 0;
    }
  }

  return {
    handleDesignCardDragWheel,
    stopDesignCardAutoScroll,
    updateDesignCardAutoScroll,
    wheelListenerOptions,
  };
}
