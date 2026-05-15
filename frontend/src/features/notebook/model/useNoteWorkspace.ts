import { computed, ref, watch, type Ref } from "vue";
import {
  addScriptNoteImages,
  getScriptNote,
  removeScriptNoteImage,
  saveScriptNote,
  type NoteDocumentLike,
} from "../../scripts/services/scriptBridgeCompat";
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

export function useNoteWorkspace(currentFile: Ref<string>, onError: ErrorHandler) {
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

  const renderBlocks = computed(() => forwardNoteDocumentToBlocks(currentDocument.value));

  const hasContent = computed(
    () =>
      currentDocument.value.markdown.trim() !== "" ||
      currentDocument.value.images.length > 0,
  );

  function hydrateFromScriptDocument(note: {
    noteMarkdown?: unknown;
    noteImages?: Array<Record<string, unknown>>;
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

  async function addImages(files: File[]) {
    if (!currentFile.value || files.length === 0) {
      return;
    }

    try {
      await persistCurrentDocument(currentFile.value);
      const nextImages = await Promise.all(
        files
          .filter((file) => file.type.startsWith("image/"))
          .map(async (file) => ({
            name: file.name,
            alt: stripExtension(file.name),
            dataUrl: await readFileAsDataUrl(file),
          })),
      );

      if (!nextImages.length) {
        return;
      }

      const document = await addScriptNoteImages(currentFile.value, nextImages);
      currentDocument.value = normalizeNoteDocument(document);
      saveState.value = "saved";
    } catch (error) {
      onError(getErrorMessage(error));
    }
  }

  async function removeImage(relativePath: string) {
    if (!currentFile.value || !relativePath) {
      return;
    }

    try {
      await persistCurrentDocument(currentFile.value);
      const document = await removeScriptNoteImage(currentFile.value, relativePath);
      currentDocument.value = normalizeNoteDocument(document);
      saveState.value = "saved";
    } catch (error) {
      onError(getErrorMessage(error));
    }
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

  return {
    addImages,
    currentDocument,
    flushPendingSave,
    hasContent,
    hydrateFromScriptDocument,
    isPanelOpen,
    removeImage,
    renderBlocks,
    saveState,
    togglePanel,
    updateMarkdown,
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
