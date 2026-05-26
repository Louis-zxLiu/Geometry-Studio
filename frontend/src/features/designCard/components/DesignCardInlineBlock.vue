<script setup lang="ts">
import { ref } from "vue";
import {
  writeDesignCardDragData,
  type DesignCardDragSource,
} from "../services/designCardDragData";
import type { DesignCard } from "../services/designCardTypes";
import DesignCardStaticSvgView from "./DesignCardStaticSvgView.vue";

withDefaults(defineProps<{
  card: DesignCard;
  dragSource?: DesignCardDragSource;
}>(), {
  dragSource: "editor",
});

const emit = defineEmits<{
  delete: [cardId: string];
  move: [payload: { cardId: string; delta: number }];
  open: [cardId: string];
}>();

const armedDeleteId = ref("");
let deleteTimer = 0;

function open(cardId: string) {
  emit("open", cardId);
}

function startDrag(event: DragEvent, cardId: string, source: DesignCardDragSource) {
  writeDesignCardDragData(event.dataTransfer, { cardId, source });
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function requestDelete(cardId: string) {
  if (armedDeleteId.value === cardId) {
    emit("delete", cardId);
    armedDeleteId.value = "";
    return;
  }

  armedDeleteId.value = cardId;
  window.clearTimeout(deleteTimer);
  deleteTimer = window.setTimeout(() => {
    if (armedDeleteId.value === cardId) {
      armedDeleteId.value = "";
    }
  }, 1800);
}
</script>

<template>
  <article
    class="design-card-inline-block"
    draggable="true"
    @click.stop="open(card.id)"
    @dragstart="startDrag($event, card.id, dragSource)"
  >
    <DesignCardStaticSvgView :svg="card.svg" />

    <footer class="design-card-inline-actions" @click.stop>
      <button
        class="design-card-icon-action"
        type="button"
        title="放大查看"
        @click="open(card.id)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="m15 15 5 5" />
        </svg>
      </button>
      <button
        class="design-card-icon-action design-card-trash"
        :class="{ armed: armedDeleteId === card.id }"
        type="button"
        :title="armedDeleteId === card.id ? '再次点击确认删除' : '删除设计卡片'"
        @click="requestDelete(card.id)"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 7h12" />
          <path d="m9 7 .6-2h4.8L15 7" />
          <path d="M8 7v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" />
        </svg>
      </button>
    </footer>
  </article>
</template>
