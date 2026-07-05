import { computed, onBeforeUnmount, ref, watch } from "vue";

type SmoothedProgressOptions = {
  maxSpeed?: number;
  minSpeed?: number;
  precision?: number;
  responsiveness?: number;
};

const DEFAULT_MIN_SPEED = 24;
const DEFAULT_MAX_SPEED = 180;
const DEFAULT_RESPONSIVENESS = 7.2;
const DEFAULT_PRECISION = 0.05;

export function useSmoothedProgress(
  source: () => number,
  options: SmoothedProgressOptions = {},
) {
  const minSpeed = options.minSpeed ?? DEFAULT_MIN_SPEED;
  const maxSpeed = options.maxSpeed ?? DEFAULT_MAX_SPEED;
  const responsiveness = options.responsiveness ?? DEFAULT_RESPONSIVENESS;
  const precision = options.precision ?? DEFAULT_PRECISION;

  const displayed = ref(clampProgress(source()));

  let animationFrameId = 0;
  let lastTimestamp = 0;

  const target = computed(() => clampProgress(source()));

  function stop() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = 0;
    }
  }

  function tick(timestamp: number) {
    if (!lastTimestamp) {
      lastTimestamp = timestamp;
    }

    const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
    lastTimestamp = timestamp;

    const delta = target.value - displayed.value;
    if (Math.abs(delta) <= precision) {
      displayed.value = target.value;
      stop();
      lastTimestamp = 0;
      return;
    }

    const speed = clamp(Math.abs(delta) * responsiveness, minSpeed, maxSpeed);
    const step = Math.min(Math.abs(delta), speed * deltaSeconds);
    displayed.value += Math.sign(delta) * step;

    animationFrameId = requestAnimationFrame(tick);
  }

  function start() {
    if (animationFrameId) {
      return;
    }
    animationFrameId = requestAnimationFrame(tick);
  }

  watch(
    target,
    (next, previous) => {
      if (next === previous && next === displayed.value) {
        return;
      }
      start();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    stop();
    lastTimestamp = 0;
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
