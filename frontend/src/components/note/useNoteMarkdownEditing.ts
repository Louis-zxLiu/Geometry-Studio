import { computed, nextTick, ref, type Ref } from "vue";
import {
  fromEditableDesignCardMarkdown,
  toEditableDesignCardMarkdown,
} from "../../features/designCard/services/designCardMarkdownCodec";
import type { DesignCard } from "../../features/designCard/services/designCardTypes";
import type { NoteDocument } from "../../features/notebook/services/notebookStorage";

type NoteMarkdownEditingOptions = {
  document: () => NoteDocument;
  designCards: () => DesignCard[];
  currentFile: () => string;
  markdownInput: Ref<HTMLTextAreaElement | null>;
  markdownSurface: Ref<HTMLElement | null>;
  notebookScroll: Ref<HTMLElement | null>;
  onCloseContextMenu: () => void;
  onUpdateMarkdown: (markdown: string) => void;
  resolveImagePathFromEventTarget: (target: EventTarget | null) => string;
};

export function useNoteMarkdownEditing(options: NoteMarkdownEditingOptions) {
  const isEditingMarkdown = ref(false);
  const editableMarkdown = computed(() =>
    toEditableDesignCardMarkdown(options.document().markdown, options.designCards()),
  );
  const shouldShowMarkdownInput = computed(() => isEditingMarkdown.value);
  let markdownResizeFrame = 0;

  function updateMarkdown(event: Event) {
    options.onUpdateMarkdown(
      fromEditableDesignCardMarkdown(
        (event.target as HTMLTextAreaElement).value,
        options.designCards(),
      ),
    );
    scheduleMarkdownInputResize();
  }

  function focusMarkdownInputAtEnd() {
    isEditingMarkdown.value = true;
    options.onCloseContextMenu();
    void nextTick(() => {
      const textarea = options.markdownInput.value;
      const scrollContainer = options.notebookScroll.value;
      if (!textarea) {
        return;
      }

      resizeMarkdownInput();
      const end = textarea.value.length;
      textarea.focus();
      textarea.setSelectionRange(end, end);
      textarea.scrollTop = textarea.scrollHeight;
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    });
  }

  function handleMarkdownFocus() {
    isEditingMarkdown.value = true;
    scheduleMarkdownInputResize();
  }

  function shouldStartMarkdownEdit(target: EventTarget | null) {
    if (!options.currentFile() || shouldShowMarkdownInput.value) {
      return false;
    }

    if (options.resolveImagePathFromEventTarget(target)) {
      return false;
    }
    if (target instanceof Element && target.closest(".notebook-design-card-block, .design-card-invalid-block")) {
      return false;
    }

    if (target === options.notebookScroll.value) {
      return true;
    }

    if (!(target instanceof Node)) {
      return false;
    }

    if (options.markdownSurface.value?.contains(target)) {
      return true;
    }

    if (target instanceof HTMLElement) {
      return target.classList.contains("notebook-document-flow");
    }

    return false;
  }

  function scheduleMarkdownInputResize() {
    if (markdownResizeFrame) {
      window.cancelAnimationFrame(markdownResizeFrame);
    }

    markdownResizeFrame = window.requestAnimationFrame(() => {
      markdownResizeFrame = 0;
      resizeMarkdownInput();
    });
  }

  function resizeMarkdownInput() {
    const textarea = options.markdownInput.value;
    if (!textarea || !shouldShowMarkdownInput.value) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(42, textarea.scrollHeight)}px`;
  }

  function getCurrentInsertionIndex() {
    const textarea = options.markdownInput.value;
    if (textarea && document.activeElement === textarea) {
      return textarea.selectionStart ?? textarea.value.length;
    }

    return options.document().markdown.length;
  }

  function maybeStopEditingFromPointerDown(target: Node) {
    const isInsideMarkdownSurface = Boolean(options.markdownSurface.value?.contains(target));
    if (isEditingMarkdown.value && !isInsideMarkdownSurface) {
      isEditingMarkdown.value = false;
    }
  }

  function cancelMarkdownInputResize() {
    if (markdownResizeFrame) {
      window.cancelAnimationFrame(markdownResizeFrame);
      markdownResizeFrame = 0;
    }
  }

  return {
    cancelMarkdownInputResize,
    editableMarkdown,
    focusMarkdownInputAtEnd,
    getCurrentInsertionIndex,
    handleMarkdownFocus,
    isEditingMarkdown,
    maybeStopEditingFromPointerDown,
    scheduleMarkdownInputResize,
    shouldShowMarkdownInput,
    shouldStartMarkdownEdit,
    updateMarkdown,
  };
}

