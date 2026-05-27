import type { Ref } from "vue";
import { getErrorMessage } from "../../../../lib/errors";
import {
  addScriptNoteImages,
  removeScriptNoteImage,
  saveScriptNote,
} from "../../../scripts/services/scriptBridgeCompat";
import {
  normalizeNoteDocument,
  type NoteDocument,
  type NoteImage,
} from "../../services/notebookStorage";
import { collapseBlankLines, escapeRegExp, insertBlockReference } from "./noteMarkdownBlocks";

type SaveState = "idle" | "saving" | "saved";

type NoteImagesOptions = {
  currentDocument: Ref<NoteDocument>;
  currentFile: Ref<string>;
  onError: (message: string) => void;
  persistCurrentDocument: (sceneName?: string) => Promise<void>;
  saveState: Ref<SaveState>;
};

export function useNoteImages(options: NoteImagesOptions) {
  async function addImages(payload: { files: File[]; insertAt?: number }) {
    const files = payload.files;
    if (!options.currentFile.value || files.length === 0) {
      return;
    }

    try {
      await options.persistCurrentDocument(options.currentFile.value);
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

      const previousDocument = options.currentDocument.value;
      const previousPaths = new Set(previousDocument.images.map((image) => image.relativePath));
      const document = normalizeNoteDocument(
        await addScriptNoteImages(options.currentFile.value, nextImages),
      );
      const addedImages = document.images.filter(
        (image) => image.relativePath && !previousPaths.has(image.relativePath),
      );
      const nextMarkdown = insertImageReferences(
        previousDocument.markdown,
        addedImages,
        payload.insertAt,
      );
      options.currentDocument.value = {
        ...document,
        markdown: nextMarkdown,
      };
      await saveScriptNote(options.currentFile.value, nextMarkdown);
      options.saveState.value = "saved";
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  async function removeImage(relativePath: string) {
    if (!options.currentFile.value || !relativePath) {
      return;
    }

    try {
      await options.persistCurrentDocument(options.currentFile.value);
      const previousMarkdown = options.currentDocument.value.markdown;
      const document = normalizeNoteDocument(
        await removeScriptNoteImage(options.currentFile.value, relativePath),
      );
      const nextMarkdown = removeImageReference(previousMarkdown, relativePath);
      options.currentDocument.value = {
        ...document,
        markdown: nextMarkdown,
      };
      await saveScriptNote(options.currentFile.value, nextMarkdown);
      options.saveState.value = "saved";
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  async function moveImage(payload: {
    edge?: "before" | "after";
    endIndex?: number;
    insertAt: number;
    relativePath: string;
    sourceBlockId?: string;
    startIndex?: number;
    targetBlockId?: string;
  }) {
    if (!options.currentFile.value || !payload.relativePath) {
      return;
    }

    try {
      await options.persistCurrentDocument(options.currentFile.value);
      const previousMarkdown = options.currentDocument.value.markdown;
      const nextMarkdown = moveImageReference(
        previousMarkdown,
        payload.relativePath,
        payload.insertAt,
        payload.startIndex,
        payload.endIndex,
        payload.sourceBlockId,
        payload.targetBlockId,
      );
      if (nextMarkdown === previousMarkdown) {
        return;
      }

      options.currentDocument.value = {
        ...options.currentDocument.value,
        markdown: nextMarkdown,
      };
      await saveScriptNote(options.currentFile.value, nextMarkdown);
      options.saveState.value = "saved";
    } catch (error) {
      options.onError(getErrorMessage(error));
    }
  }

  return {
    addImages,
    moveImage,
    removeImage,
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

function moveImageReference(
  markdown: string,
  relativePath: string,
  insertAt: number,
  startIndex?: number,
  endIndex?: number,
  sourceBlockId?: string,
  targetBlockId?: string,
) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const match = findImageReference(normalized, relativePath, startIndex, endIndex);
  if (!match) {
    return markdown;
  }

  if (sourceBlockId && targetBlockId && sourceBlockId === targetBlockId) {
    return markdown;
  }

  if (insertAt > match.startIndex && insertAt < match.endIndex) {
    return markdown;
  }

  const withoutReference = collapseBlankLines(removeReferenceAt(normalized, match.startIndex, match.endIndex));
  const adjustedInsertAt = insertAt > match.startIndex
    ? Math.max(0, insertAt - (match.endIndex - match.startIndex))
    : insertAt;

  return insertBlockReference(withoutReference, match.reference, adjustedInsertAt);
}

function removeReferenceAt(markdown: string, startIndex: number, endIndex: number) {
  const before = markdown.slice(0, startIndex).replace(/[ \t]*$/u, "");
  const after = markdown.slice(endIndex).replace(/^[ \t]*/u, "");

  if (!before) {
    return after.replace(/^\n{1,2}/u, "");
  }
  if (!after) {
    return before.replace(/\n{1,2}$/u, "");
  }

  const beforeBreaks = before.match(/\n+$/u)?.[0].length ?? 0;
  const afterBreaks = after.match(/^\n+/u)?.[0].length ?? 0;
  const separator = beforeBreaks > 0 || afterBreaks > 0 ? "\n\n" : "";
  return `${before.replace(/\n+$/u, "")}${separator}${after.replace(/^\n+/u, "")}`;
}

function findImageReference(
  markdown: string,
  relativePath: string,
  startIndex?: number,
  endIndex?: number,
) {
  const pathPattern = `(?:<${escapeRegExp(relativePath)}>|${escapeRegExp(relativePath)})`;
  const inlinePattern = new RegExp(`!\\[[^\\]]*\\]\\(${pathPattern}(?:\\s+"[^"]*")?\\)`, "gu");

  if (
    typeof startIndex === "number" &&
    typeof endIndex === "number" &&
    startIndex >= 0 &&
    endIndex > startIndex
  ) {
    const reference = markdown.slice(startIndex, endIndex);
    if (inlinePattern.test(reference)) {
      return {
        endIndex,
        reference: reference.trim(),
        startIndex,
      };
    }
  }

  inlinePattern.lastIndex = 0;
  const match = inlinePattern.exec(markdown);
  if (!match) {
    return null;
  }

  const start = match.index;
  return {
    endIndex: start + match[0].length,
    reference: match[0],
    startIndex: start,
  };
}
