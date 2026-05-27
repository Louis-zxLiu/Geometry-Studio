import { ref } from "vue";
import {
  hasDesignCardDragData,
  readDesignCardDragData,
} from "../../features/designCard/services/designCardDragData";
import {
  hasNoteImageDragData,
  readNoteImageDragData,
} from "../../features/notebook/services/noteImageDragData";

type NoteDropOptions = {
  getCurrentInsertionIndex: () => number;
  getDropInsertionPoint: (event: DragEvent) => NoteDropInsertionPoint;
  onAddImages: (payload: { files: File[]; insertAt: number }) => void;
  onInsertDesignCard: (payload: { cardId: string; insertAt: number; source?: "editor" | "note" }) => void;
  onMoveImage: (payload: {
    edge: NoteDropInsertionPoint["edge"];
    endIndex?: number;
    insertAt: number;
    relativePath: string;
    sourceBlockId?: string;
    startIndex?: number;
    targetBlockId: string;
  }) => void;
};

export type NoteDropInsertionPoint = {
  blockId: string;
  edge: "before" | "after";
  insertAt: number;
};

export function useNoteDrop(options: NoteDropOptions) {
  const isDragging = ref(false);
  const dropInsertionPoint = ref<NoteDropInsertionPoint | null>(null);

  function handleHostDragEnter(event: DragEvent) {
    const accepted = acceptDrop(event, "note.dragenter");
    if (!accepted) {
      return;
    }

    isDragging.value = true;
    dropInsertionPoint.value = options.getDropInsertionPoint(event);
  }

  function handleHostDragOver(event: DragEvent) {
    const accepted = acceptDrop(event, "note.dragover");
    if (!accepted) {
      return;
    }

    isDragging.value = true;
    dropInsertionPoint.value = options.getDropInsertionPoint(event);
  }

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

  function handleHostDrop(event: DragEvent) {
    isDragging.value = false;
    const insertionPoint = dropInsertionPoint.value ?? options.getDropInsertionPoint(event);
    dropInsertionPoint.value = null;
    const designCardDragData = readDesignCardDragData(event.dataTransfer);
    if (designCardDragData) {
      event.preventDefault();
      options.onInsertDesignCard({
        cardId: designCardDragData.cardId,
        insertAt: insertionPoint.insertAt,
        source: designCardDragData.source,
      });
      return;
    }

    const noteImageDragData = readNoteImageDragData(event.dataTransfer);
    if (noteImageDragData) {
      event.preventDefault();
      moveNoteImageFromDrop(event, noteImageDragData, insertionPoint, "note.drop");
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
      insertAt: insertionPoint.insertAt,
    });
  }

  function handleHostDragLeave(event: DragEvent) {
    if (
      event.currentTarget instanceof HTMLElement &&
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    isDragging.value = false;
    dropInsertionPoint.value = null;
  }

  function handleGlobalDragEnd() {
    isDragging.value = false;
    dropInsertionPoint.value = null;
  }

  function moveNoteImageFromDrop(
    event: DragEvent,
    noteImageDragData: NonNullable<ReturnType<typeof readNoteImageDragData>>,
    insertionPoint: NoteDropInsertionPoint,
    scope: string,
  ) {
    const movePayload = {
      edge: insertionPoint.edge,
      endIndex: noteImageDragData.endIndex,
      relativePath: noteImageDragData.relativePath,
      insertAt: insertionPoint.insertAt,
      sourceBlockId: noteImageDragData.blockId,
      startIndex: noteImageDragData.startIndex,
      targetBlockId: insertionPoint.blockId,
    };
    options.onMoveImage(movePayload);
  }

  function acceptDrop(event: DragEvent, scope: string) {
    if (hasDesignCardDragData(event.dataTransfer)) {
      const dragData = readDesignCardDragData(event.dataTransfer);
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      return true;
    }

    if (hasNoteImageDragData(event.dataTransfer)) {
      const dragData = readNoteImageDragData(event.dataTransfer);
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      return true;
    }

    if (hasImageFileTransfer(event.dataTransfer)) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      return true;
    }

    return false;
  }

  return {
    handleHostDragEnter,
    handleHostDragLeave,
    handleHostDragOver,
    handleHostDrop,
    handlePaste,
    dropInsertionPoint,
    isDragging,
    pickImages,
    handleGlobalDragEnd,
  };
}

function hasImageFileTransfer(dataTransfer: DataTransfer | null | undefined) {
  const items = Array.from(dataTransfer?.items ?? []);
  if (items.some((item) => item.kind === "file" && item.type.startsWith("image/"))) {
    return true;
  }

  return Array.from(dataTransfer?.files ?? []).some((file) => file.type.startsWith("image/"));
}
