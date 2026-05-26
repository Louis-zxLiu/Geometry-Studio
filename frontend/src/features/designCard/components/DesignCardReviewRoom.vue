<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import type { DesignCard } from "../services/designCardTypes";
import DesignCardSvgView from "./DesignCardSvgView.vue";

const props = defineProps<{
  card: DesignCard | null;
  open: boolean;
  pending?: boolean;
  saveState: "idle" | "saving" | "saved";
}>();

const emit = defineEmits<{
  close: [];
  optimize: [cardId: string];
  "update:plan": [plan: string];
}>();

const lineCount = computed(() => {
  if (!props.card?.plan) return 1;
  // 确保末尾换行也能正确计算行数
  const lines = props.card.plan.split("\n");
  return lines.length;
});

const scrollTop = ref(0);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

function handleScroll(event: Event) {
  scrollTop.value = (event.target as HTMLTextAreaElement).scrollTop;
}

// 自动跟踪最新行
watch(() => props.card?.plan, () => {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.scrollTop = textareaRef.value.scrollHeight;
      scrollTop.value = textareaRef.value.scrollTop;
    }
  });
});

function updatePlan(event: Event) {
  emit("update:plan", (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <Transition name="preview-dialog" appear>
    <div v-if="open && card" class="design-card-review-backdrop" @click.self="emit('close')">
      <div class="design-card-review-zen">
        <header class="design-card-zen-global-actions">
          <span class="design-card-save-state">
            {{ saveState === "saving" ? "保存中" : saveState === "saved" ? "已保存" : "" }}
          </span>
          <button type="button" class="zen-action-link" :disabled="pending" @click="emit('optimize', card.id)">
            AI优化
          </button>
          <button type="button" class="zen-action-link close-trigger" @click="emit('close')">
            关闭
          </button>
        </header>

        <div class="design-card-review-content">
          <section class="design-card-zen-preview">
            <DesignCardSvgView :svg="card.svg" />
          </section>

          <section class="design-card-zen-editor">
            <div class="design-card-zen-grid">
              <div class="design-card-zen-gutter">
                <div
                  class="zen-gutter-inner"
                  :style="{ transform: `translateY(${-scrollTop}px)` }"
                >
                  <div v-for="n in lineCount" :key="n" class="zen-line-number">
                    {{ n }}
                  </div>
                </div>
              </div>
              <textarea
                ref="textareaRef"
                class="design-card-plan-input"
                spellcheck="false"
                :value="card.plan"
                :disabled="pending"
                @input="updatePlan"
                @scroll="handleScroll"
              ></textarea>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>
