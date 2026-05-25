<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [prompt: string];
}>();

const prompt = ref("");

watch(
  () => props.open,
  (open) => {
    if (open) {
      prompt.value = "";
    }
  },
);

function confirm() {
  const value = prompt.value.trim();
  if (!value || props.pending) {
    return;
  }

  emit("confirm", value);
}

function cancel() {
  if (props.pending) {
    return;
  }

  emit("cancel");
}
</script>

<template>
  <Transition name="create-dialog-backdrop" appear>
    <div v-if="open" class="dialog-backdrop" @click.self="cancel">
      <section
        class="create-dialog code-ai-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-ai-title"
      >
        <h2 id="code-ai-title">AI优化</h2>

        <textarea
          v-model="prompt"
          class="code-ai-prompt"
          autofocus
          :disabled="pending"
          placeholder="例如：去掉右上角的公式说明"
          @keydown.ctrl.enter.prevent="confirm"
          @keydown.meta.enter.prevent="confirm"
          @keydown.esc.prevent="cancel"
        ></textarea>

        <div class="create-dialog-actions">
          <button class="dialog-button secondary" type="button" :disabled="pending" @click="cancel">
            取消
          </button>
          <span class="dialog-action-divider" aria-hidden="true"></span>
          <button class="dialog-button primary" type="button" :disabled="!prompt.trim() || pending" @click="confirm">
            优化
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>
