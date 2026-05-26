import { computed, ref, watch, type Ref } from "vue";
import type { DesignCard } from "../../designCard/services/designCardTypes";
import { formatDesignCardReference } from "../../designCard/services/designCardMarkdownCodec";
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
  type NoteImage,
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

  function insertDesignCardReference(payload: { cardId: string; insertAt?: number }) {
    if (!payload.cardId) {
      return;
    }

    updateMarkdown(insertBlockReference(
      currentDocument.value.markdown,
      formatDesignCardReference(payload.cardId),
      payload.insertAt,
    ));
  }

  async function addImages(payload: { files: File[]; insertAt?: number }) {
    const files = payload.files;
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

      const previousDocument = currentDocument.value;
      const previousPaths = new Set(previousDocument.images.map((image) => image.relativePath));
      const document = normalizeNoteDocument(
        await addScriptNoteImages(currentFile.value, nextImages),
      );
      const addedImages = document.images.filter(
        (image) => image.relativePath && !previousPaths.has(image.relativePath),
      );
      const nextMarkdown = insertImageReferences(
        previousDocument.markdown,
        addedImages,
        payload.insertAt,
      );
      currentDocument.value = {
        ...document,
        markdown: nextMarkdown,
      };
      await saveScriptNote(currentFile.value, nextMarkdown);
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
      const previousMarkdown = currentDocument.value.markdown;
      const document = normalizeNoteDocument(
        await removeScriptNoteImage(currentFile.value, relativePath),
      );
      const nextMarkdown = removeImageReference(previousMarkdown, relativePath);
      currentDocument.value = {
        ...document,
        markdown: nextMarkdown,
      };
      await saveScriptNote(currentFile.value, nextMarkdown);
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
    insertDesignCardReference,
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

function insertImageReferences(markdown: string, images: NoteImage[], insertAt?: number) {
  if (!images.length) {
    return markdown;
  }

  const imageBlock = images.map(formatImageReference).join("\n\n");
  return insertBlockReference(markdown, imageBlock, insertAt);
}

function insertBlockReference(markdown: string, block: string, insertAt?: number) {
  if (!block) {
    return markdown;
  }

  if (!markdown) {
    return block;
  }

  if (typeof insertAt !== "number" || Number.isNaN(insertAt)) {
    const trimmedMarkdown = markdown.replace(/\s+$/u, "");
    return `${trimmedMarkdown}\n\n${block}`;
  }

  const normalized = markdown.replace(/\r\n/g, "\n");
  const safeIndex = Math.max(0, Math.min(insertAt, normalized.length));
  const before = normalized.slice(0, safeIndex);
  const after = normalized.slice(safeIndex);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : before.endsWith("\n\n") ? "" : before ? "\n" : "";
  const suffix = after.startsWith("\n") ? "" : after ? "\n\n" : "";
  return `${before}${prefix}${block}${suffix}${after}`;
}

function formatImageReference(image: NoteImage) {
  const alt = escapeMarkdownAltText(image.alt || stripExtension(image.name) || "image");
  return `![${alt}](<${image.relativePath}>)`;
}

function escapeMarkdownAltText(text: string) {
  return text.replace(/[\[\]\\]/g, "\\$&");
}

function removeImageReference(markdown: string, relativePath: string) {
  if (!markdown || !relativePath) {
    return markdown;
  }

  const escapedPath = escapeRegExp(relativePath);
  const imagePattern = new RegExp(
    `^\\s*!\\[[^\\]]*\\]\\((?:<${escapedPath}>|${escapedPath})(?:\\s+"[^"]*")?\\)\\s*$`,
    "u",
  );
  const filteredLines = markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !imagePattern.test(line));

  return collapseBlankLines(filteredLines.join("\n")).trim();
}

function collapseBlankLines(markdown: string) {
  return markdown.replace(/\n{3,}/g, "\n\n");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
