<script setup lang="ts">
import { computed, watch } from "vue";
import type { ThemeId } from "../theme/palettes";
import moonLogoUrl from "../assets/loading/logo-loading-moon.svg";
import warmLogoUrl from "../assets/loading/logo-loading-warm.svg";
import cyanLogoUrl from "../assets/loading/logo-loading-cyan.svg";
import blackLogoUrl from "../assets/loading/logo-loading-black.svg";
import { useSmoothedProgress } from "../composables/useSmoothedProgress";

const props = defineProps<{
  active: boolean;
  progress: number;
  message: string;
  themeId: ThemeId;
}>();

const emit = defineEmits<{
  settled: [];
}>();

const targetProgress = computed(() => (props.active ? props.progress : 100));
const { displayed: safeProgress, isSettled } = useSmoothedProgress(
  () => targetProgress.value,
);
const progressLabel = computed(() => Math.round(safeProgress.value));

watch(
  [() => props.active, isSettled, safeProgress],
  ([active, settled, progress]) => {
    if (!active && settled && progress >= 99.95) {
      emit("settled");
    }
  },
  { immediate: true },
);

const logoUrl = computed(() => {
  switch (props.themeId) {
    case "warm":
      return warmLogoUrl;
    case "cyan":
      return cyanLogoUrl;
    case "black":
      return blackLogoUrl;
    case "moon":
    default:
      return moonLogoUrl;
  }
});
const coreStyle = computed(() => {
  switch (props.themeId) {
    case "warm":
      return { background: "#F7F1E5" };
    case "cyan":
      return { background: "#E6EBEB" };
    case "black":
      return { background: "#151515" };
    case "moon":
    default:
      return { background: "#F8F7F6" };
  }
});
const ringStyle = computed(() => ({
  background: `conic-gradient(var(--loading-accent) 0deg, var(--loading-accent) ${safeProgress.value * 3.6}deg, var(--loading-track) ${safeProgress.value * 3.6}deg, var(--loading-track) 360deg)`,
}));
</script>

<template>
  <section class="runtime-loading-screen" aria-live="polite">
    <div class="runtime-loading-card">
      <div class="runtime-loading-ring" :style="ringStyle">
        <div class="runtime-loading-core" :style="coreStyle">
          <img class="runtime-loading-logo" :src="logoUrl" alt="PlotKityCat runtime loading" />
          <span class="runtime-loading-percent">{{ progressLabel }}%</span>
        </div>
      </div>
      <p class="runtime-loading-message">{{ message }}</p>
    </div>
  </section>
</template>
