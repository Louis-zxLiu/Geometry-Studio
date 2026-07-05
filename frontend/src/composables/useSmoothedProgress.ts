import { computed, onBeforeUnmount, ref, watch } from "vue";

type SmoothedProgressOptions = {
  maxDurationMs?: number;
  minDurationMs?: number;
  millisecondsPerPercent?: number;
  precision?: number;
};

const DEFAULT_MILLISECONDS_PER_PERCENT = 28;
const DEFAULT_MIN_DURATION_MS = 220;
const DEFAULT_MAX_DURATION_MS = 1400;
const DEFAULT_PRECISION = 0.05;

export function useSmoothedProgress(
  source: () => number,
  options: SmoothedProgressOptions = {},
) {
  const millisecondsPerPercent =
    options.millisecondsPerPercent ?? DEFAULT_MILLISECONDS_PER_PERCENT;
  const minDurationMs = options.minDurationMs ?? DEFAULT_MIN_DURATION_MS;
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const precision = options.precision ?? DEFAULT_PRECISION;

  const displayed = ref(clampProgress(source()));

  let animationFrameId = 0;
  let segmentStartTimestamp = 0;
  let segmentFrom = displayed.value;
  let segmentTo = displayed.value;
  let segmentDurationMs = minDurationMs;

  const target = computed(() => clampProgress(source()));

  function stop() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
  }

  function tick(timestamp: number) {
    if (!segmentStartTimestamp) {
      segmentStartTimestamp = timestamp;
    }

    const elapsedMs = timestamp - segmentStartTimestamp;
    const progress = clamp(elapsedMs / segmentDurationMs, 0, 1);
    const eased = easeOutSine(progress);
    displayed.value = lerp(segmentFrom, segmentTo, eased);

    if (Math.abs(segmentTo - displayed.value) <= precision || progress >= 1) {
      displayed.value = segmentTo;
      stop();
      segmentStartTimestamp = 0;
      return;
    }

    animationFrameId = requestAnimationFrame(tick);
  }

  function retarget(nextTarget: number) {
    segmentFrom = displayed.value;
    segmentTo = nextTarget;

    const distance = Math.abs(segmentTo - segmentFrom);
    segmentDurationMs = clamp(
      distance * millisecondsPerPercent,
      minDurationMs,
      maxDurationMs,
    );
    segmentStartTimestamp = 0;
  }

  function start() {
    if (animationFrameId) {
      return;
    }
    animationFrameId = requestAnimationFrame(tick);
  }

  watch(
    target,
    (next) => {
      if (Math.abs(next - displayed.value) <= precision) {
        displayed.value = next;
        return;
      }

      retarget(next);
      stop();
      start();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    stop();
    segmentStartTimestamp = 0;
  });

  return {
    displayed,
    isSettled: computed(() => Math.abs(target.value - displayed.value) <= precision),
    target,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampProgress(value: number) {
  return clamp(Number.isFinite(value) ? value : 0, 0, 100);
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function easeOutSine(progress: number) {
  return Math.sin((progress * Math.PI) / 2);
}
