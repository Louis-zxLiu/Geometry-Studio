<script setup lang="ts">
import type { NoteDocument } from "../../features/notebook/services/notebookStorage";

defineProps<{
  position: { x: number; y: number };
  images: NoteDocument["images"];
  hasSelection: boolean;
  allowInsertImage: boolean;
}>();

const emit = defineEmits<{
  design: [];
  generate: [];
  insertImage: [];
  preview: [];
  remove: [];
}>();
</script>

<template>
  <div
    class="notebook-context-menu"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @mousedown.stop
  >
    <button
      v-if="images.length > 0"
      class="notebook-context-action"
      type="button"
      @click="emit('preview')"
    >
      <svg class="notebook-context-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6Z" />
        <path d="M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />
      </svg>
      <span>预览</span>
    </button>
    <button
      v-if="hasSelection"
      class="notebook-context-action"
      type="button"
      @click="emit('design')"
    >
      <svg class="notebook-context-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.5h16" />
        <path d="M4 12h10" />
        <path d="M4 17.5h7" />
        <path d="m16 15 4-4" />
        <path d="m20 15-4-4" />
      </svg>
      <span>生成设计方案</span>
    </button>
    <button
      v-if="hasSelection"
      class="notebook-context-action"
      type="button"
      @click="emit('generate')"
    >
      <svg class="notebook-context-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="4.5" width="15" height="15" />
        <path d="M9 15.4 12 8.6l3 6.8" />
        <path d="M10 13.2h4" />
        <path d="M8 4.5V2.8" />
        <path d="M16 4.5V2.8" />
        <path d="M8 21.2v-1.7" />
        <path d="M16 21.2v-1.7" />
      </svg>
      <span>可视化</span>
    </button>
    <button
      v-if="allowInsertImage"
      class="notebook-context-action"
      type="button"
      @click="emit('insertImage')"
    >
      <svg class="notebook-context-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
      <span>插入图片</span>
    </button>
    <button
      v-if="images.length > 0"
      class="notebook-context-action danger"
      type="button"
      @click="emit('remove')"
    >
      <svg class="notebook-context-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7h12" />
        <path d="m9 7 .6-2h4.8L15 7" />
        <path d="M8 7v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" />
      </svg>
      <span>移除</span>
    </button>
  </div>
</template>
