import { computed, ref, type Ref } from "vue";
import type { AINoteSelectionPayload } from "../../features/ai/services/aiTypes";
import {
  buildAINoteSelectionPayload,
  collectSelectedImagesForContextMenu,
} from "../../features/notebook/selection/noteSelection";
import type { DesignCard } from "../../features/designCard/services/designCardTypes";
import type { NoteDocument } from "../../features/notebook/services/notebookStorage";

type NoteTextSelection = {
  text: string;
  selectedAt: number;
  sourceEnd?: number;
  sourceStart?: number;
};

export type NoteSourceRange = {
  end: number;
  start: number;
};

type NoteContextSelectionOptions = {
  canOpenEmptyMenu: () => boolean;
  designCards: () => DesignCard[];
  document: () => NoteDocument;
  selectedImageOrder: Ref<Record<string, number>>;
  markdownInput: Ref<HTMLTextAreaElement | null>;
  notebookRoot: Ref<HTMLElement | null>;
  ensureImageSelection: (relativePath: string) => void;
  nextSelectionOrder: () => number;
  resolveImagePathFromEventTarget: (target: EventTarget | null) => string;
};

export function useNoteContextSelection(options: NoteContextSelectionOptions) {
  const textSelection = ref<NoteTextSelection | null>(null);
  const contextMenu = ref<{ x: number; y: number } | null>(null);
  const contextMenuSourceRange = ref<NoteSourceRange | null>(null);
  const contextMenuImages = computed(() =>
    collectSelectedImagesForContextMenu(
      options.document(),
      textSelection.value,
      options.selectedImageOrder.value,
    ),
  );
  const contextMenuHasSelection = computed(() => hasSelection());
  const contextMenuCanJumpToSource = computed(() => contextMenuSourceRange.value !== null);
  const contextMenuSupportsInsert = computed(
    () => options.canOpenEmptyMenu() && !contextMenuHasSelection.value,
  );

  function handleContextMenu(event: MouseEvent) {
    const relativePath = options.resolveImagePathFromEventTarget(event.target);
    const isNotebookTarget =
      event.target instanceof Node && !!options.notebookRoot.value?.contains(event.target);
    const hasContextSelection = relativePath !== "" || isTextSelectionContextTarget(event.target);
    if (!hasContextSelection && !isNotebookTarget) {
      closeContextMenu();
      return;
    }

    event.preventDefault();
    if (relativePath) {
      options.ensureImageSelection(relativePath);
    }
    syncTextSelection();
    contextMenuSourceRange.value = getTextSelectionSourceRange();
    if (!hasSelection() && !options.canOpenEmptyMenu()) {
      closeContextMenu();
      return;
    }

    contextMenu.value = {
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handleTextSelectionChange() {
    window.requestAnimationFrame(() => {
      syncTextSelection();
    });
  }

  function buildSelectionPayload(): AINoteSelectionPayload | null {
    return buildAINoteSelectionPayload(
      options.document(),
      textSelection.value,
      options.selectedImageOrder.value,
      options.designCards(),
    );
  }

  function closeContextMenu() {
    contextMenu.value = null;
    contextMenuSourceRange.value = null;
  }

  function getContextMenuSourceRange() {
    return contextMenuSourceRange.value;
  }

  function syncTextSelection() {
    const textarea = options.markdownInput.value;
    if (textarea && document.activeElement === textarea) {
      const start = textarea.selectionStart ?? 0;
      const end = textarea.selectionEnd ?? 0;
      const nextText = textarea.value.slice(start, end).trim();
      if (nextText !== "") {
        textSelection.value = {
          text: nextText,
          selectedAt: options.nextSelectionOrder(),
          sourceStart: start,
          sourceEnd: end,
        };
        return;
      }
    }

    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      !options.notebookRoot.value?.contains(selection.anchorNode) ||
      !options.notebookRoot.value?.contains(selection.focusNode)
    ) {
      textSelection.value = null;
      return;
    }

    const nextText = selection.toString().trim();
    if (nextText === "") {
      textSelection.value = null;
      return;
    }

    textSelection.value = {
      text: nextText,
      selectedAt: options.nextSelectionOrder(),
      ...resolveRenderedSelectionSourceRange(selection, nextText),
    };
  }

  function getTextSelectionSourceRange(): NoteSourceRange | null {
    const start = textSelection.value?.sourceStart;
    const end = textSelection.value?.sourceEnd;
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end)
    ) {
      return null;
    }

    return {
      start: Math.max(0, Math.min(start, end)),
      end: Math.max(0, Math.max(start, end)),
    };
  }

  function resolveRenderedSelectionSourceRange(
    selection: Selection,
    selectedText: string,
  ): Pick<NoteTextSelection, "sourceStart" | "sourceEnd"> {
    if (selection.rangeCount === 0) {
      return {};
    }

    const range = selection.getRangeAt(0);
    const startBlock = resolveSourceBlock(range.startContainer);
    const endBlock = resolveSourceBlock(range.endContainer);
    const startRange = readSourceRange(startBlock);
    const endRange = readSourceRange(endBlock);
    if (!startRange || !endRange) {
      return {};
    }

    const sourceStart = Math.min(startRange.start, endRange.start);
    const sourceEnd = Math.max(startRange.end, endRange.end);
    if (startBlock && startBlock === endBlock) {
      const raw = options.document().markdown.slice(sourceStart, sourceEnd);
      const matchedRange = findSourceRangeForRenderedText(raw, selectedText);
      if (matchedRange) {
        return {
          sourceStart: sourceStart + matchedRange.start,
          sourceEnd: sourceStart + matchedRange.end,
        };
      }

      return {};
    }

    return { sourceStart, sourceEnd };
  }

  function findSourceRangeForRenderedText(source: string, selectedText: string) {
    const trimmedText = selectedText.trim();
    if (!trimmedText) {
      return null;
    }

    const directIndex = source.indexOf(trimmedText);
    if (directIndex >= 0) {
      return {
        start: directIndex,
        end: directIndex + trimmedText.length,
      };
    }

    const sourceTextMap = normalizeTextMap(buildMarkdownPlainTextMap(source));
    const queryMap = normalizeTextMap({
      sourceOffsets: Array.from({ length: trimmedText.length }, (_, index) => index),
      text: trimmedText,
    });
    if (!sourceTextMap.text || !queryMap.text) {
      return null;
    }

    const normalizedIndex = sourceTextMap.text.indexOf(queryMap.text);
    if (normalizedIndex < 0) {
      return null;
    }

    const firstSourceOffset = sourceTextMap.sourceOffsets[normalizedIndex];
    const lastSourceOffset = sourceTextMap.sourceOffsets[normalizedIndex + queryMap.text.length - 1];
    if (!Number.isFinite(firstSourceOffset) || !Number.isFinite(lastSourceOffset)) {
      return null;
    }

    return {
      start: firstSourceOffset,
      end: lastSourceOffset + 1,
    };
  }

  function buildMarkdownPlainTextMap(source: string) {
    const text: string[] = [];
    const sourceOffsets: number[] = [];
    const lines = source.split(/(\r?\n)/);
    let offset = 0;

    for (const part of lines) {
      if (part === "\n" || part === "\r\n") {
        text.push("\n");
        sourceOffsets.push(offset);
        offset += part.length;
        continue;
      }

      const lineStartOffset = offset;
      let index = getMarkdownLineContentStart(part);
      while (index < part.length) {
        const link = readMarkdownLink(part, index);
        if (link) {
          for (let labelIndex = 0; labelIndex < link.label.length; labelIndex += 1) {
            text.push(link.label[labelIndex]);
            sourceOffsets.push(lineStartOffset + link.labelStart + labelIndex);
          }
          index = link.end;
          continue;
        }

        const skipped = markdownDelimiterLength(part, index);
        if (skipped > 0) {
          index += skipped;
          continue;
        }

        text.push(part[index]);
        sourceOffsets.push(lineStartOffset + index);
        index += 1;
      }

      offset += part.length;
    }

    return {
      text: text.join(""),
      sourceOffsets,
    };
  }

  function getMarkdownLineContentStart(line: string) {
    const match = line.match(/^\s*(?:(?:#{1,6}|[-*+]|\d+[.)]|>)\s+)+/);
    return match?.[0].length ?? 0;
  }

  function readMarkdownLink(line: string, index: number) {
    const imagePrefix = line[index] === "!" && line[index + 1] === "[";
    const labelStart = imagePrefix ? index + 2 : index + 1;
    if (!imagePrefix && line[index] !== "[") {
      return null;
    }

    const labelEnd = line.indexOf("]", labelStart);
    if (labelEnd < 0 || line[labelEnd + 1] !== "(") {
      return null;
    }

    const targetEnd = line.indexOf(")", labelEnd + 2);
    if (targetEnd < 0) {
      return null;
    }

    return {
      end: targetEnd + 1,
      label: line.slice(labelStart, labelEnd),
      labelStart,
    };
  }

  function markdownDelimiterLength(source: string, index: number) {
    const twoCharDelimiter = source.slice(index, index + 2);
    if (
      twoCharDelimiter === "$$" ||
      twoCharDelimiter === "\\(" ||
      twoCharDelimiter === "\\)" ||
      twoCharDelimiter === "\\[" ||
      twoCharDelimiter === "\\]"
    ) {
      return 2;
    }

    const char = source[index];
    if (char === "$" || char === "*" || char === "_" || char === "`") {
      return 1;
    }

    return 0;
  }

  function normalizeTextMap(source: { sourceOffsets: number[]; text: string }) {
    const normalizedText: string[] = [];
    const normalizedOffsets: number[] = [];
    let hasPendingSpace = false;
    let pendingSpaceOffset = 0;

    for (let index = 0; index < source.text.length; index += 1) {
      const char = source.text[index];
      if (/\s/.test(char)) {
        if (normalizedText.length > 0 && !hasPendingSpace) {
          hasPendingSpace = true;
          pendingSpaceOffset = source.sourceOffsets[index] ?? 0;
        }
        continue;
      }

      if (hasPendingSpace) {
        normalizedText.push(" ");
        normalizedOffsets.push(pendingSpaceOffset);
        hasPendingSpace = false;
      }

      normalizedText.push(char);
      normalizedOffsets.push(source.sourceOffsets[index] ?? 0);
    }

    if (normalizedText[normalizedText.length - 1] === " ") {
      normalizedText.pop();
      normalizedOffsets.pop();
    }

    return {
      text: normalizedText.join(""),
      sourceOffsets: normalizedOffsets,
    };
  }

  function resolveSourceBlock(node: Node | null) {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest<HTMLElement>("[data-note-insert-before][data-note-insert-after]") ?? null;
  }

  function readSourceRange(block: HTMLElement | null) {
    const start = Number(block?.dataset.noteInsertBefore);
    const end = Number(block?.dataset.noteInsertAfter);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return null;
    }

    return { start, end };
  }

  function isTextSelectionContextTarget(target: EventTarget | null) {
    const textarea = options.markdownInput.value;
    if (
      textarea &&
      document.activeElement === textarea &&
      textarea.selectionStart !== textarea.selectionEnd &&
      target === textarea
    ) {
      return true;
    }

    if (!(target instanceof Node)) {
      return false;
    }

    const selection = window.getSelection();
    if (
      !selection ||
      selection.isCollapsed ||
      !options.notebookRoot.value?.contains(selection.anchorNode) ||
      !options.notebookRoot.value?.contains(selection.focusNode)
    ) {
      return false;
    }

    try {
      return selection.getRangeAt(0).intersectsNode(target);
    } catch {
      return false;
    }
  }

  function hasSelection() {
    return buildSelectionPayload() !== null;
  }

  return {
    buildSelectionPayload,
    closeContextMenu,
    contextMenu,
    contextMenuCanJumpToSource,
    contextMenuHasSelection,
    contextMenuImages,
    contextMenuSupportsInsert,
    getContextMenuSourceRange,
    handleContextMenu,
    handleTextSelectionChange,
  };
}
