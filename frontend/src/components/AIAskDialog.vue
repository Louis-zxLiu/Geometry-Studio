<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { renderMarkdownToHtml } from "../features/notebook/rendering/markdownRenderer";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
  answer: string;
  contextLabel: string;
  initialPosition?: { x: number; y: number } | null;
}>();

const emit = defineEmits<{
  close: [];
  submit: [question: string];
}>();

const question = ref("");
const dialogRoot = ref<HTMLElement | null>(null);
const position = ref({ x: 0, y: 0 });

let dragState: {
  offsetX: number;
  offsetY: number;
} | null = null;

const answerHtml = computed(() => {
  const text = props.answer.trim();
  return text ? renderMarkdownToHtml(text) : "";
});

watch(
  () => props.open,
  (open) => {
    if (open) {
      question.value = "";
      position.value = getInitialPosition();
    }
  },
);

onBeforeUnmount(() => {
  stopDrag();
});

function startDrag(event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  const rect = dialogRoot.value?.getBoundingClientRect();
  if (!rect) {
    return;
  }

  dragState = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
  event.preventDefault();
  window.addEventListener("pointermove", drag);
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);
}

function drag(event: PointerEvent) {
  if (!dragState) {
    return;
  }

  const rect = dialogRoot.value?.getBoundingClientRect();
  const width = rect?.width ?? 560;
  const height = rect?.height ?? 360;
  position.value = clampPosition({
    x: event.clientX - dragState.offsetX,
    y: event.clientY - dragState.offsetY,
  }, width, height);
}

function stopDrag() {
  dragState = null;
  window.removeEventListener("pointermove", drag);
  window.removeEventListener("pointerup", stopDrag);
  window.removeEventListener("pointercancel", stopDrag);
}

function submit() {
  const value = question.value.trim();
  if (!value || props.pending) {
    return;
  }

  emit("submit", value);
}

function close() {
  if (props.pending) {
    return;
  }

  emit("close");
}

function getInitialPosition() {
  const width = Math.min(760, Math.max(360, window.innerWidth - 40));
  if (props.initialPosition) {
    return clampPosition({
      x: props.initialPosition.x,
      y: props.initialPosition.y,
    }, width, 360);
  }

  return clampPosition({
    x: window.innerWidth - width - 26,
    y: 72,
  }, width, 360);
}

function clampPosition(nextPosition: { x: number; y: number }, width: number, height: number) {
  const margin = 14;
  return {
    x: Math.min(window.innerWidth - margin - Math.min(width, window.innerWidth - margin * 2), Math.max(margin, nextPosition.x)),
    y: Math.min(window.innerHeight - margin - Math.min(height, window.innerHeight - margin * 2), Math.max(margin, nextPosition.y)),
  };
}
</script>

<template>
  <Teleport to="body">
    <Transition name="tool-menu" appear>
      <section
        v-if="open"
        ref="dialogRoot"
        class="create-dialog ai-ask-dialog"
        :style="{ left: `${position.x}px`, top: `${position.y}px` }"
        role="dialog"
        aria-modal="false"
        aria-labelledby="ai-ask-title"
      >
        <header class="ai-ask-window-header" @pointerdown="startDrag">
          <div>
            <h2 id="ai-ask-title">向 AI 提问</h2>
            <p class="ai-ask-context">{{ contextLabel }}</p>
          </div>
          <button
            class="ai-ask-close"
            type="button"
            :disabled="pending"
            title="关闭"
            aria-label="关闭"
            @pointerdown.stop
            @click="close"
          >
            ×
          </button>
        </header>

        <textarea
          v-model="question"
          class="code-ai-prompt ai-ask-prompt"
          autofocus
          :disabled="pending"
          placeholder="问问这段证明、公式或代码哪里不清楚"
          @keydown.ctrl.enter.prevent="submit"
          @keydown.meta.enter.prevent="submit"
          @keydown.esc.prevent="close"
        ></textarea>

        <div v-if="answerHtml || pending" class="ai-ask-answer-shell">
          <div v-if="pending && !answerHtml" class="ai-ask-pending">正在思考...</div>
          <article
            v-else
            class="ai-ask-answer notebook-markdown-rendered"
            v-html="answerHtml"
          ></article>
        </div>

        <div class="create-dialog-actions">
          <button class="dialog-button secondary" type="button" :disabled="pending" @click="close">
            关闭
          </button>
          <span class="dialog-action-divider" aria-hidden="true"></span>
          <button class="dialog-button primary" type="button" :disabled="!question.trim() || pending" @click="submit">
            {{ pending ? "提问中..." : "提问" }}
          </button>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>
