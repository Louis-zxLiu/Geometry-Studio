<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import {
  Compartment,
  Decoration,
  DecorationSet,
  EditorView,
  EditorState,
  defaultKeymap,
  drawSelection,
  dropCursor,
  history,
  historyKeymap,
  highlightActiveLine,
  highlightSpecialChars,
  indentUnit,
  indentWithTab,
  keymap,
  lineNumbers,
  python,
  rectangularSelection,
} from "../lib/codemirror";
import {
  hasDesignCardDragData,
  readDesignCardDragData,
} from "../features/designCard/services/designCardDragData";
import type { DesignCard, DesignCardPlacement } from "../features/designCard/services/designCardTypes";
import { DesignCardCodeWidget } from "./editor/DesignCardCodeWidget";
import { editorTheme } from "./editor/codeMirrorTheme";
import { pythonTokenHighlight } from "./editor/pythonTokenHighlight";

const props = defineProps<{
  code: string;
  designCards?: DesignCard[];
  designCardPlacements?: DesignCardPlacement[];
  disabled?: boolean;
  isStreaming?: boolean;
  animatedLineRanges?: Array<{ startLine: number; endLine: number }>;
  animationKey?: number;
}>();

const emit = defineEmits<{
  "ai-optimize": [position: { x: number; y: number }];
  "delete-design-card": [cardId: string];
  "design-card-anchor-line": [line: number];
  "move-design-card": [payload: { cardId: string; delta: number }];
  "open-design-card": [cardId: string];
  "place-design-card": [payload: { cardId: string; afterLine: number }];
  "update:code": [code: string];
}>();

const editorRoot = ref<HTMLElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const isDesignCardDraggingOver = ref(false);
const normalizedCode = computed(() =>
  typeof props.code === "string" ? props.code : String(props.code ?? ""),
);

const cardDecorations = new Compartment();
const editableMode = new Compartment();
let isApplyingExternalCode = false;
let anchorFrame = 0;
let cardViewportWidth = 0;
let resizeObserver: ResizeObserver | null = null;
let autoScrollFrame = 0;
let autoScrollSpeed = 0;
const wheelListenerOptions = { capture: true, passive: false } as const;

onMounted(() => {
  if (!editorRoot.value) {
    return;
  }

  const view = new EditorView({
    parent: editorRoot.value,
    state: EditorState.create({
      doc: normalizedCode.value,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        drawSelection(),
        rectangularSelection(),
        dropCursor(),
        python(),
        pythonTokenHighlight,
        indentUnit.of("    "),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        editorTheme,
        editableMode.of(EditorView.editable.of(!props.disabled)),
        cardDecorations.of(EditorView.decorations.of(buildDecorations())),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isApplyingExternalCode) {
            emit("update:code", update.state.doc.toString());
          }
          if (update.docChanged || update.selectionSet || update.viewportChanged) {
            scheduleAnchorLineUpdate();
          }
        }),
        EditorView.domEventHandlers({
          contextmenu: handleContextMenu,
          dragover: handleDragOver,
          drop: handleDrop,
        }),
        highlightActiveLine(),
      ],
    }),
  });

  editorView.value = view;
  updateCardViewportWidth(view);
  resizeObserver = new ResizeObserver(() => updateCardViewportWidth(view));
  resizeObserver.observe(editorRoot.value);
  window.addEventListener("wheel", handleDesignCardDragWheel, wheelListenerOptions);
  window.addEventListener("dragend", clearDesignCardDragOver);
  window.addEventListener("drop", clearDesignCardDragOver);
  scheduleAnchorLineUpdate();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener("wheel", handleDesignCardDragWheel, wheelListenerOptions);
  window.removeEventListener("dragend", clearDesignCardDragOver);
  window.removeEventListener("drop", clearDesignCardDragOver);
  stopDesignCardAutoScroll();
  if (anchorFrame) {
    window.cancelAnimationFrame(anchorFrame);
  }
  editorView.value?.destroy();
  editorView.value = null;
});

watch(normalizedCode, (code) => {
  const view = editorView.value;
  if (!view || view.state.doc.toString() === code) {
    return;
  }

  isApplyingExternalCode = true;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: code },
  });
  isApplyingExternalCode = false;
  scheduleAnchorLineUpdate();
});

