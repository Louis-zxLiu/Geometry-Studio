<script setup lang="ts">
import { computed } from "vue";
import logoUrl from "../assets/logoandapp.svg";

const props = defineProps<{
  progress: number;
  message: string;
}>();

const safeProgress = computed(() => Math.max(0, Math.min(100, props.progress)));
const ringStyle = computed(() => ({
  background: `conic-gradient(var(--loading-accent) 0deg, var(--loading-accent) ${safeProgress.value * 3.6}deg, #fbf5ec ${safeProgress.value * 3.6}deg, #fbf5ec 360deg)`,
}));
</script>

<template>
  <section class="runtime-loading-screen" aria-live="polite">
    <div class="runtime-loading-card">
      <div class="runtime-loading-ring" :style="ringStyle">
        <div class="runtime-loading-core">
          <img class="runtime-loading-logo" :src="logoUrl" alt="PlotKityCat runtime loading" />
          <span class="runtime-loading-percent">{{ safeProgress }}%</span>
        </div>
      </div>
      <p class="runtime-loading-message">{{ message }}</p>
    </div>
  </section>
</template>
