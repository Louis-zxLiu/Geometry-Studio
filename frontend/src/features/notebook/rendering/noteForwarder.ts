import type {
  NoteDocument,
  NoteImage,
} from "../services/notebookStorage";
import type { DesignCard } from "../../designCard/services/designCardTypes";
import { extractDesignCardReferenceIDs } from "../../designCard/services/designCardMarkdownCodec";
import { renderMarkdownToHtml } from "./markdownRenderer";

export type NoteRenderBlock =
  | {
      id: string;
      kind: "markdown";
      html: string;
    }
  | {
      id: string;
      kind: "image";
      image: NoteImage;
    }
  | {
      card: DesignCard | null;
      cardId: string;
      id: string;
      kind: "design-card";
    };

export function forwardNoteDocumentToBlocks(
  document: NoteDocument,
  designCards: DesignCard[] = [],
): NoteRenderBlock[] {
  const blocks: NoteRenderBlock[] = [];
  const markdown = normalizeMarkdown(document.markdown);
  const referencedPaths = collectReferencedImagePaths(markdown);
  const cardMap = new Map(designCards.map((card) => [card.id, card]));
  const markdownSegments = splitMarkdownByDesignCards(markdown);

  markdownSegments.forEach((segment, index) => {
    if (segment.kind === "markdown") {
      if (segment.markdown.trim() !== "") {
        blocks.push({
          id: `markdown-${index}`,
          kind: "markdown",
          html: renderMarkdownToHtml(segment.markdown, document.images),
        });
      }
      return;
    }

    blocks.push({
      card: cardMap.get(segment.cardId) ?? null,
      cardId: segment.cardId,
      id: `design-card-${segment.cardId}-${index}`,
      kind: "design-card",
    });
  });

  document.images.forEach((image) => {
    if (referencedPaths.has(image.relativePath)) {
      return;
    }

    blocks.push({
      id: image.relativePath || image.name,
      kind: "image",
      image,
    });
  });

  return blocks;
}

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, "\n").trim();
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
    | { kind: "markdown"; markdown: string }
    | { cardId: string; kind: "design-card" }
  > = [];
  const referenceIDs = extractDesignCardReferenceIDs(markdown);
  if (!referenceIDs.length) {
    return [{ kind: "markdown" as const, markdown }];
  }

  let cursor = 0;
  const pattern = /:::design-card\{id="([^"]+)"\}/g;
  for (const match of markdown.matchAll(pattern)) {
    const matchIndex = match.index ?? 0;
    const before = markdown.slice(cursor, matchIndex);
    if (before) {
      segments.push({ kind: "markdown", markdown: before });
    }

    segments.push({ cardId: match[1], kind: "design-card" });
    cursor = matchIndex + match[0].length;
  }

  const after = markdown.slice(cursor);
  if (after) {
    segments.push({ kind: "markdown", markdown: after });
  }

  return segments;
}
