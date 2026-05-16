import type {
  AINoteSelectionItem,
  AINoteSelectionPayload,
} from "../../ai/services/aiTypes";
import type { NoteDocument, NoteImage } from "../services/notebookStorage";

export type OrderedTextSelection = {
  text: string;
  selectedAt: number;
};

export type OrderedImageSelection = Record<string, number>;

type OrderedSelectionItem = AINoteSelectionItem & { selectedAt: number };

export function buildAINoteSelectionPayload(
  document: NoteDocument,
  textSelection: OrderedTextSelection | null,
  selectedImageOrder: OrderedImageSelection,
): AINoteSelectionPayload | null {
  const orderedItems: OrderedSelectionItem[] = [];
  const addedImagePaths = new Set<string>();

  if (textSelection?.text) {
    const referencedImages = resolveImagesFromSelectedText(document, textSelection.text);
    if (referencedImages.length > 0) {
      referencedImages.forEach((image) => {
        addedImagePaths.add(image.relativePath);
        orderedItems.push({
          kind: "image",
          name: image.name,
          alt: image.alt,
          dataUrl: image.dataUrl,
          relativePath: image.relativePath,
          selectedAt: textSelection.selectedAt,
        });
      });
    } else {
      orderedItems.push({
        kind: "text",
        text: textSelection.text,
        selectedAt: textSelection.selectedAt,
      });
    }
  }

  document.images.forEach((image) => {
    const selectedAt = selectedImageOrder[image.relativePath];
    if (!selectedAt || addedImagePaths.has(image.relativePath)) {
      return;
    }

    orderedItems.push({
      kind: "image",
      name: image.name,
      alt: image.alt,
      dataUrl: image.dataUrl,
      relativePath: image.relativePath,
      selectedAt,
    });
  });

  orderedItems.sort((left, right) => left.selectedAt - right.selectedAt);
  if (!orderedItems.length) {
    return null;
  }

  return {
    items: orderedItems.map(({ selectedAt: _selectedAt, ...item }) => item),
  };
}

export function collectSelectedImagesForContextMenu(
  document: NoteDocument,
  textSelection: OrderedTextSelection | null,
  selectedImageOrder: OrderedImageSelection,
): NoteImage[] {
  const images: Array<NoteImage & { selectedAt: number }> = [];
  const addedPaths = new Set<string>();

  if (textSelection?.text) {
    resolveImagesFromSelectedText(document, textSelection.text).forEach((image) => {
      if (addedPaths.has(image.relativePath)) {
        return;
      }

      images.push({ ...image, selectedAt: textSelection.selectedAt });
      addedPaths.add(image.relativePath);
    });
  }

  document.images.forEach((image) => {
    const selectedAt = selectedImageOrder[image.relativePath];
    if (!selectedAt || addedPaths.has(image.relativePath)) {
      return;
    }

    images.push({ ...image, selectedAt });
    addedPaths.add(image.relativePath);
  });

  images.sort((left, right) => left.selectedAt - right.selectedAt);
  return images.map(({ selectedAt: _selectedAt, ...image }) => image);
}

export function resolveImagesFromSelectedText(document: NoteDocument, text: string): NoteImage[] {
  const paths = extractImagePathsFromSelection(text);
  if (!paths.length) {
    return [];
  }

  const imagesByPath = new Map(
    document.images.map((image) => [normalizeImageReferencePath(image.relativePath), image]),
  );
  const images: NoteImage[] = [];
  const addedPaths = new Set<string>();

  for (const path of paths) {
    const image = imagesByPath.get(normalizeImageReferencePath(path));
    if (!image || addedPaths.has(image.relativePath)) {
      continue;
    }

    images.push(image);
    addedPaths.add(image.relativePath);
  }

  return images;
}

export function extractImagePathsFromSelection(text: string): string[] {
  const paths: string[] = [];
  const markdownImagePattern = /!\[[^\]]*]\((?:<([^>]+)>|([^)]+?))(?:\s+"[^"]*")?\)/g;
  for (const match of text.matchAll(markdownImagePattern)) {
    const path = normalizeImageReferencePath(match[1] ?? match[2] ?? "");
    if (path) {
      paths.push(path);
    }
  }

  if (paths.length === 0) {
    const path = normalizeImageReferencePath(text);
    if (path) {
      paths.push(path);
    }
  }

  return paths;
}

export function normalizeImageReferencePath(path: string): string {
  return path
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "");
}
