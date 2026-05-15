<script setup lang="ts">
defineProps<{
  status: {
    ready: boolean;
    summary: string;
    missing: string[];
  };
  isRunning: boolean;
}>();
</script>

<template>
  <footer
    class="environment-bar"
    :class="{ ready: status.ready, missing: !status.ready, running: isRunning }"
  >
    <span
      class="environment-pulse"
      :class="{ ready: status.ready, missing: !status.ready, running: isRunning }"
      aria-hidden="true"
    />
    <strong class="environment-title">
      {{ isRunning ? "Running" : status.summary }}
    </strong>
  </footer>
</template>
