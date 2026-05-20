<script setup lang="ts">
defineProps<{
  image: { src: string; alt: string };
  scale: number;
}>();

const emit = defineEmits<{
  close: [];
  reset: [];
  wheel: [event: WheelEvent];
  zoom: [delta: number];
}>();
</script>

<template>
  <div
    class="notebook-image-preview"
    role="dialog"
    aria-modal="true"
    @click.self="emit('close')"
    @wheel.prevent="emit('wheel', $event)"
  >
    <div class="notebook-preview-toolbar">
      <button
        class="notebook-preview-control"
        type="button"
        title="缩小"
        aria-label="缩小"
        @click="emit('zoom', -0.2)"
      >
        -
      </button>
      <button
        class="notebook-preview-control"
        type="button"
        title="恢复原始大小"
        aria-label="恢复原始大小"
        @click="emit('reset')"
      >
        100%
      </button>
      <button
        class="notebook-preview-control"
        type="button"
        title="放大"
        aria-label="放大"
        @click="emit('zoom', 0.2)"
      >
        +
      </button>
    </div>
    <button
      class="notebook-preview-close"
      type="button"
      title="关闭预览"
      aria-label="关闭预览"
      @click="emit('close')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="m7 7 10 10M17 7 7 17"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
        />
      </svg>
    </button>
    <img
      class="notebook-preview-image"
      :src="image.src"
      :alt="image.alt"
      :style="{ transform: `scale(${scale})` }"
    />
  </div>
</template>
