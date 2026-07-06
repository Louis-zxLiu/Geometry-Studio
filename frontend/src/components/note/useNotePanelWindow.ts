import type { Ref } from "vue";
import { isInsideFloatingNoteUI, resolveImagePathFromEventTarget } from "./useNoteDomTargets";

type NotePanelWindowOptions = {
  closeContextMenu: () => void;
  focusMarkdownInputAtEnd: () => void;
  maybeStopEditingFromPointerDown: (target: Node) => void;
  notebookRoot: Ref<HTMLElement | null>;
  scheduleMarkdownInputResize: () => void;
  shouldStartMarkdownEdit: (target: EventTarget | null) => boolean;
  toggleImageSelection: (relativePath: string) => void;
};

export function useNotePanelWindow(options: NotePanelWindowOptions) {
  function handleNotebookPointerDownCapture(event: PointerEvent) {
    if (options.shouldStartMarkdownEdit(event.target)) {
      event.preventDefault();
      options.focusMarkdownInputAtEnd();
    }
  }

  function handleNotebookClick(event: MouseEvent) {
    const relativePath = resolveImagePathFromEventTarget(event.target);
    if (!relativePath) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    options.toggleImageSelection(relativePath);
  }

  function handleWindowResize() {
    options.closeContextMenu();
    options.scheduleMarkdownInputResize();
  }

  function handleWindowPointerDown(event: PointerEvent) {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (isInsideFloatingNoteUI(target)) {
      return;
    }

    options.maybeStopEditingFromPointerDown(target);
    options.closeContextMenu();
  }

  return {
    handleNotebookClick,
    handleNotebookPointerDownCapture,
    handleWindowPointerDown,
    handleWindowResize,
  };
}
