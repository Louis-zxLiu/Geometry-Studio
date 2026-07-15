<script setup lang="ts">
import type { NoteDocument } from "../../features/notebook/services/notebookStorage";

defineProps<{
  position: { x: number; y: number };
  images: NoteDocument["images"];
  hasSelection: boolean;
  allowInsertImage: boolean;
  allowJumpToSource: boolean;
}>();

const emit = defineEmits<{
  ask: [];
  design: [];
  generate: [];
  geometry: [];
  insertImage: [];
  jumpSource: [];
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
        <path d="M7 4.5h6.2l3.8 3.8v11.2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z" />
        <path d="M13.2 4.5v3.8h3.8" />
        <path d="M17.5 3.7 Q18.24 5.76 20.3 6.5 Q18.24 7.24 17.5 9.3 Q16.76 7.24 14.7 6.5 Q16.76 5.76 17.5 3.7 Z" />
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
        <path d="M5 19V5h14" />
        <path d="M6 12 Q 9 6 12 12 T 18 12" />
      </svg>
      <span>可视化</span>
    </button>
    <button
      v-if="hasSelection"
      class="notebook-context-action"
      type="button"
      @click="emit('ask')"
    >
      <svg class="notebook-context-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5.5h14v9H9l-4 4v-13Z" />
        <path d="M9 9h6" />
        <path d="M9 12h4" />
      </svg>
      <span>提问</span>
    </button>
    <button
      v-if="allowJumpToSource"
      class="notebook-context-action"
      type="button"
      @click="emit('jumpSource')"
    >
      <svg class="notebook-context-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 6 4 12l4 6" />
        <path d="M16 6l4 6-4 6" />
        <path d="M13 4 11 20" />
      </svg>
      <span>跳转到源码</span>
    </button>
    <button
      v-if="hasSelection"
      class="notebook-context-action"
      type="button"
      @click="emit('geometry')"
    >
      <svg class="notebook-context-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="7" cy="16" r="1.7" />
        <circle cx="17" cy="16" r="1.7" />
        <circle cx="12" cy="7" r="1.7" />
        <path d="M7 16 12 7 17 16 7 16Z" />
      </svg>
      <span>生成几何模型</span>
    </button>
    <button
      v-if="allowInsertImage"
      class="notebook-context-action"
      type="button"
      @click="emit('insertImage')"
    >
      <svg class="notebook-context-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="13" rx="2.5" />
        <path d="M5 16l3-3 2.5 2.5L14 12l5 4" />
        <circle cx="8.5" cy="10" r="1.5" />
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
