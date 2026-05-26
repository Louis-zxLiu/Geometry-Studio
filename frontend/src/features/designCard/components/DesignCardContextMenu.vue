<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

defineProps<{
  disabled?: boolean;
  position: { x: number; y: number };
}>();

const emit = defineEmits<{
  close: [];
  optimize: [];
}>();

const menuRoot = ref<HTMLElement | null>(null);

function closeFromOutsidePointer(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  const target = event.target;
  if (target instanceof Node && menuRoot.value?.contains(target)) {
    return;
  }

  emit("close");
}

function closeFromKeyboard(event: KeyboardEvent) {
  if (event.key === "Escape") {
    emit("close");
  }
}

onMounted(() => {
  window.addEventListener("pointerdown", closeFromOutsidePointer);
  window.addEventListener("keydown", closeFromKeyboard);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", closeFromOutsidePointer);
  window.removeEventListener("keydown", closeFromKeyboard);
});
</script>

<template>
  <div
    ref="menuRoot"
    class="design-card-context-menu"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @pointerdown.stop
    @mousedown.stop
  >
    <button
      class="design-card-context-action"
      type="button"
      :disabled="disabled"
      @click="emit('optimize')"
    >
      AI优化设计卡片
    </button>
  </div>
</template>
