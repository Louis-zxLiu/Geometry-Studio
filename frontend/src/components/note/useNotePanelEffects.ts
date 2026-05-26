import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from "vue";
import type { NoteDocument } from "../../features/notebook/services/notebookStorage";

type NotePanelEffectsOptions = {
  aiBusy: () => boolean | undefined;
  clearDesignCardDeleteTimer: () => void;
  clearUnavailableImageSelections: () => void;
  closeContextMenu: () => void;
  document: () => NoteDocument;
  handleWindowPointerDown: (event: PointerEvent) => void;
  handleWindowResize: () => void;
  isOpen: () => boolean;
  scheduleMarkdownInputResize: () => void;
  shouldShowMarkdownInput: Readonly<Ref<boolean>>;
  cancelMarkdownInputResize: () => void;
};

export function useNotePanelEffects(options: NotePanelEffectsOptions) {
  onMounted(() => {
    window.addEventListener("pointerdown", options.handleWindowPointerDown, true);
    window.addEventListener("resize", options.handleWindowResize);
    options.scheduleMarkdownInputResize();
  });

  onBeforeUnmount(() => {
    window.removeEventListener("pointerdown", options.handleWindowPointerDown, true);
    window.removeEventListener("resize", options.handleWindowResize);
    options.cancelMarkdownInputResize();
    options.clearDesignCardDeleteTimer();
  });

  watch(
    () => options.document().images,
    () => {
      options.clearUnavailableImageSelections();
    },
    { deep: true },
  );

  watch(
    options.aiBusy,
    (busy) => {
      if (busy) {
        options.closeContextMenu();
      }
    },
  );

  watch(
    () => options.document().markdown,
    () => {
      void nextTick(options.scheduleMarkdownInputResize);
    },
  );

  watch(
    () => [options.shouldShowMarkdownInput.value, options.isOpen()],
    () => {
      void nextTick(options.scheduleMarkdownInputResize);
    },
  );
}
