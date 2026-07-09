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
  <Transition name="tool-menu" appear>
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
        <svg class="code-ai-context-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 8 Q10.7 12.8 15.5 14.5 Q10.7 16.2 9 21 Q7.3 16.2 2.5 14.5 Q7.3 12.8 9 8 Z" />
          <path d="M17.5 3 Q18.42 5.58 21 6.5 Q18.42 7.42 17.5 10 Q16.58 7.42 14 6.5 Q16.58 5.58 17.5 3 Z" />
        </svg>
        <span>AI优化</span>
      </button>
    </div>
  </Transition>
</template>
