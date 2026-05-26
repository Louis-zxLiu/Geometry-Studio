import { computed, ref, watch, type Ref } from "vue";
import type { DesignCard } from "../../designCard/services/designCardTypes";
import {
  getScriptNote,
  saveScriptNote,
  type NoteDocumentLike,
} from "../../scripts/services/scriptBridgeCompat";
import { useNoteDesignCardReferences } from "./noteWorkspace/useNoteDesignCardReferences";
import { useNoteImages } from "./noteWorkspace/useNoteImages";
import { forwardNoteDocumentToBlocks } from "../rendering/noteForwarder";
import {
  createEmptyNoteDocument,
  createNotePanelStorage,
  normalizeNoteDocument,
  type NoteDocument,
} from "../services/notebookStorage";

type SaveState = "idle" | "saving" | "saved";
type ErrorHandler = (message: string) => void;

const saveDebounceMs = 260;

export function useNoteWorkspace(
  currentFile: Ref<string>,
  onError: ErrorHandler,
  designCards: Ref<DesignCard[]> = ref([] as DesignCard[]),
) {
  const panelStorage = createNotePanelStorage();
  const isPanelOpen = ref(panelStorage.loadPanelState());
  const currentDocument = ref<NoteDocument>(createEmptyNoteDocument());
  const saveState = ref<SaveState>("idle");

  let saveTimer = 0;
  let loadingToken = 0;

  watch(
    currentFile,
    (filename, previousFilename) => {
      void flushPendingSave(previousFilename);
      if (!filename) {
        currentDocument.value = createEmptyNoteDocument();
        saveState.value = "idle";
        return;
      }

      const token = ++loadingToken;
      saveState.value = "idle";
      void loadRemoteNote(filename, token);
    },
    { immediate: true },
  );

  const renderBlocks = computed(() =>
    forwardNoteDocumentToBlocks(currentDocument.value, designCards.value),
  );

  const hasContent = computed(
    () =>
      currentDocument.value.markdown.trim() !== "" ||
      currentDocument.value.images.length > 0,
  );

  function hydrateFromScriptDocument(note: {
    noteMarkdown?: unknown;
    noteImages?: unknown;
  }) {
    void flushPendingSave(currentFile.value);
    currentDocument.value = normalizeNoteDocument({
      markdown:
        typeof note.noteMarkdown === "string" ? note.noteMarkdown : currentDocument.value.markdown,
      images: Array.isArray(note.noteImages) ? note.noteImages : currentDocument.value.images,
    });
    saveState.value = "idle";
  }

  function updateMarkdown(markdown: string) {
    currentDocument.value = {
      ...currentDocument.value,
      markdown,
    };
    schedulePersist();
  }

  function togglePanel() {
    isPanelOpen.value = !isPanelOpen.value;
    panelStorage.savePanelState(isPanelOpen.value);
  }

  function schedulePersist() {
    if (!currentFile.value) {
      return;
    }

    saveState.value = "saving";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void persistCurrentDocument();
    }, saveDebounceMs);
  }

  async function flushPendingSave(sceneName = currentFile.value) {
    if (!saveTimer) {
      return;
    }

    window.clearTimeout(saveTimer);
    saveTimer = 0;
    await persistCurrentDocument(sceneName);
  }

  async function persistCurrentDocument(sceneName = currentFile.value) {
    if (!sceneName) {
      saveState.value = "idle";
      return;
    }

    try {
      await saveScriptNote(sceneName, currentDocument.value.markdown);
      saveState.value = "saved";
    } catch (error) {
      saveState.value = "idle";
      onError(getErrorMessage(error));
    } finally {
      saveTimer = 0;
    }
  }

  async function loadRemoteNote(filename: string, token: number) {
    try {
      const document = await getScriptNote(filename);
      if (token !== loadingToken) {
        return;
      }

      currentDocument.value = normalizeNoteDocument(document as NoteDocumentLike);
    } catch (error) {
      if (token !== loadingToken) {
        return;
      }

      currentDocument.value = createEmptyNoteDocument();
      onError(getErrorMessage(error));
    }
  }

  const { insertDesignCardReference } = useNoteDesignCardReferences({
    currentDocument,
    updateMarkdown,
  });
  const { addImages, removeImage } = useNoteImages({
    currentDocument,
    currentFile,
    onError,
    persistCurrentDocument,
    saveState,
  });

  return {
    addImages,
    currentDocument,
    flushPendingSave,
    hasContent,
    hydrateFromScriptDocument,
    insertDesignCardReference,
    isPanelOpen,
    removeImage,
    renderBlocks,
    saveState,
    togglePanel,
    updateMarkdown,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
