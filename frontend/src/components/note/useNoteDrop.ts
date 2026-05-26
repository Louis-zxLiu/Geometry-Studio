import { ref } from "vue";
import { readDesignCardDragData } from "../../features/designCard/services/designCardDragData";

type NoteDropOptions = {
  getCurrentInsertionIndex: () => number;
  getDropInsertionIndex: (event: DragEvent) => number;
  onAddImages: (payload: { files: File[]; insertAt: number }) => void;
  onInsertDesignCard: (payload: { cardId: string; insertAt: number; source?: "editor" | "note" }) => void;
};

export function useNoteDrop(options: NoteDropOptions) {
  const isDragging = ref(false);

  function pickImages(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target.files?.length) {
      return;
    }

    options.onAddImages({
      files: Array.from(target.files),
      insertAt: options.getCurrentInsertionIndex(),
    });
    target.value = "";
  }

  function handlePaste(event: ClipboardEvent) {
    const items = Array.from(event.clipboardData?.items ?? []);
    const files = items
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file instanceof File);

    if (!files.length) {
      return;
    }

    event.preventDefault();
    options.onAddImages({
      files,
      insertAt: options.getCurrentInsertionIndex(),
    });
  }

  function handleDrop(event: DragEvent) {
    isDragging.value = false;
    const designCardDragData = readDesignCardDragData(event.dataTransfer);
    if (designCardDragData) {
      event.preventDefault();
      options.onInsertDesignCard({
        cardId: designCardDragData.cardId,
        insertAt: options.getDropInsertionIndex(event),
        source: designCardDragData.source,
      });
      return;
    }

    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!files.length) {
      return;
    }

    event.preventDefault();
    options.onAddImages({
      files,
      insertAt: options.getDropInsertionIndex(event),
    });
  }

  function setDragging(nextValue: boolean) {
    isDragging.value = nextValue;
  }

  return {
    handleDrop,
    handlePaste,
    isDragging,
    pickImages,
    setDragging,
  };
}
