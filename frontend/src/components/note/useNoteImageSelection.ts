import { computed, ref, type Ref } from "vue";
import type { NoteDocument } from "../../features/notebook/services/notebookStorage";

export function useNoteImageSelection(document: () => NoteDocument, nextSelectionOrder: () => number) {
  const selectedImageOrder = ref<Record<string, number>>({});
  const selectedImagePaths = computed(
    () => new Set(Object.keys(selectedImageOrder.value)),
  );

  function toggleImageSelection(relativePath: string) {
    if (!relativePath) {
      return;
    }

    if (selectedImageOrder.value[relativePath]) {
      const nextOrder = { ...selectedImageOrder.value };
      delete nextOrder[relativePath];
      selectedImageOrder.value = nextOrder;
      return;
    }

    selectedImageOrder.value = {
      ...selectedImageOrder.value,
      [relativePath]: nextSelectionOrder(),
    };
  }

  function ensureImageSelection(relativePath: string) {
    if (!relativePath || selectedImageOrder.value[relativePath]) {
      return;
    }

    selectedImageOrder.value = {
      ...selectedImageOrder.value,
      [relativePath]: nextSelectionOrder(),
    };
  }

  function clearImageSelection() {
    selectedImageOrder.value = {};
  }

  function clearUnavailableImageSelections() {
    const availablePaths = new Set(
      document().images.map((image) => image.relativePath),
    );
    const nextSelection: Record<string, number> = {};
    Object.entries(selectedImageOrder.value).forEach(([relativePath, selectedAt]) => {
      if (availablePaths.has(relativePath)) {
        nextSelection[relativePath] = selectedAt;
      }
    });
    selectedImageOrder.value = nextSelection;
  }

  return {
    clearImageSelection,
    clearUnavailableImageSelections,
    ensureImageSelection,
    selectedImageOrder: selectedImageOrder as Ref<Record<string, number>>,
    selectedImagePaths,
    toggleImageSelection,
  };
}
