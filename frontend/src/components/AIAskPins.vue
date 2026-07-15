<script setup lang="ts">
export type AIAskPin = {
  answer: string;
  contextLabel: string;
  id: string;
  position: { x: number; y: number };
  question: string;
};

defineProps<{
  pins: AIAskPin[];
}>();

const emit = defineEmits<{
  remove: [id: string];
  reopen: [id: string];
}>();
</script>

<template>
  <Teleport to="body">
    <div class="ai-ask-pin-layer" aria-label="AI 提问角标">
      <div
        v-for="pin in pins"
        :key="pin.id"
        class="ai-ask-pin"
        :style="{ left: `${pin.position.x}px`, top: `${pin.position.y}px` }"
      >
        <button
          class="ai-ask-pin-main"
          type="button"
          :title="pin.contextLabel"
          @click="emit('reopen', pin.id)"
        >
          问
        </button>
        <button
          class="ai-ask-pin-remove"
          type="button"
          title="删除角标"
          aria-label="删除角标"
          @click.stop="emit('remove', pin.id)"
        >
          ×
        </button>
      </div>
    </div>
  </Teleport>
</template>
