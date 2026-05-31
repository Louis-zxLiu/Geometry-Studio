<script setup lang="ts">
import { openHelpCenter } from "../../lib/help";

const emit = defineEmits<{
  "ai-settings": [];
  appearance: [];
  settings: [];
}>();
</script>

<template>
  <div class="sidebar-footer-shell">
    <div class="sidebar-footer" aria-label="Sidebar tools">
      <button
        class="sidebar-tool-button"
        type="button"
        title="设置"
        aria-label="设置"
        @click="emit('settings')"
      >
        <span class="sidebar-tool-glyph" aria-hidden="true">⚙</span>
      </button>
      <button
        class="sidebar-tool-button sidebar-tool-button-help"
        type="button"
        title="帮助教程"
        aria-label="帮助教程"
        @click="openHelpCenter"
      >
        <svg class="sidebar-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 6.5h6a2.9 2.9 0 0 1 2 0v10.5a2.9 2.9 0 0 0-2-.8H5z" />
          <path d="M19 6.5h-6a2.9 2.9 0 0 0-2 0v10.5a2.9 2.9 0 0 1 2-.8H19z" />
          <path d="M11.3 7.2v9" />
          <path d="M12.7 7.2v9" />
        </svg>
      </button>
      <button
        class="sidebar-tool-button"
        type="button"
        title="AI模型服务商"
        aria-label="AI模型服务商"
        @click="emit('ai-settings')"
      >
        <svg class="sidebar-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.5" y="4.5" width="15" height="15" />
          <path d="M9 15.4 12 8.6l3 6.8" />
          <path d="M10 13.2h4" />
          <path d="M8 4.5V2.8" />
          <path d="M16 4.5V2.8" />
          <path d="M8 21.2v-1.7" />
          <path d="M16 21.2v-1.7" />
        </svg>
      </button>
      <button
        class="sidebar-tool-button"
        type="button"
        title="切换主题"
        aria-label="切换主题"
        @click="emit('appearance')"
      >
        <span class="sidebar-tool-glyph" aria-hidden="true">✦</span>
      </button>
    </div>
  </div>
</template>
