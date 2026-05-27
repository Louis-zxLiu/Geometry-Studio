export type NoteImageDragData = {
  blockId?: string;
  endIndex?: number;
  relativePath: string;
  source: "note";
  startIndex?: number;
};

const noteImageDragMime = "application/x-plotkitycat-note-image";

export function hasNoteImageDragData(dataTransfer: DataTransfer | null | undefined) {
  return Array.from(dataTransfer?.types ?? []).includes(noteImageDragMime);
}

export function readNoteImageDragData(
  dataTransfer: DataTransfer | null | undefined,
): NoteImageDragData | null {
  if (!dataTransfer) {
    return null;
  }

  const encoded = dataTransfer.getData(noteImageDragMime);
  if (!encoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(encoded) as Partial<NoteImageDragData>;
    return parsed.relativePath
      ? {
          blockId: parsed.blockId,
          endIndex: parsed.endIndex,
          relativePath: parsed.relativePath,
          source: "note",
          startIndex: parsed.startIndex,
        }
      : null;
  } catch {
    return null;
  }
}

export function writeNoteImageDragData(
  dataTransfer: DataTransfer | null | undefined,
  data: NoteImageDragData,
) {
  if (!dataTransfer) {
    return;
  }

  // 只写自定义 MIME，不写 text/plain，避免浏览器触发原生图片拖拽通道
  dataTransfer.setData(noteImageDragMime, JSON.stringify(data));
}
