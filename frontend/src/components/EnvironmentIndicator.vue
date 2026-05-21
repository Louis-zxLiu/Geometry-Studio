<script setup lang="ts">
defineProps<{
  isRunning: boolean;
  aiBusy: boolean;
  aiLabel: string;
}>();
</script>

<template>
  <footer
    class="environment-bar"
    :class="{
      ready: !aiBusy,
      running: isRunning,
      'ai-working': aiBusy,
    }"
  >
    <span
      class="environment-pulse"
      :class="{
        ready: !aiBusy,
        running: isRunning,
        'ai-working': aiBusy,
      }"
      aria-hidden="true"
    />
    <strong class="environment-title">
      {{ aiBusy ? aiLabel : isRunning ? "Running" : "Ready" }}
    </strong>
  </footer>
</template>
