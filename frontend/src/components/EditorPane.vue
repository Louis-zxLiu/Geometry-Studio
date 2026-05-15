<script setup lang="ts">
import { computed, ref } from "vue";
import { tokenizePythonLine } from "../lib/pythonHighlighter";

const props = defineProps<{
  code: string;
  disabled?: boolean;
  isStreaming?: boolean;
}>();

const emit = defineEmits<{
  "update:code": [code: string];
}>();

const normalizedCode = computed(() =>
  typeof props.code === "string" ? props.code : String(props.code ?? ""),
);

const codeLines = computed(() => normalizedCode.value.split("\n"));
const highlightedLines = computed(() => codeLines.value.map(tokenizePythonLine));
const scrollLeft = ref(0);
const scrollTop = ref(0);

function updateCode(event: Event) {
  emit("update:code", (event.target as HTMLTextAreaElement).value);
}

function syncScroll(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  scrollLeft.value = target.scrollLeft;
  scrollTop.value = target.scrollTop;
}
</script>

<template>
  <section class="editor-panel" :class="{ disabled: disabled, streaming: isStreaming }">
    <div class="editor-placeholder">
      <div class="code-grid">
        <div
          class="line-number-column"
          :style="{ transform: `translateY(-${scrollTop}px)` }"
          aria-hidden="true"
        >
          <span
            v-for="(_line, index) in codeLines"
            :key="index"
            class="line-number"
          >
            {{ index + 1 }}
          </span>
        </div>
        <div class="code-editor-stack">
          <pre
            class="syntax-layer"
            :style="{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }"
            aria-hidden="true"
          ><span
              v-for="(tokens, lineIndex) in highlightedLines"
              :key="lineIndex"
              class="syntax-line"
            ><span
                v-for="(token, tokenIndex) in tokens"
                :key="`${lineIndex}-${tokenIndex}`"
                :class="`syntax-token syntax-${token.kind}`"
              >{{ token.text }}</span></span></pre>
          <textarea
            class="code-input"
            spellcheck="false"
            :value="normalizedCode"
            :disabled="disabled"
            aria-label="Python code editor"
            @input="updateCode"
            @scroll="syncScroll"
          />
        </div>
      </div>
    </div>
  </section>
</template>