watch(
  () => props.disabled,
  () => {
    editorView.value?.dispatch({
      effects: editableMode.reconfigure(EditorView.editable.of(!props.disabled)),
    });
  },
);

watch(
  () => [
    props.designCards,
    props.designCardPlacements,
    props.animatedLineRanges,
    props.animationKey,
    props.isStreaming,
  ],
  () => {
    editorView.value?.dispatch({
      effects: cardDecorations.reconfigure(EditorView.decorations.of(buildDecorations())),
    });
  },
  { deep: true },
);

function buildDecorations(): DecorationSet {
  const view = editorView.value;
  const doc = view?.state.doc ?? EditorState.create({ doc: normalizedCode.value }).doc;
  const decorations = [];
  const cardMap = new Map((props.designCards ?? []).map((card) => [card.id, card]));

  for (const placement of props.designCardPlacements ?? []) {
    const card = cardMap.get(placement.cardId);
    if (!card) {
      continue;
    }

    const afterLine = Math.max(
      1,
      Math.min(doc.lines, Number.isFinite(placement.afterLine) ? placement.afterLine : doc.lines),
    );
    const position = doc.line(afterLine).to;
    decorations.push(
      Decoration.widget({
        block: true,
        side: 1,
        widget: new DesignCardCodeWidget(card, {
          delete: (cardId) => emit("delete-design-card", cardId),
          move: (payload) => emit("move-design-card", payload),
          open: (cardId) => emit("open-design-card", cardId),
        }, cardViewportWidth),
      }).range(position),
    );
  }

  const animatedLines = new Set<number>();
  void props.animationKey;
  for (const range of props.animatedLineRanges ?? []) {
    for (let line = range.startLine; line <= range.endLine; line += 1) {
      animatedLines.add(line);
    }
  }

  for (const lineNumber of animatedLines) {
    if (lineNumber >= 1 && lineNumber <= doc.lines) {
      decorations.push(Decoration.line({ class: "cm-repair-revealed" }).range(doc.line(lineNumber).from));
    }
  }

  if (props.isStreaming && doc.lines > 0) {
    decorations.push(Decoration.line({ class: "cm-streaming-line" }).range(doc.line(doc.lines).from));
  }

  return Decoration.set(decorations, true);
}

function handleContextMenu(event: MouseEvent) {
  if (props.disabled) {
    return false;
  }
  if (event.target instanceof Element && event.target.closest(".design-card-inline-block")) {
    return false;
  }

  event.preventDefault();
  emit("ai-optimize", { x: event.clientX, y: event.clientY });
  return true;
}

function handleDragOver(event: DragEvent) {
  if (!hasDesignCardDragData(event.dataTransfer)) {
    return false;
  }

  event.preventDefault();
  isDesignCardDraggingOver.value = true;
  updateDesignCardAutoScroll(event);
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  return true;
}

function handleDrop(event: DragEvent, view: EditorView) {
  const dragData = readDesignCardDragData(event.dataTransfer);
  if (!dragData) {
    return false;
  }

  event.preventDefault();
  isDesignCardDraggingOver.value = false;
  stopDesignCardAutoScroll();
  const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  const afterLine = position === null ? getViewportAnchorLine(view) : view.state.doc.lineAt(position).number;
  emit("place-design-card", { cardId: dragData.cardId, afterLine });
  return true;
}

function handleDragLeave(event: DragEvent) {
  if (
    event.currentTarget instanceof HTMLElement &&
    event.relatedTarget instanceof Node &&
    event.currentTarget.contains(event.relatedTarget)
  ) {
    return;
  }

  isDesignCardDraggingOver.value = false;
  stopDesignCardAutoScroll();
}

function clearDesignCardDragOver() {
  isDesignCardDraggingOver.value = false;
  stopDesignCardAutoScroll();
}

function handleDesignCardDragWheel(event: WheelEvent) {
  const view = editorView.value;
  if (!view || !isDesignCardDraggingOver.value) {
    return;
  }

  event.preventDefault();
  view.scrollDOM.scrollTop += event.deltaY;
  view.scrollDOM.scrollLeft += event.deltaX;
  scheduleAnchorLineUpdate();
}

