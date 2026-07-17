<script setup lang="ts">
import type {
  AIProviderSettings,
  AIServiceMode,
} from "../features/ai/services/aiTypes";

const props = defineProps<{
  open: boolean;
  settings: AIProviderSettings;
}>();

const emit = defineEmits<{
  clear: [];
  close: [];
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
        <h2 id="ai-settings-title">AI 模型服务商</h2>

        <div class="ai-settings-body">
          <button
            class="ai-mode-card"
            :class="{ active: settings.mode === 'custom' }"
            type="button"
            @click="updateMode('custom')"
          >
            <span class="ai-mode-check" aria-hidden="true"></span>
            <span class="ai-mode-copy">
              <strong>自定义 OpenAI 兼容 API</strong>
              <small>代码 AI、设计卡和几何解题会共用这份配置。</small>
            </span>
          </button>

          <div class="ai-provider-stack" :class="{ muted: settings.mode !== 'custom' }">
            <label class="ai-provider-field ai-provider-field-float">
              <span>URL</span>
              <input
                class="ai-provider-input"
                type="text"
                :value="settings.url"
                placeholder="https://api.openai.com/v1"
                @input="updateField('url', ($event.target as HTMLInputElement).value)"
              />
            </label>

            <label class="ai-provider-field ai-provider-field-float">
              <span>KEY</span>
              <input
                class="ai-provider-input"
                type="password"
                autocomplete="off"
                :value="settings.key"
                placeholder="sk-..."
                @input="updateField('key', ($event.target as HTMLInputElement).value)"
              />
            </label>

            <label class="ai-provider-field ai-provider-field-float">
              <span>MODEL</span>
              <input
                class="ai-provider-input"
                type="text"
                :value="settings.model"
                placeholder="gpt-4o / gpt-5 / your-multimodal-model"
                @input="updateField('model', ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>

          <p class="ai-settings-hint">
            保存位置：<code>config/ai-settings.json</code>。运行日志和 benchmark 输出会自动脱敏 API KEY。
          </p>

          <button class="dialog-button secondary ai-settings-clear" type="button" @click="emit('clear')">
            清除本机 AI 配置
          </button>
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
