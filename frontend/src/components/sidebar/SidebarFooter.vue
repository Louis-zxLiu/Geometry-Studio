<script setup lang="ts">
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
