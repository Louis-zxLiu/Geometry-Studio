<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import brandLogoUrl from "../assets/brand-logo.png";

const props = defineProps<{
  currentFile: string;
  scripts: string[];
  typingScriptName: string;
  deletingScriptName: string;
  isRenaming: boolean;
  isDeleting: boolean;
}>();

const emit = defineEmits<{
  "ai-settings": [];
  appearance: [];
  create: [];
  delete: [filename: string];
  rename: [oldFilename: string, newFilename: string];
  select: [filename: string];
  settings: [];
}>();

const contextScript = ref("");
const renamingScript = ref("");
const renameDraft = ref("");
const deleteConfirmScript = ref("");
const animatedNames = ref<Record<string, string>>({});

const visibleScripts = computed(() =>
  props.scripts.map((script) => ({
    name: script,
    label: animatedNames.value[script] ?? script,
  })),
);

watch(
  () => props.typingScriptName,
  (script) => {
    if (!script) {
      return;
    }

    animateTyping(script);
  },
);

watch(
  () => props.deletingScriptName,
  (script) => {
    if (!script) {
      return;
    }

    animateDeleting(script);
  },
);

watch(
  () => props.scripts,
  (scripts) => {
    if (contextScript.value && !scripts.includes(contextScript.value)) {
      closeRowActions();
    }
  },
);

onMounted(() => {
  window.addEventListener("click", handleOutsideClick);
});

onBeforeUnmount(() => {
  window.removeEventListener("click", handleOutsideClick);
});

function handleOutsideClick() {
  if (props.isRenaming || props.isDeleting) {
    return;
  }

  closeRowActions();
}

function openContext(script: string, event: MouseEvent) {
  event.preventDefault();
  contextScript.value = script;
  deleteConfirmScript.value = "";
  emit("select", script);
}

function startRename(script: string) {
  if (props.isRenaming || props.isDeleting) {
    return;
  }

  renamingScript.value = script;
  renameDraft.value = script.replace(/\.py$/i, "");
  deleteConfirmScript.value = "";
}

function submitRename() {
  if (!renamingScript.value || !renameDraft.value.trim()) {
    return;
  }

  emit("rename", renamingScript.value, renameDraft.value.trim());
  closeRowActions();
}

function requestDelete(script: string) {
  if (deleteConfirmScript.value === script) {
    emit("delete", script);
    closeRowActions();
    return;
  }

  deleteConfirmScript.value = script;
}

function closeRowActions() {
  contextScript.value = "";
  renamingScript.value = "";
  renameDraft.value = "";
  deleteConfirmScript.value = "";
}

function animateTyping(script: string) {
  const chars = Array.from(script);
  animatedNames.value = { ...animatedNames.value, [script]: "" };

  chars.forEach((_, index) => {
    window.setTimeout(() => {
      animatedNames.value = {
        ...animatedNames.value,
        [script]: chars.slice(0, index + 1).join(""),
      };
    }, index * 85);
  });

  window.setTimeout(() => {
    const { [script]: _, ...rest } = animatedNames.value;
    animatedNames.value = rest;
  }, Math.max(600, chars.length * 85) + 120);
}

