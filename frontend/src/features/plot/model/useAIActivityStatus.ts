import { computed, ref } from "vue";

export function useAIActivityStatus() {
  const isAIGenerating = ref(false);
  const aiElapsedSeconds = ref(0);
  let aiElapsedTimer: ReturnType<typeof window.setInterval> | undefined;

  const aiStatusLabel = computed(() => {
    if (!isAIGenerating.value) {
      return "";
    }

    if (aiElapsedSeconds.value < 3) {
      return "AI working...";
    }

    return `AI working... ${aiElapsedSeconds.value}s`;
  });

  function start() {
    stop();
    isAIGenerating.value = true;
    const startedAt = Date.now();
    aiElapsedTimer = window.setInterval(() => {
      aiElapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000);
    }, 1000);
  }

  function stop() {
    if (aiElapsedTimer !== undefined) {
      window.clearInterval(aiElapsedTimer);
      aiElapsedTimer = undefined;
    }

    isAIGenerating.value = false;
    aiElapsedSeconds.value = 0;
  }

  return {
    aiStatusLabel,
    isAIGenerating,
    start,
    stop,
  };
}
