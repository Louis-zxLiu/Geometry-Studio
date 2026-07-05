<script setup lang="ts">
import type { WorkspaceLayoutMode } from "../../../features/plot/services/workspaceLayoutStorage";

defineProps<{
  layoutMode: WorkspaceLayoutMode;
}>();

const emit = defineEmits<{
  "show-code": [];
  "show-split": [];
  "show-note": [];
}>();
</script>

<template>
  <div class="notebook-divider-handle" aria-label="工作区布局切换">
    <button
      class="notebook-divider-button"
      :class="{ active: layoutMode === 'code' }"
      type="button"
      title="展示代码区"
      aria-label="展示代码区"
      @click="emit('show-code')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="m14.5 7-5 5 5 5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.7"
        />
      </svg>
    </button>

    <button
      class="notebook-divider-button notebook-divider-button-split"
      :class="{ active: layoutMode === 'split' }"
      type="button"
      title="并列展示"
      aria-label="并列展示"
      @click="emit('show-split')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M10 6.5V17.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="1.6"
        />
        <path
          d="M14 6.5V17.5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="1.6"
        />
      </svg>
    </button>

    <button
      class="notebook-divider-button"
      :class="{ active: layoutMode === 'note' }"
      type="button"
      title="展示笔记区"
      aria-label="展示笔记区"
      @click="emit('show-note')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="m9.5 7 5 5-5 5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.7"
        />
      </svg>
    </button>
  </div>
</template>