function animateDeleting(script: string) {
  const chars = Array.from(script);
  animatedNames.value = { ...animatedNames.value, [script]: script };

  chars.forEach((_, index) => {
    window.setTimeout(() => {
      const nextLength = Math.max(chars.length - index - 1, 0);
      animatedNames.value = {
        ...animatedNames.value,
        [script]: chars.slice(0, nextLength).join(""),
      };
    }, index * 45);
  });
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">
        <img class="brand-mark-image" :src="brandLogoUrl" alt="PlotKityCat logo" />
      </div>
      <div>
        <h1>PlotKityCat</h1>
      </div>
    </div>

    <button class="create-button" type="button" @click="emit('create')">
      <span class="create-icon">+</span>
      <span>新建场景</span>
    </button>

    <div class="sidebar-body">
      <TransitionGroup name="scene-list-transition" tag="nav" class="scene-list" aria-label="Scripts">
        <div class="scene-list-title">历史</div>
        <div
          v-for="script in visibleScripts"
          :key="script.name"
          class="scene-item"
          :class="{
            active: script.name === currentFile,
            deleting: script.name === deletingScriptName,
            contextual: script.name === contextScript,
            renaming: script.name === renamingScript,
          }"
          @contextmenu="openContext(script.name, $event)"
        >
          <button
            class="scene-select-button"
            type="button"
            @click="emit('select', script.name)"
          >
            <span class="scene-meta">
              <span class="scene-badge" aria-hidden="true">PY</span>
              <span class="scene-name">{{ script.label }}</span>
            </span>
          </button>
          <span
            v-if="script.name === contextScript"
            class="scene-actions"
            @click.stop
          >
            <template v-if="renamingScript === script.name">
              <input
                v-model="renameDraft"
                class="scene-rename-input"
                type="text"
                maxlength="120"
                :disabled="isRenaming"
                @keydown.enter.prevent="submitRename"
                @keydown.esc.prevent="closeRowActions"
              />
              <button
                class="scene-action-icon"
                type="button"
                :disabled="isRenaming"
                @click.stop="submitRename"
                title="确认重命名"
                aria-label="确认重命名"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M4 10.5 8 14.5 16 5.5" />
                </svg>
              </button>
            </template>
            <template v-else>
              <button
                class="scene-action-icon"
                type="button"
                :disabled="isRenaming || isDeleting"
                @click.stop="startRename(script.name)"
                title="重命名"
                aria-label="重命名"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M4 14.5V16h1.5l8.7-8.7-1.5-1.5L4 14.5Z" />
                  <path d="M11.9 4.7 13.4 3.2 16.8 6.6 15.3 8.1" />
                </svg>
              </button>
              <button
                class="scene-action-icon"
                :class="{ danger: deleteConfirmScript === script.name }"
                type="button"
                :disabled="isRenaming || isDeleting"
                @click.stop="requestDelete(script.name)"
                :title="deleteConfirmScript === script.name ? '确认删除' : '删除'"
                :aria-label="deleteConfirmScript === script.name ? '确认删除' : '删除'"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M6.5 5.5h7" />
                  <path d="M8 5.5V4.4h4v1.1" />
                  <path d="M7 7.5v6" />
                  <path d="M10 7.5v6" />
                  <path d="M13 7.5v6" />
                  <path d="M5.5 5.5 6.2 15a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-9.5" />
                </svg>
              </button>
            </template>
          </span>
        </div>
      </TransitionGroup>

      <div class="sidebar-footer-shell">
        <div class="sidebar-footer" aria-label="Sidebar tools">
          <button
            class="sidebar-tool-button"
            type="button"
            title="设置"
            aria-label="设置"
            @click="emit('settings')"
          >
            <span class="sidebar-tool-glyph" aria-hidden="true">⚙</span>
          </button>
          <button
            class="sidebar-tool-button"
            type="button"
            title="AI模型服务商"
            aria-label="AI模型服务商"
            @click="emit('ai-settings')"
          >
            <svg class="sidebar-tool-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4.5" y="4.5" width="15" height="15" />
              <path d="M9 15.4 12 8.6l3 6.8" />
              <path d="M10 13.2h4" />
              <path d="M8 4.5V2.8" />
              <path d="M16 4.5V2.8" />
              <path d="M8 21.2v-1.7" />
              <path d="M16 21.2v-1.7" />
            </svg>
          </button>
          <button
            class="sidebar-tool-button"
            type="button"
            title="切换主题"
            aria-label="切换主题"
            @click="emit('appearance')"
          >
            <span class="sidebar-tool-glyph" aria-hidden="true">✦</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
