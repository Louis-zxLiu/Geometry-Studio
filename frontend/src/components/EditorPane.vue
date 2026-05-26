<script setup lang="ts">
import { computed, ref } from "vue";
import DesignCardInlineBlock from "../features/designCard/components/DesignCardInlineBlock.vue";
import type { DesignCard, DesignCardPlacement } from "../features/designCard/services/designCardTypes";
import { tokenizePythonLine } from "../lib/pythonHighlighter";

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
  "move-design-card": [payload: { cardId: string; delta: number }];
  "open-design-card": [cardId: string];
  "optimize-design-card": [payload: { cardId: string; position: { x: number; y: number } }];
  "place-design-card": [payload: { cardId: string; afterLine: number }];
  "update:code": [code: string];
}>();

const normalizedCode = computed(() =>
  typeof props.code === "string" ? props.code : String(props.code ?? ""),
);

const codeLines = computed(() => normalizedCode.value.split("\n"));
const highlightedLines = computed(() => codeLines.value.map(tokenizePythonLine));
const placedDesignCards = computed(() => {
  const cardMap = new Map((props.designCards ?? []).map((card) => [card.id, card]));
  return (props.designCardPlacements ?? [])
    .map((placement) => ({
      card: cardMap.get(placement.cardId),
      placement,
    }))
    .filter((item): item is { card: DesignCard; placement: DesignCardPlacement } => !!item.card)
    .sort((a, b) => a.placement.afterLine - b.placement.afterLine);
});
const animatedLines = computed(() => {
  void props.animationKey;
  const ranges = props.animatedLineRanges ?? [];
  const lines = new Set<number>();
  for (const range of ranges) {
    for (let line = range.startLine; line <= range.endLine; line += 1) {
      lines.add(line);
    }
  }

  return lines;
});
const scrollLeft = ref(0);
const scrollTop = ref(0);

function updateCode(event: Event) {
  emit("update:code", (event.target as HTMLTextAreaElement).value);
}

function syncScroll(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  scrollLeft.value = target.scrollLeft;
  scrollTop.value = target.scrollTop;
}

function openAIOptimize(event: MouseEvent) {
  if (props.disabled) {
    return;
  }
  if (event.target instanceof Element && event.target.closest(".design-card-inline-block")) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  emit("ai-optimize", { x: event.clientX, y: event.clientY });
}

function handleDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("application/x-design-card-id")) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
}

function handleDrop(event: DragEvent) {
  const cardId = event.dataTransfer?.getData("application/x-design-card-id") ?? "";
  if (!cardId) {
    return;
  }

  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const lineHeight = parseFloat(window.getComputedStyle(target).lineHeight) || 26;
  const afterLine = Math.max(0, Math.round((event.clientY - rect.top + scrollTop.value) / lineHeight));
  emit("place-design-card", { cardId, afterLine });
}
</script>

<template>
  <section
    class="editor-panel"
    :class="{ disabled: disabled, streaming: isStreaming }"
    @contextmenu.capture="openAIOptimize"
  >
    <div class="editor-placeholder">
      <div class="code-grid">
        <div
          class="line-number-column"
          :style="{ transform: `translateY(-${scrollTop}px)` }"
          aria-hidden="true"
        >
          <span
            v-for="(_line, index) in codeLines"
            :key="index"
            class="line-number"
          >
            {{ index + 1 }}
          </span>
        </div>
        <div
          class="code-editor-stack"
          @dragover="handleDragOver"
          @drop="handleDrop"
        >
          <div
            class="design-card-placeholder-layer"
            :style="{ transform: `translateY(-${scrollTop}px)` }"
          >
            <DesignCardInlineBlock
              v-for="{ card, placement } in placedDesignCards"
              :key="card.id"
              class="editor-design-card"
              :card="card"
              :style="{ top: `${placement.afterLine * 26 + 8}px` }"
              @delete="emit('delete-design-card', $event)"
              @move="emit('move-design-card', $event)"
              @open="emit('open-design-card', $event)"
              @optimize="emit('optimize-design-card', $event)"
            />
          </div>
          <pre
            class="syntax-layer"
            :style="{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }"
            aria-hidden="true"
          ><span
              v-for="(tokens, lineIndex) in highlightedLines"
              :key="`${props.animationKey ?? 0}-${lineIndex}`"
              class="syntax-line"
              :class="{ 'repair-revealed': animatedLines.has(lineIndex + 1) }"
            ><span
                v-for="(token, tokenIndex) in tokens"
                :key="`${lineIndex}-${tokenIndex}`"
                :class="`syntax-token syntax-${token.kind}`"
              >{{ token.text }}</span></span></pre>
          <textarea
            class="code-input"
            spellcheck="false"
            :value="normalizedCode"
            :disabled="disabled"
            aria-label="Python code editor"
            @input="updateCode"
            @scroll="syncScroll"
          />
        </div>
      </div>
    </div>
  </section>
</template>
