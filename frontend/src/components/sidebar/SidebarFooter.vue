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
        <svg class="sidebar-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l1.6-1.2-1.8-3.1-1.9.8a7.6 7.6 0 0 0-2.6-1.5L14.2 3h-4.4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-1.9-.8L3 9.3 4.6 10.5a7.8 7.8 0 0 0 0 3L3 14.7l1.8 3.1 1.9-.8a7.6 7.6 0 0 0 2.6 1.5l.5 2.5h4.4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l1.9.8 1.8-3.1z" />
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
          <rect x="5" y="5" width="14" height="14" rx="2.5" />
          <path d="M9.2 15.4 12 8.8l2.8 6.6" />
          <path d="M10.1 13.2h3.8" />
          <path d="M8 5V3.2" />
          <path d="M16 5V3.2" />
          <path d="M8 21v-1.8" />
          <path d="M16 21v-1.8" />
        </svg>
      </button>
      <button
        class="sidebar-tool-button"
        type="button"
        title="切换主题"
        aria-label="切换主题"
        @click="emit('appearance')"
      >
        <svg class="sidebar-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </div>
  </div>
</template>
