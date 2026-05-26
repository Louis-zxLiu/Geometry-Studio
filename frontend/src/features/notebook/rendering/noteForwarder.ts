import type {
  NoteDocument,
  NoteImage,
} from "../services/notebookStorage";
import type { DesignCard } from "../../designCard/services/designCardTypes";
import { extractDesignCardReferenceIDs } from "../../designCard/services/designCardMarkdownCodec";
import { renderMarkdownToHtml } from "./markdownRenderer";

export type NoteRenderBlock =
  | {
      endIndex: number;
      id: string;
      kind: "markdown";
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
  const referencedPaths = collectReferencedImagePaths(markdown);
  const cardMap = new Map(designCards.map((card) => [card.id, card]));
  const cardIndex = new Map(designCards.map((card, index) => [card.id, index + 1]));
  const markdownSegments = splitMarkdownByDesignCards(markdown);

  markdownSegments.forEach((segment, index) => {
    if (segment.kind === "markdown") {
      if (segment.markdown.trim() !== "") {
        blocks.push({
          endIndex: segment.endIndex,
          id: `markdown-${index}`,
          kind: "markdown",
          html: renderMarkdownToHtml(segment.markdown, document.images),
          startIndex: segment.startIndex,
        });
      }
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

  document.images.forEach((image) => {
    if (referencedPaths.has(image.relativePath)) {
      return;
    }

    blocks.push({
      endIndex: markdown.length,
      id: image.relativePath || image.name,
      kind: "image",
      image,
      startIndex: markdown.length,
    });
  });

  return blocks;
}

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, "\n");
}

function collectReferencedImagePaths(markdown: string) {
  const paths = new Set<string>();
  const matches = markdown.matchAll(/!\[[^\]]*]\((?:<([^>]+)>|([^)]+?))(?:\s+"[^"]*")?\)/g);
  for (const match of matches) {
    const path = (match[1] ?? match[2] ?? "").trim();
    if (path) {
      paths.add(path);
    }
  }

  return paths;
}

function splitMarkdownByDesignCards(markdown: string) {
  const segments: Array<
    | { endIndex: number; kind: "markdown"; markdown: string; startIndex: number }
    | { cardId: string; endIndex: number; kind: "design-card"; startIndex: number }
  > = [];
  const referenceIDs = extractDesignCardReferenceIDs(markdown);
  if (!referenceIDs.length) {
    return [{ endIndex: markdown.length, kind: "markdown" as const, markdown, startIndex: 0 }];
  }

  let cursor = 0;
  const pattern = /:::design-card\{id="([^"]+)"\}/g;
  for (const match of markdown.matchAll(pattern)) {
    const matchIndex = match.index ?? 0;
    const before = markdown.slice(cursor, matchIndex);
    if (before) {
      segments.push({
        endIndex: matchIndex,
        kind: "markdown",
        markdown: before,
        startIndex: cursor,
      });
    }

    segments.push({
      cardId: match[1],
      endIndex: matchIndex + match[0].length,
      kind: "design-card",
      startIndex: matchIndex,
    });
    cursor = matchIndex + match[0].length;
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
