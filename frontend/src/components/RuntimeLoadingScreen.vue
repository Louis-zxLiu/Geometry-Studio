<script setup lang="ts">
import { computed, ref, watch } from "vue";
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

const stylizedTarget = ref(initialDisplayTarget(props.progress, props.active));
const targetProgress = computed(() => stylizedTarget.value);
const { displayed: safeProgress, isSettled } = useSmoothedProgress(
  () => targetProgress.value,
);
const progressLabel = computed(() => Math.round(safeProgress.value));

watch(
  [() => props.progress, () => props.active],
  ([nextProgress, active]) => {
    stylizedTarget.value = pickDisplayTarget(
      nextProgress,
      active,
      stylizedTarget.value,
    );
  },
  { immediate: true },
);

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

function initialDisplayTarget(progress: number, active: boolean) {
  return pickDisplayTarget(progress, active, 0);
}

function pickDisplayTarget(progress: number, active: boolean, previous: number) {
  const normalized = clampProgress(progress);
  if (!active || normalized >= 100) {
    return 100;
  }

  if (normalized <= 18) {
    return Math.max(previous, normalized);
  }

  const window = getProgressWindow(normalized);
  const sampled = randomInteger(window.min, window.max);
  const lowerBound = Math.min(window.max, Math.max(previous + 1, window.min));
  const next = clamp(sampled, lowerBound, window.max);
  return Math.max(previous, next);
}

function getProgressWindow(progress: number) {
  const decade = Math.floor(progress / 10) * 10;
  if (progress < 50) {
    return {
      min: decade,
      max: Math.min(98, decade + 20),
    };
  }

  return {
    min: Math.max(0, decade - 10),
    max: Math.min(98, decade + 10),
  };
}

function randomInteger(min: number, max: number) {
  if (max <= min) {
    return min;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clampProgress(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
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
