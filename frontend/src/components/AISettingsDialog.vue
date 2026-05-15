<script setup lang="ts">
import type {
  AIProviderSettings,
  AISubscriptionPurchaseResult,
  AISubscriptionStatus,
  AIServiceMode,
} from "../features/ai/services/aiTypes";

const props = defineProps<{
  open: boolean;
  settings: AIProviderSettings;
  subscriptionStatus: AISubscriptionStatus;
  purchaseState: AISubscriptionPurchaseResult | null;
}>();

const emit = defineEmits<{
  close: [];
  "purchase-subscription": [];
  "refresh-subscription": [];
  "update:settings": [settings: AIProviderSettings];
}>();

function updateMode(mode: AIServiceMode) {
  emit("update:settings", {
    ...props.settings,
    mode,
  });
}

function updateField(field: "url" | "key" | "model", value: string) {
  emit("update:settings", {
    ...props.settings,
    [field]: value,
  });
}
</script>

<template>
  <Transition name="create-dialog-backdrop" appear>
    <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <section
        class="create-dialog ai-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
      >
        <h2 id="ai-settings-title">AI模型服务商</h2>

        <div class="ai-settings-body">
          <button
            class="ai-mode-card"
            :class="{ active: settings.mode === 'custom' }"
            type="button"
            @click="updateMode('custom')"
          >
            <span class="ai-mode-check" aria-hidden="true"></span>
            <span class="ai-mode-copy">
              <strong>自定义</strong>
              <small>好的工具就像太阳一样开放免费</small>
            </span>
          </button>

          <div class="ai-provider-card" :class="{ muted: settings.mode !== 'custom' }">
            <label class="ai-provider-field">
              <span>URL</span>
              <input
                class="ai-provider-input"
                type="text"
                :value="settings.url"
                placeholder="https://api.openai.com/v1"
                @input="updateField('url', ($event.target as HTMLInputElement).value)"
              />
            </label>

            <label class="ai-provider-field">
              <span>KEY</span>
              <input
                class="ai-provider-input"
                type="password"
                :value="settings.key"
                placeholder="sk-xxxxx"
                @input="updateField('key', ($event.target as HTMLInputElement).value)"
              />
            </label>

            <label class="ai-provider-field">
              <span>MODEL</span>
              <input
                class="ai-provider-input"
                type="text"
                :value="settings.model"
                placeholder="gpt-5.5"
                @input="updateField('model', ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>

          <button
            class="ai-mode-card subscription"
            :class="{ active: settings.mode === 'subscription' }"
            type="button"
            @click="updateMode('subscription')"
          >
            <span class="ai-mode-check" aria-hidden="true"></span>
            <span class="ai-mode-copy">
              <strong>
                使用订阅AI 20元/月
                <span class="ai-inline-divider" aria-hidden="true">|</span>
                <button
                  v-if="!subscriptionStatus.activated"
                  class="ai-inline-action"
                  type="button"
                  @click.stop="emit('purchase-subscription')"
                >
                  购买
                </button>
                <span v-else class="ai-inline-status">已激活</span>
                <span class="ai-inline-divider" aria-hidden="true">|</span>
                <button
                  class="ai-inline-action"
                  type="button"
                  @click.stop="emit('refresh-subscription')"
                >
                  刷新
                </button>
              </strong>
              <small>订阅提供 AI 额度，适合不愿折腾 API、想开箱即用的老师</small>
            </span>
          </button>

          <div class="ai-subscription-meta">
            <p class="ai-subscription-message">
              {{ purchaseState?.message || subscriptionStatus.message || "购买后点击刷新，检查激活状态" }}
            </p>
            <p v-if="subscriptionStatus.deviceId" class="ai-subscription-detail">
              设备标识：{{ subscriptionStatus.deviceId }}
            </p>
            <p v-if="subscriptionStatus.expireAt" class="ai-subscription-detail">
              到期时间：{{ subscriptionStatus.expireAt }}
            </p>
          </div>
        </div>

        <div class="create-dialog-actions">
          <button class="dialog-button secondary" type="button" @click="emit('close')">
            关闭
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>
