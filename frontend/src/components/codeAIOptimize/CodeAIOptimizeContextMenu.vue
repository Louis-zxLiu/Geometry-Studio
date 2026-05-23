<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { CodeAIOptimizeCloseReason } from "../../features/codeAIOptimize/model/useCodeAIOptimize";

const props = defineProps<{
  position: { x: number; y: number };
  disabled?: boolean;
}>();

const emit = defineEmits<{
  close: [context: {
    button?: number;
    eventType?: string;
    reason: CodeAIOptimizeCloseReason;
    target?: string;
  }];
  optimize: [];
}>();

const menuRoot = ref<HTMLElement | null>(null);

function closeFromOutsidePointer(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  const target = event.target;
  if (target instanceof Node && menuRoot.value?.contains(target)) {
    return;
  }

  emit("close", {
    button: event.button,
    eventType: event.type,
    reason: "outside-left-pointer",
    target: describeEventTarget(event.target),
  });
}

function closeFromKeyboard(event: KeyboardEvent) {
  if (event.key !== "Escape") {
    return;
  }

  emit("close", {
    eventType: event.type,
    reason: "escape",
    target: describeEventTarget(event.target),
  });
}

function optimize() {
  emit("optimize");
}

onMounted(() => {
  window.addEventListener("pointerdown", closeFromOutsidePointer);
  window.addEventListener("keydown", closeFromKeyboard);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", closeFromOutsidePointer);
  window.removeEventListener("keydown", closeFromKeyboard);
});

function describeEventTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return String(target);
  }

  const className = Array.from(target.classList).join(".");
  return `${target.tagName.toLowerCase()}${className ? `.${className}` : ""}`;
}
</script>

<template>
  <div
    ref="menuRoot"
    class="code-ai-context-menu"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @pointerdown.stop
    @mousedown.stop
  >
    <button
      class="code-ai-context-action"
      type="button"
      :disabled="disabled"
      @click="optimize"
    >
      AI优化
    </button>
  </div>
</template>
