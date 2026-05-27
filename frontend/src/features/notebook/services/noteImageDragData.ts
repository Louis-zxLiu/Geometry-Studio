export type NoteImageDragData = {
  blockId?: string;
  endIndex?: number;
  relativePath: string;
  source: "note";
  startIndex?: number;
};

const noteImageDragMime = "application/x-plotkitycat-note-image";
const noteImagePathDragMime = "application/x-plotkitycat-note-image-path";

export function hasNoteImageDragData(dataTransfer: DataTransfer | null | undefined) {
  const types = Array.from(dataTransfer?.types ?? []);
  return types.includes(noteImageDragMime) || types.includes(noteImagePathDragMime);
}

export function readNoteImageDragData(
  dataTransfer: DataTransfer | null | undefined,
): NoteImageDragData | null {
  if (!dataTransfer) {
    return null;
  }

  const encoded = dataTransfer.getData(noteImageDragMime);
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded) as Partial<NoteImageDragData>;
      if (parsed.relativePath) {
        return {
          blockId: parsed.blockId,
          endIndex: parsed.endIndex,
          relativePath: parsed.relativePath,
          source: "note",
          startIndex: parsed.startIndex,
        };
      }
    } catch {
      // Fall through to the path-only drag payload below.
    }
  }

  const relativePath =
    dataTransfer.getData(noteImagePathDragMime) || dataTransfer.getData("text/plain");
  return relativePath ? { relativePath, source: "note" } : null;
}

export function writeNoteImageDragData(
  dataTransfer: DataTransfer | null | undefined,
  data: NoteImageDragData,
) {
  if (!dataTransfer) {
    return;
  }

  dataTransfer.setData(noteImageDragMime, JSON.stringify(data));
  dataTransfer.setData(noteImagePathDragMime, data.relativePath);
  dataTransfer.setData("text/plain", data.relativePath);
}
