export type DesignCardDragSource = "editor" | "note";

export type DesignCardDragData = {
  cardId: string;
  source: DesignCardDragSource;
};

const designCardDragMime = "application/x-plotkitycat-design-card";
const legacyDesignCardDragMime = "application/x-design-card-id";

export function hasDesignCardDragData(dataTransfer: DataTransfer | null | undefined) {
  const types = Array.from(dataTransfer?.types ?? []);
  return types.includes(designCardDragMime) || types.includes(legacyDesignCardDragMime);
}

export function readDesignCardDragData(
  dataTransfer: DataTransfer | null | undefined,
): DesignCardDragData | null {
  if (!dataTransfer) {
    return null;
  }

  const encoded = dataTransfer.getData(designCardDragMime);
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded) as Partial<DesignCardDragData>;
      if (parsed.cardId && isDesignCardDragSource(parsed.source)) {
        return {
          cardId: parsed.cardId,
          source: parsed.source,
        };
      }
    } catch {
      return null;
    }
  }

  const legacyCardId = dataTransfer.getData(legacyDesignCardDragMime);
  return legacyCardId ? { cardId: legacyCardId, source: "editor" } : null;
}

export function writeDesignCardDragData(
  dataTransfer: DataTransfer | null | undefined,
  data: DesignCardDragData,
) {
  if (!dataTransfer) {
    return;
  }

  dataTransfer.setData(designCardDragMime, JSON.stringify(data));
  dataTransfer.setData(legacyDesignCardDragMime, data.cardId);
  dataTransfer.setData("text/plain", data.cardId);
}

function isDesignCardDragSource(source: unknown): source is DesignCardDragSource {
  return source === "editor" || source === "note";
}
