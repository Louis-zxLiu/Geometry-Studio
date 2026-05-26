<script setup lang="ts">
import { ref } from "vue";
import type { DesignCard } from "../services/designCardTypes";
import DesignCardSvgView from "./DesignCardSvgView.vue";

defineProps<{
  card: DesignCard;
}>();

const emit = defineEmits<{
  delete: [cardId: string];
  move: [payload: { cardId: string; delta: number }];
  open: [cardId: string];
  optimize: [payload: { cardId: string; position: { x: number; y: number } }];
}>();

const armedDeleteId = ref("");
let deleteTimer = 0;

function open(cardId: string) {
  emit("open", cardId);
}

function openContextMenu(event: MouseEvent, cardId: string) {
  event.preventDefault();
  event.stopPropagation();
  emit("optimize", { cardId, position: { x: event.clientX, y: event.clientY } });
}

function startDrag(event: DragEvent, cardId: string) {
  event.dataTransfer?.setData("application/x-design-card-id", cardId);
  event.dataTransfer?.setData("text/plain", cardId);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "copy";
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
    @contextmenu="openContextMenu($event, card.id)"
    @dragstart="startDrag($event, card.id)"
  >
    <header class="design-card-inline-header">
      <span class="design-card-inline-title">{{ card.title || card.id }}</span>
      <span class="design-card-inline-id">{{ card.id }}</span>
    </header>

    <DesignCardSvgView :svg="card.svg" />

    <footer class="design-card-inline-actions" @click.stop>
      <button type="button" title="上移一行" @click="emit('move', { cardId: card.id, delta: -1 })">
        ↑
      </button>
      <button type="button" title="下移一行" @click="emit('move', { cardId: card.id, delta: 1 })">
        ↓
      </button>
      <button type="button" @click="emit('optimize', { cardId: card.id, position: { x: $event.clientX, y: $event.clientY } })">
        AI优化
      </button>
      <button
        class="design-card-trash"
        :class="{ armed: armedDeleteId === card.id }"
        type="button"
        :title="armedDeleteId === card.id ? '再次点击确认删除' : '删除设计卡片'"
        @click="requestDelete(card.id)"
      >
        删除
      </button>
    </footer>
  </article>
</template>
