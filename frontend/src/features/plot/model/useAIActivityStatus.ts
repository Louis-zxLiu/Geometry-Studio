import { computed, ref } from "vue";

export function useAIActivityStatus() {
  const isAIGenerating = ref(false);
  const aiElapsedSeconds = ref(0);
  const aiPhase = ref<"working" | "checking">("working");
  let aiElapsedTimer: ReturnType<typeof window.setInterval> | undefined;

  const aiStatusLabel = computed(() => {
    if (!isAIGenerating.value) {
      return "";
    }

    const prefix = aiPhase.value === "checking" ? "AI 正在检查" : "AI 正在工作";
    if (aiElapsedSeconds.value < 3) {
      return prefix;
    }

    return `${prefix} ${aiElapsedSeconds.value}s`;
  });

  function startWorking() {
    stop();
    isAIGenerating.value = true;
    aiPhase.value = "working";
    const startedAt = Date.now();
    aiElapsedTimer = window.setInterval(() => {
      aiElapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000);
    }, 1000);
  }

  function startChecking() {
    stop();
    isAIGenerating.value = true;
    aiPhase.value = "checking";
    const startedAt = Date.now();
    aiElapsedTimer = window.setInterval(() => {
      aiElapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000);
    }, 1000);
  }

  function start() {
    startWorking();
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
    startChecking,
    startWorking,
    stop,
  };
}
