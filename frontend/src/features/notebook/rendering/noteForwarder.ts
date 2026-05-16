import type {
  NoteDocument,
  NoteImage,
} from "../services/notebookStorage";
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
    };

export function forwardNoteDocumentToBlocks(
  document: NoteDocument,
): NoteRenderBlock[] {
  const blocks: NoteRenderBlock[] = [];
  const markdown = normalizeMarkdown(document.markdown);
  const referencedPaths = collectReferencedImagePaths(markdown);

  if (markdown !== "") {
    blocks.push({
      id: "markdown",
      kind: "markdown",
      html: renderMarkdownToHtml(markdown, document.images),
    });
  }

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
