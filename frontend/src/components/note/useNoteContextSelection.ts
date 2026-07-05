import { computed, ref, type Ref } from "vue";
import type { AINoteSelectionPayload } from "../../features/ai/services/aiTypes";
import {
  buildAINoteSelectionPayload,
  collectSelectedImagesForContextMenu,
} from "../../features/notebook/selection/noteSelection";
import type { DesignCard } from "../../features/designCard/services/designCardTypes";
import type { NoteDocument } from "../../features/notebook/services/notebookStorage";

type NoteContextSelectionOptions = {
  canOpenEmptyMenu: () => boolean;
  designCards: () => DesignCard[];
  document: () => NoteDocument;
  selectedImageOrder: Ref<Record<string, number>>;
  markdownInput: Ref<HTMLTextAreaElement | null>;
  notebookRoot: Ref<HTMLElement | null>;
  ensureImageSelection: (relativePath: string) => void;
  nextSelectionOrder: () => number;
  resolveImagePathFromEventTarget: (target: EventTarget | null) => string;
};

export function useNoteContextSelection(options: NoteContextSelectionOptions) {
  const textSelection = ref<{ text: string; selectedAt: number } | null>(null);
  const contextMenu = ref<{ x: number; y: number } | null>(null);
  const contextMenuImages = computed(() =>
    collectSelectedImagesForContextMenu(
      options.document(),
      textSelection.value,
      options.selectedImageOrder.value,
    ),
  );
  const contextMenuHasSelection = computed(() => hasSelection());
  const contextMenuSupportsInsert = computed(
    () => options.canOpenEmptyMenu() && !contextMenuHasSelection.value,
  );

  function handleContextMenu(event: MouseEvent) {
    const relativePath = options.resolveImagePathFromEventTarget(event.target);
    const isNotebookTarget =
      event.target instanceof Node && !!options.notebookRoot.value?.contains(event.target);
    const hasContextSelection = relativePath !== "" || isTextSelectionContextTarget(event.target);
    if (!hasContextSelection && !isNotebookTarget) {
      closeContextMenu();
      return;
    }

    event.preventDefault();
    if (relativePath) {
      options.ensureImageSelection(relativePath);
    }
    syncTextSelection();
    if (!hasSelection() && !options.canOpenEmptyMenu()) {
      closeContextMenu();
      return;
    }

    contextMenu.value = {
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handleTextSelectionChange() {
    window.requestAnimationFrame(() => {
      syncTextSelection();
    });
  }

  function buildSelectionPayload(): AINoteSelectionPayload | null {
    return buildAINoteSelectionPayload(
      options.document(),
      textSelection.value,
      options.selectedImageOrder.value,
      options.designCards(),
    );
  }

  function closeContextMenu() {
    contextMenu.value = null;
  }

  function syncTextSelection() {
    const textarea = options.markdownInput.value;
    if (textarea && document.activeElement === textarea) {
      const start = textarea.selectionStart ?? 0;
      const end = textarea.selectionEnd ?? 0;
      const nextText = textarea.value.slice(start, end).trim();
      if (nextText !== "") {
        textSelection.value = {
          text: nextText,
          selectedAt: options.nextSelectionOrder(),
        };
        return;
      }
    }

    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      !options.notebookRoot.value?.contains(selection.anchorNode) ||
      !options.notebookRoot.value?.contains(selection.focusNode)
    ) {
      textSelection.value = null;
      return;
    }

    const nextText = selection.toString().trim();
    if (nextText === "") {
      textSelection.value = null;
      return;
    }

    textSelection.value = {
      text: nextText,
      selectedAt: options.nextSelectionOrder(),
    };
  }

  function isTextSelectionContextTarget(target: EventTarget | null) {
    const textarea = options.markdownInput.value;
    if (
      textarea &&
      document.activeElement === textarea &&
      textarea.selectionStart !== textarea.selectionEnd &&
      target === textarea
    ) {
      return true;
    }

    if (!(target instanceof Node)) {
      return false;
    }

    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      !options.notebookRoot.value?.contains(selection.anchorNode) ||
      !options.notebookRoot.value?.contains(selection.focusNode)
    ) {
      return false;
    }

    try {
      return selection.getRangeAt(0).intersectsNode(target);
    } catch {
      return false;
    }
  }

  function hasSelection() {
    return buildSelectionPayload() !== null;
  }

  return {
    buildSelectionPayload,
    closeContextMenu,
    contextMenu,
    contextMenuHasSelection,
    contextMenuImages,
    contextMenuSupportsInsert,
    handleContextMenu,
    handleTextSelectionChange,
  };
}
