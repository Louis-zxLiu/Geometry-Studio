<script setup lang="ts">
defineProps<{
  isRunning: boolean;
}>();

const emit = defineEmits<{
  packages: [];
  run: [];
  stop: [];
}>();
</script>

<template>
  <header class="topbar">
    <div class="topbar-editor-actions">
      <div class="topbar-actions">
        <button
          class="icon-button"
          type="button"
          title="导入导出"
          aria-label="导入导出"
          @click="emit('packages')"
        >
          <svg class="topbar-icon" aria-hidden="true" viewBox="0 0 24 24">
            <path d="M7.5 5.5V18.5" />
            <path d="M7.5 18.5L4.75 15.75" />
            <path d="M7.5 18.5L10.25 15.75" />
            <path d="M16.5 18.5V5.5" />
            <path d="M16.5 5.5L13.75 8.25" />
            <path d="M16.5 5.5L19.25 8.25" />
          </svg>
        </button>
      </div>

      <button
        class="run-button"
        type="button"
        :class="{ stopping: isRunning }"
        @click="isRunning ? emit('stop') : emit('run')"
      >
        <span class="run-icon" aria-hidden="true"></span>
        <span>{{ isRunning ? "停止运行" : "运行场景" }}</span>
      </button>
    </div>
  </header>
</template>
