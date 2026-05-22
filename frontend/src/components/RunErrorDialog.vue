<script setup lang="ts">
const props = defineProps<{
  open: boolean;
  errorText: string;
  copied: boolean;
  repairable?: boolean;
  repairDisabled?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  copy: [];
  repair: [];
}>();

function close() {
  emit("close");
}

function copy() {
  emit("copy");
}

function repair() {
  emit("repair");
}
</script>

<template>
  <Transition name="create-dialog-backdrop" appear>
    <div v-if="open" class="dialog-backdrop" @click.self="close">
      <section class="create-dialog error-dialog" role="dialog" aria-modal="true" aria-labelledby="run-error-title">
        <div class="error-dialog-header">
          <h2 id="run-error-title">错误</h2>
          <button class="copy-error-button" type="button" @click="copy">
            {{ copied ? "已复制" : "复制" }}
          </button>
        </div>

        <details class="error-details" open>
          <summary>展开错误文本</summary>
          <pre class="error-traceback">{{ props.errorText }}</pre>
        </details>

        <div class="create-dialog-actions">
          <button class="dialog-button secondary" type="button" @click="close">
            关闭
          </button>
          <div v-if="props.repairable" class="dialog-action-divider" />
          <button
            v-if="props.repairable"
            class="dialog-button primary"
            type="button"
            :disabled="props.repairDisabled"
            @click="repair"
          >
            AI修复
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>
