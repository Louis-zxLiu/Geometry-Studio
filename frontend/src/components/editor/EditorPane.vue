<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useDropTargetController } from "../../features/designCard/services/useDropTargetController";
import type { DesignCard, DesignCardPlacement } from "../../features/designCard/services/designCardTypes";
import { useCodeMirrorEditor } from "./useCodeMirrorEditor";
import { useEditorAutoScroll } from "./useEditorAutoScroll";
import { useEditorDesignCardDecorations } from "./useEditorDesignCardDecorations";
import { useEditorDesignCardDrop } from "./useEditorDesignCardDrop";
import { useEditorViewportAnchor } from "./useEditorViewportAnchor";

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
const isDesignCardDraggingOver = ref(false);
const normalizedCode = computed(() =>
  typeof props.code === "string" ? props.code : String(props.code ?? ""),
);

let resizeObserver: ResizeObserver | null = null;

const editor = useCodeMirrorEditor({
  editorRoot,
  normalizedCode,
  disabled: () => props.disabled,
  onAIOptimize: (position) => emit("ai-optimize", position),
  onCodeChange: (code) => emit("update:code", code),
  onEditorActivity: () => viewportAnchor.scheduleAnchorLineUpdate(),
  shouldIgnoreContextMenu: (target) =>
    target instanceof Element && Boolean(target.closest(".design-card-inline-block")),
});

const viewportAnchor = useEditorViewportAnchor({
  editorView: editor.editorView,
  onAnchorLine: (line) => emit("design-card-anchor-line", line),
});

const cardDecorations = useEditorDesignCardDecorations({
  editorView: editor.editorView,
  normalizedCode,
  getDesignCards: () => props.designCards,
  getDesignCardPlacements: () => props.designCardPlacements,
  getAnimatedLineRanges: () => props.animatedLineRanges,
  getAnimationKey: () => props.animationKey,
  getIsStreaming: () => props.isStreaming,
  onDeleteCard: (cardId) => emit("delete-design-card", cardId),
  onMoveCard: (payload) => emit("move-design-card", payload),
  onOpenCard: (cardId) => emit("open-design-card", cardId),
});

const autoScroll = useEditorAutoScroll({
  editorView: editor.editorView,
  isDraggingOver: isDesignCardDraggingOver,
  onScrolled: viewportAnchor.scheduleAnchorLineUpdate,
});

const designCardDrop = useEditorDesignCardDrop({
  editorView: editor.editorView,
  isDraggingOver: isDesignCardDraggingOver,
  getViewportAnchorLine: viewportAnchor.getViewportAnchorLine,
  onPlaceCard: (payload) => emit("place-design-card", payload),
  onUpdateAutoScroll: autoScroll.updateDesignCardAutoScroll,
  onStopAutoScroll: autoScroll.stopDesignCardAutoScroll,
});

useDropTargetController({
  host: editorRoot,
  onDragLeave: designCardDrop.handleDragLeave,
  onDragOver: designCardDrop.handleHostDragOver,
  onDrop: designCardDrop.handleHostDrop,
  onGlobalDragEnd: designCardDrop.clearDesignCardDragOver,
  onGlobalDrop: designCardDrop.clearDesignCardDragOver,
});

onMounted(() => {
  const view = editor.mountEditor({
    cardDecorations: cardDecorations.cardDecorations,
    buildDecorations: cardDecorations.buildDecorations,
  });
  if (!view || !editorRoot.value) {
    return;
  }

  cardDecorations.updateCardViewportWidth(view);
  resizeObserver = new ResizeObserver(() => cardDecorations.updateCardViewportWidth(view));
  resizeObserver.observe(editorRoot.value);
  window.addEventListener("wheel", autoScroll.handleDesignCardDragWheel, autoScroll.wheelListenerOptions);
  viewportAnchor.scheduleAnchorLineUpdate();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener("wheel", autoScroll.handleDesignCardDragWheel, autoScroll.wheelListenerOptions);
  autoScroll.stopDesignCardAutoScroll();
  viewportAnchor.cancelAnchorLineUpdate();
  editor.destroyEditor();
});

watch(normalizedCode, (code) => {
  if (editor.syncExternalCode(code)) {
    viewportAnchor.scheduleAnchorLineUpdate();
  }
});

watch(
  () => props.disabled,
  () => editor.syncDisabled(),
);

watch(
  () => [
    props.designCards,
    props.designCardPlacements,
    props.animatedLineRanges,
    props.animationKey,
    props.isStreaming,
  ],
  cardDecorations.reconfigureDecorations,
  { deep: true },
);
</script>

<template>
  <section
    class="editor-panel"
    :class="{ disabled: disabled, streaming: isStreaming, 'dragging-design-card': isDesignCardDraggingOver }"
  >
    <div ref="editorRoot" class="code-editor-surface" />
  </section>
</template>
