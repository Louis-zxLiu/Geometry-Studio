import type { Ref } from "vue";
import type { NoteDropInsertionPoint } from "./useNoteDrop";

type NoteDropInsertionPointOptions = {
  getCurrentInsertionIndex: () => number;
  markdownSurface: Ref<HTMLElement | null>;
};

type CaretPoint = {
  node: Node;
  offset: number;
};

export function useNoteDropInsertionPoint(options: NoteDropInsertionPointOptions) {
  function getDropInsertionPoint(event: DragEvent): NoteDropInsertionPoint {
    const block = resolveDropBlock(event);
    if (!block) {
      return {
        blockId: "",
        edge: "after",
        insertAt: options.getCurrentInsertionIndex(),
      };
    }

    const before = Number(block.dataset.noteInsertBefore);
    const after = Number(block.dataset.noteInsertAfter);
    if (!Number.isFinite(before) || !Number.isFinite(after)) {
      return {
        blockId: "",
        edge: "after",
        insertAt: options.getCurrentInsertionIndex(),
      };
    }

    const rect = block.getBoundingClientRect();
    const edge = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    const markdownInsertionIndex = resolveMarkdownInsertionIndex(block, event, before, after);
    return {
      blockId: block.dataset.noteBlockId ?? "",
      edge,
      insertAt: markdownInsertionIndex ?? (edge === "before" ? before : after),
    };
  }

  function resolveDropBlock(event: DragEvent) {
    const root = options.markdownSurface.value;
    if (!root) {
      return null;
    }

    const blocks = Array.from(
      root.querySelectorAll<HTMLElement>("[data-note-insert-before][data-note-insert-after]"),
    );
    return findClosestBlockByPoint(blocks, event.clientX, event.clientY);
  }

  return {
    getDropInsertionPoint,
  };
}

function findClosestBlockByPoint(blocks: HTMLElement[], clientX: number, clientY: number) {
  if (!blocks.length) {
    return null;
  }

  const containingBlock = blocks.find((block) => {
    const rect = block.getBoundingClientRect();
    return clientY >= rect.top && clientY <= rect.bottom;
  });
  if (containingBlock) {
    return containingBlock;
  }

  return blocks.reduce((closest, block) => {
    const rect = block.getBoundingClientRect();
    const distance = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom;
    if (!closest || distance < closest.distance) {
      return { block, distance };
    }

    return closest;
  }, null as { block: HTMLElement; distance: number } | null)?.block ?? null;
}

function resolveMarkdownInsertionIndex(
  block: HTMLElement,
  event: DragEvent,
  startIndex: number,
  endIndex: number,
) {
  const renderedMarkdown = block.querySelector<HTMLElement>(".notebook-markdown-rendered");
  if (!renderedMarkdown) {
    return null;
  }

  const caret = getCaretPointFromClientPoint(event.clientX, event.clientY);
  if (!caret || !renderedMarkdown.contains(caret.node)) {
    return null;
  }

  const renderedOffset = getTextOffset(renderedMarkdown, caret);
  if (renderedOffset === null) {
    return null;
  }

  const sourceMarkdown = block.dataset.noteMarkdownSource ?? "";
  const localIndex = mapRenderedTextOffsetToMarkdownIndex(
    sourceMarkdown,
    renderedMarkdown.textContent ?? "",
    renderedOffset,
  );
  return clamp(startIndex + localIndex, startIndex, endIndex);
}

function getCaretPointFromClientPoint(clientX: number, clientY: number): CaretPoint | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  const position = doc.caretPositionFromPoint?.(clientX, clientY);
  if (position) {
    return {
      node: position.offsetNode,
      offset: position.offset,
    };
  }

  const range = doc.caretRangeFromPoint?.(clientX, clientY);
  if (!range) {
    return null;
  }

  return {
    node: range.startContainer,
    offset: range.startOffset,
  };
}

function getTextOffset(root: HTMLElement, caret: CaretPoint) {
  const range = document.createRange();
  try {
    range.setStart(root, 0);
    range.setEnd(caret.node, caret.offset);
    return range.toString().length;
  } catch {
    return null;
  } finally {
    range.detach();
  }
}

function mapRenderedTextOffsetToMarkdownIndex(
  markdown: string,
  renderedText: string,
  renderedOffset: number,
) {
  if (renderedOffset <= 0) {
    return 0;
  }

  let markdownIndex = 0;
  let textIndex = 0;
  while (markdownIndex < markdown.length && textIndex < renderedOffset) {
    const markdownChar = markdown[markdownIndex];
    if (isMarkdownSyntaxAt(markdown, markdownIndex)) {
      markdownIndex += 1;
      continue;
    }

    const renderedChar = renderedText[textIndex];
    if (charsMatch(markdownChar, renderedChar)) {
      markdownIndex += 1;
      textIndex += 1;
      continue;
    }

    if (/\s/u.test(markdownChar) && /\s/u.test(renderedChar ?? "")) {
      markdownIndex += 1;
      textIndex += 1;
      continue;
    }

    markdownIndex += 1;
  }

  return markdownIndex;
}

function isMarkdownSyntaxAt(markdown: string, index: number) {
  return /[*_`>#\-[\]()!]/u.test(markdown[index]);
}

function charsMatch(left: string, right: string | undefined) {
  return right !== undefined && left === right;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}
