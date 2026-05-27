import type {
  NoteDocument,
  NoteImage,
} from "../services/notebookStorage";
import type { DesignCard } from "../../designCard/services/designCardTypes";
import { renderMarkdownToHtml } from "./markdownRenderer";

export type NoteRenderBlock =
  | {
      endIndex: number;
      id: string;
      kind: "markdown";
      markdown: string;
      html: string;
      startIndex: number;
    }
  | {
      endIndex: number;
      id: string;
      kind: "image";
      image: NoteImage;
      startIndex: number;
    }
  | {
      card: DesignCard | null;
      cardId: string;
      displayIndex: number;
      endIndex: number;
      id: string;
      kind: "design-card";
      startIndex: number;
    };

export function forwardNoteDocumentToBlocks(
  document: NoteDocument,
  designCards: DesignCard[] = [],
): NoteRenderBlock[] {
  const blocks: NoteRenderBlock[] = [];
  const markdown = normalizeMarkdown(document.markdown);
  const cardMap = new Map(designCards.map((card) => [card.id, card]));
  const cardIndex = new Map(designCards.map((card, index) => [card.id, index + 1]));
  const imageMap = new Map(document.images.map((image) => [image.relativePath, image]));
  const markdownSegments = splitMarkdownBlocks(markdown, imageMap);

  markdownSegments.forEach((segment, index) => {
    if (segment.kind === "markdown") {
      if (segment.markdown.trim() !== "") {
        blocks.push({
          endIndex: segment.endIndex,
          id: `markdown-${index}`,
          kind: "markdown",
          markdown: segment.markdown,
          html: renderMarkdownToHtml(segment.markdown, document.images),
          startIndex: segment.startIndex,
        });
      }
      return;
    }

    if (segment.kind === "image") {
      blocks.push({
        endIndex: segment.endIndex,
        id: `image-${segment.image.relativePath}-${index}`,
        kind: "image",
        image: segment.image,
        startIndex: segment.startIndex,
      });
      return;
    }

    blocks.push({
      card: cardMap.get(segment.cardId) ?? null,
      cardId: segment.cardId,
      displayIndex: cardIndex.get(segment.cardId) ?? 0,
      endIndex: segment.endIndex,
      id: `design-card-${segment.cardId}-${index}`,
      kind: "design-card",
      startIndex: segment.startIndex,
    });
  });

  return blocks;
}

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, "\n");
}

function splitMarkdownBlocks(markdown: string, imageMap: Map<string, NoteImage>) {
  const segments: Array<
    | { endIndex: number; kind: "markdown"; markdown: string; startIndex: number }
    | { endIndex: number; image: NoteImage; kind: "image"; startIndex: number }
    | { cardId: string; endIndex: number; kind: "design-card"; startIndex: number }
  > = [];
  const blockMatches = collectBlockMatches(markdown, imageMap);

  let cursor = 0;
  for (const match of blockMatches) {
    const matchIndex = match.startIndex;
    const before = markdown.slice(cursor, matchIndex);
    if (before) {
      segments.push({
        endIndex: matchIndex,
        kind: "markdown",
        markdown: before,
        startIndex: cursor,
      });
    }

    if (match.kind === "image") {
      segments.push({
        endIndex: match.endIndex,
        image: match.image,
        kind: "image",
        startIndex: match.startIndex,
      });
    } else {
      segments.push({
        cardId: match.cardId,
        endIndex: match.endIndex,
        kind: "design-card",
        startIndex: match.startIndex,
      });
    }
    cursor = match.endIndex;
  }

  const after = markdown.slice(cursor);
  if (after) {
    segments.push({
      endIndex: markdown.length,
      kind: "markdown",
      markdown: after,
      startIndex: cursor,
    });
  }

  return segments;
}

function collectBlockMatches(markdown: string, imageMap: Map<string, NoteImage>) {
  const matches: Array<
    | { cardId: string; endIndex: number; kind: "design-card"; startIndex: number }
    | { endIndex: number; image: NoteImage; kind: "image"; startIndex: number }
  > = [];

  const cardPattern = /:::design-card\{id="([^"]+)"\}/g;
  for (const match of markdown.matchAll(cardPattern)) {
    const startIndex = match.index ?? 0;
    matches.push({
      cardId: match[1],
      endIndex: startIndex + match[0].length,
      kind: "design-card",
      startIndex,
    });
  }

  const imagePattern = /!\[[^\]]*]\((?:<([^>]+)>|([^)]+?))(?:\s+"[^"]*")?\)/g;
  for (const match of markdown.matchAll(imagePattern)) {
    const path = (match[1] ?? match[2] ?? "").trim();
    const image = imageMap.get(path);
    if (!image) {
      continue;
    }

    const startIndex = match.index ?? 0;
    matches.push({
      endIndex: startIndex + match[0].length,
      image,
      kind: "image",
      startIndex,
    });
  }

  return matches.sort((left, right) => left.startIndex - right.startIndex);
}
