<script setup lang="ts">
import {
  writeDesignCardDragData,
  type DesignCardDragSource,
} from "../../features/designCard/services/designCardDragData";
import type { DesignCard } from "../../features/designCard/services/designCardTypes";
import DesignCardStaticSvgView from "../../features/designCard/components/DesignCardStaticSvgView.vue";

withDefaults(defineProps<{
  armed: boolean;
  card: DesignCard;
  dragSource?: DesignCardDragSource;
  selectionLabel?: string;
}>(), {
  dragSource: "note",
  selectionLabel: "",
});

const emit = defineEmits<{
  delete: [cardId: string];
  open: [cardId: string];
}>();

function startDrag(event: DragEvent, cardId: string, source: DesignCardDragSource) {
  writeDesignCardDragData(event.dataTransfer, { cardId, source });
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "copyMove";
  }
}
</script>

<template>
  <article
    class="notebook-design-card-block"
    draggable="true"
    @dragstart="startDrag($event, card.id, dragSource)"
  >
    <span v-if="selectionLabel" class="notebook-design-card-selection-text">
      {{ selectionLabel }}
    </span>
    <DesignCardStaticSvgView :svg="card.svg" />
    <button
      class="notebook-design-card-action notebook-design-card-remove"
      :class="{ armed }"
      type="button"
      :title="armed ? '再次点击确认删除' : '删除设计卡片'"
      @pointerdown.stop
      @click.stop="emit('delete', card.id)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7h12" />
        <path d="m9 7 .6-2h4.8L15 7" />
        <path d="M8 7v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" />
      </svg>
    </button>
    <button
      class="notebook-design-card-action notebook-design-card-zoom"
      type="button"
      title="放大查看"
      @pointerdown.stop
      @click.stop="emit('open', card.id)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="m15 15 5 5" />
      </svg>
    </button>
  </article>
</template>
