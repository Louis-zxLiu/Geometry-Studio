import type { DesignCard } from "./designCardTypes";

const referencePattern = /:::design-card\{id="([^"]+)"\}/g;
const placeholderPattern = /^\[design-card-(\d{2,})]$/;

export function formatDesignCardReference(cardId: string) {
  return `:::design-card{id="${cardId}"}`;
}

export function extractDesignCardReferenceIDs(markdown: string) {
  return Array.from(markdown.matchAll(referencePattern), (match) => match[1]).filter(Boolean);
}

export function toEditableDesignCardMarkdown(markdown: string, cards: DesignCard[]) {
  const cardIndex = createCardIndex(cards);
  return markdown.replace(referencePattern, (_match, cardId: string) =>
    formatDesignCardPlaceholder(cardIndex.get(cardId) ?? 0),
  );
}

export function fromEditableDesignCardMarkdown(markdown: string, cards: DesignCard[]) {
  const cardsByDisplayIndex = createCardsByDisplayIndex(cards);
  return markdown
    .replace(/\[design-card-(\d{2,})]/g, (match, rawIndex: string) => {
      const card = cardsByDisplayIndex.get(Number(rawIndex));
      return card ? formatDesignCardReference(card.id) : match;
    });
}

export function formatDesignCardPlaceholder(index: number) {
  return `[design-card-${String(Math.max(1, index)).padStart(2, "0")}]`;
}

export function parseDesignCardPlaceholder(line: string) {
  const match = line.trim().match(placeholderPattern);
  return match ? Number(match[1]) : 0;
}

function createCardIndex(cards: DesignCard[]) {
  return new Map(cards.map((card, index) => [card.id, index + 1]));
}

function createCardsByDisplayIndex(cards: DesignCard[]) {
  return new Map(cards.map((card, index) => [index + 1, card]));
}
