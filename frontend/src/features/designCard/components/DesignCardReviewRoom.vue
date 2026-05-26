<script setup lang="ts">
import type { DesignCard } from "../services/designCardTypes";
import DesignCardSvgView from "./DesignCardSvgView.vue";

defineProps<{
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

function updatePlan(event: Event) {
  emit("update:plan", (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <Transition name="preview-dialog" appear>
    <div v-if="open && card" class="design-card-review-backdrop">
      <section class="design-card-review-room" role="dialog" aria-modal="true">
        <header class="design-card-review-header">
          <div>
            <p class="design-card-review-kicker">审片室</p>
            <h2>{{ card.title || card.id }}</h2>
          </div>
          <div class="design-card-review-actions">
            <span class="design-card-save-state">
              {{ saveState === "saving" ? "保存中" : saveState === "saved" ? "已保存" : "" }}
            </span>
            <button type="button" :disabled="pending" @click="emit('optimize', card.id)">
              AI优化
            </button>
            <button type="button" @click="emit('close')">关闭</button>
          </div>
        </header>

        <div class="design-card-review-body">
          <section class="design-card-preview-pane">
            <DesignCardSvgView :svg="card.svg" />
          </section>
          <section class="design-card-plan-pane">
            <textarea
              class="design-card-plan-input"
              spellcheck="false"
              :value="card.plan"
              :disabled="pending"
              @input="updatePlan"
            ></textarea>
          </section>
        </div>
      </section>
    </div>
  </Transition>
</template>