function updateDesignCardAutoScroll(event: DragEvent) {
  const view = editorView.value;
  if (!view) {
    return;
  }

  const bounds = view.scrollDOM.getBoundingClientRect();
  const edgeSize = Math.min(140, Math.max(72, bounds.height * 0.18));
  const distanceToTop = event.clientY - bounds.top;
  const distanceToBottom = bounds.bottom - event.clientY;
  const maxSpeed = 26;

  if (distanceToTop >= 0 && distanceToTop < edgeSize) {
    const strength = (edgeSize - distanceToTop) / edgeSize;
    autoScrollSpeed = -Math.max(5, maxSpeed * strength);
  } else if (distanceToBottom >= 0 && distanceToBottom < edgeSize) {
    const strength = (edgeSize - distanceToBottom) / edgeSize;
    autoScrollSpeed = Math.max(5, maxSpeed * strength);
  } else {
    stopDesignCardAutoScroll();
    return;
  }

  if (!autoScrollFrame) {
    autoScrollFrame = window.requestAnimationFrame(runDesignCardAutoScroll);
  }
}

function runDesignCardAutoScroll() {
  autoScrollFrame = 0;
  const view = editorView.value;
  if (!view || !isDesignCardDraggingOver.value || autoScrollSpeed === 0) {
    return;
  }

  const before = view.scrollDOM.scrollTop;
  view.scrollDOM.scrollTop += autoScrollSpeed;
  if (view.scrollDOM.scrollTop !== before) {
    scheduleAnchorLineUpdate();
  }

  autoScrollFrame = window.requestAnimationFrame(runDesignCardAutoScroll);
}

function stopDesignCardAutoScroll() {
  autoScrollSpeed = 0;
  if (autoScrollFrame) {
    window.cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = 0;
  }
}

function scheduleAnchorLineUpdate() {
  if (anchorFrame) {
    window.cancelAnimationFrame(anchorFrame);
  }

  anchorFrame = window.requestAnimationFrame(() => {
    anchorFrame = 0;
    const view = editorView.value;
    if (!view) {
      return;
    }
    emit("design-card-anchor-line", getViewportAnchorLine(view));
  });
}

function getViewportAnchorLine(view: EditorView) {
  const visible = view.visibleRanges[0];
  if (!visible) {
    return view.state.doc.lineAt(view.state.selection.main.head).number;
  }

  const middle = Math.round((visible.from + visible.to) / 2);
  return view.state.doc.lineAt(middle).number;
}

function updateCardViewportWidth(view: EditorView) {
  const gutterWidth = view.dom.querySelector(".cm-gutters")?.getBoundingClientRect().width ?? 0;
  const nextWidth = Math.max(0, Math.floor(view.scrollDOM.clientWidth - gutterWidth));
  if (Math.abs(nextWidth - cardViewportWidth) < 1) {
    return;
  }

  cardViewportWidth = nextWidth;
  view.dispatch({
    effects: cardDecorations.reconfigure(EditorView.decorations.of(buildDecorations())),
  });
}

function handleSurfaceDragOver(event: DragEvent) {
  if (!hasDesignCardDragData(event.dataTransfer)) return;
  event.preventDefault();
  isDesignCardDraggingOver.value = true;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function handleSurfaceDrop(event: DragEvent) {
  const dragData = readDesignCardDragData(event.dataTransfer);
  if (!dragData) return;
  if (event.target instanceof Element && event.target.closest(".cm-content, .cm-editor")) return;
  event.preventDefault();
  isDesignCardDraggingOver.value = false;
  const view = editorView.value;
  if (!view) return;
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  const afterLine = pos === null ? getViewportAnchorLine(view) : view.state.doc.lineAt(pos).number;
  emit("place-design-card", { cardId: dragData.cardId, afterLine });
}

</script>

<template>
  <section
    class="editor-panel"
    :class="{ disabled: disabled, streaming: isStreaming, 'dragging-design-card': isDesignCardDraggingOver }"
    @dragleave="handleDragLeave"
  >
    <div
      ref="editorRoot"
      class="code-editor-surface"
      @dragover="handleSurfaceDragOver"
      @drop="handleSurfaceDrop"
    />
  </section>
</template>
