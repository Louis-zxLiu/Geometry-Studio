<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import brandLogoUrl from "../assets/brand-logo.png";

const props = defineProps<{
  currentWorkspace: string;
  currentFile: string;
  scripts: string[];
  workspaces: Array<{ name?: string; sceneCount?: number }>;
  typingScriptName: string;
  deletingScriptName: string;
  isRenaming: boolean;
  isDeleting: boolean;
}>();

const emit = defineEmits<{
  "ai-settings": [];
  appearance: [];
  create: [];
  "create-workspace": [name: string];
  delete: [filename: string];
  "delete-workspace": [name: string];
  rename: [oldFilename: string, newFilename: string];
  "rename-workspace": [oldName: string, newName: string];
  select: [filename: string];
  settings: [];
  "switch-workspace": [name: string];
}>();

const isWorkspacePickerOpen = ref(false);
const workspaceSearch = ref("");
const isCreatingWorkspace = ref(false);
const newWorkspaceDraft = ref("");
const contextWorkspace = ref("");
const renamingWorkspace = ref("");
const workspaceRenameDraft = ref("");
const deleteConfirmWorkspace = ref("");
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

const visibleWorkspaces = computed(() => {
  const keyword = workspaceSearch.value.trim().toLowerCase();
  return props.workspaces.filter((workspace) => {
    const name = workspace.name ?? "";
    return !keyword || name.toLowerCase().includes(keyword);
  });
});

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

watch(
  () => props.currentWorkspace,
  () => {
    closeWorkspaceRowActions();
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

function toggleWorkspacePicker(event: MouseEvent) {
  event.stopPropagation();
  isWorkspacePickerOpen.value = !isWorkspacePickerOpen.value;
  if (!isWorkspacePickerOpen.value) {
    closeWorkspacePicker();
  }
}

function keepWorkspacePickerOpen(event: MouseEvent) {
  event.stopPropagation();
}

function handleWorkspaceBackdropClick() {
  if (props.isRenaming || props.isDeleting) {
    return;
  }

  closeWorkspacePicker();
}

function selectWorkspace(name?: string) {
  if (!name) {
    return;
  }

  emit("switch-workspace", name);
  closeWorkspacePicker();
}

function handleWorkspaceRowClick(name?: string) {
  selectWorkspace(name);
}

function openWorkspaceContext(name: string | undefined, event: MouseEvent) {
  event.preventDefault();
  openWorkspaceActions(name, event);
}

function startCreateWorkspace() {
  isCreatingWorkspace.value = true;
  newWorkspaceDraft.value = "";
}

function submitCreateWorkspace() {
  const name = newWorkspaceDraft.value.trim();
  if (!name) {
    return;
  }

  emit("create-workspace", name);
  closeWorkspacePicker();
}

function cancelCreateWorkspace() {
  isCreatingWorkspace.value = false;
  newWorkspaceDraft.value = "";
}

function openWorkspaceActions(name?: string, event?: MouseEvent) {
  event?.stopPropagation();
  if (!name) {
    return;
  }

  contextWorkspace.value = name;
  deleteConfirmWorkspace.value = "";
}

function startRenameWorkspace(name?: string) {
  if (!name || props.isRenaming || props.isDeleting) {
    return;
  }

  renamingWorkspace.value = name;
  workspaceRenameDraft.value = name;
  deleteConfirmWorkspace.value = "";
}

function submitRenameWorkspace() {
  const nextName = workspaceRenameDraft.value.trim();
  if (!renamingWorkspace.value || !nextName) {
    return;
  }

  emit("rename-workspace", renamingWorkspace.value, nextName);
  closeWorkspacePicker();
}

function requestDeleteWorkspace(name?: string) {
  if (!name || name === props.currentWorkspace) {
    return;
  }

  if (deleteConfirmWorkspace.value === name) {
    emit("delete-workspace", name);
    closeWorkspacePicker();
    return;
  }

  deleteConfirmWorkspace.value = name;
}

function closeWorkspacePicker() {
  isWorkspacePickerOpen.value = false;
  workspaceSearch.value = "";
  isCreatingWorkspace.value = false;
  newWorkspaceDraft.value = "";
  closeWorkspaceRowActions();
}

function closeWorkspaceRowActions() {
  contextWorkspace.value = "";
  renamingWorkspace.value = "";
  workspaceRenameDraft.value = "";
  deleteConfirmWorkspace.value = "";
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

    <div class="workspace-picker" @click="keepWorkspacePickerOpen">
      <button
        class="workspace-trigger"
        type="button"
        @click="toggleWorkspacePicker"
      >
        <span class="workspace-trigger-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20">
            <path d="M4.5 6.5h11" />
            <path d="M5.5 6.5h9v8.5h-9Z" />
            <path d="M8 9.2h4" />
          </svg>
        </span>
        <span class="workspace-trigger-label">WORKSPACE · {{ currentWorkspace || "工作区_01" }}</span>
      </button>

      <Teleport to="body">
        <div
          v-if="isWorkspacePickerOpen"
          class="dialog-backdrop workspace-dialog-backdrop"
          @click="handleWorkspaceBackdropClick"
        >
          <section class="create-dialog workspace-dialog" @click.stop>
          <div class="workspace-popover-title">工作区</div>
          <input
            v-model="workspaceSearch"
            class="workspace-search-input"
            type="text"
            placeholder="搜索工作区"
            @keydown.esc.prevent="closeWorkspacePicker"
          />

          <div class="workspace-list">
            <div
              v-for="workspace in visibleWorkspaces"
              :key="workspace.name"
              class="workspace-item"
              :class="{
                active: workspace.name === currentWorkspace,
                contextual: workspace.name === contextWorkspace,
                renaming: workspace.name === renamingWorkspace,
              }"
              @click="handleWorkspaceRowClick(workspace.name)"
              @contextmenu="openWorkspaceContext(workspace.name, $event)"
            >
              <template v-if="renamingWorkspace === workspace.name">
                <input
                  v-model="workspaceRenameDraft"
                  class="workspace-rename-input"
                  type="text"
                  maxlength="120"
                  :disabled="isRenaming"
                  @click.stop
                  @keydown.enter.prevent="submitRenameWorkspace"
                  @keydown.esc.prevent="closeWorkspaceRowActions"
                />
                <button
                  class="scene-action-icon"
                  type="button"
                  :disabled="isRenaming"
                  @click.stop="submitRenameWorkspace"
                  title="确认重命名"
                  aria-label="确认重命名"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20">
                    <path d="M4 10.5 8 14.5 16 5.5" />
                  </svg>
                </button>
              </template>
              <template v-else>
                <span class="workspace-item-main">
                  <span class="workspace-check" aria-hidden="true">{{ workspace.name === currentWorkspace ? "✓" : "" }}</span>
                  <span class="workspace-name">{{ workspace.name }}</span>
                </span>
                <span class="workspace-count">{{ workspace.sceneCount ?? 0 }} 个场景</span>
                <span
                  v-if="workspace.name === contextWorkspace"
                  class="workspace-actions"
                  @click.stop
                >
                  <button
                    class="scene-action-icon"
                    type="button"
                    :disabled="isRenaming || isDeleting"
                    @click.stop="startRenameWorkspace(workspace.name)"
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
                    :class="{ danger: deleteConfirmWorkspace === workspace.name }"
                    type="button"
                    :disabled="isRenaming || isDeleting || workspace.name === currentWorkspace"
                    @click.stop="requestDeleteWorkspace(workspace.name)"
                    :title="deleteConfirmWorkspace === workspace.name ? '确认删除' : '删除'"
                    :aria-label="deleteConfirmWorkspace === workspace.name ? '确认删除' : '删除'"
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
                </span>
              </template>
            </div>
          </div>

          <div class="workspace-create-shell">
            <input
              v-if="isCreatingWorkspace"
              v-model="newWorkspaceDraft"
              class="workspace-create-input"
              type="text"
              placeholder="输入工作区名称……"
              maxlength="120"
              @keydown.enter.prevent="submitCreateWorkspace"
              @keydown.esc.prevent="cancelCreateWorkspace"
            />
            <button
              v-else
              class="workspace-create-button"
              type="button"
              @click="startCreateWorkspace"
            >
              ＋ 新建工作区
            </button>
          </div>
          </section>
        </div>
      </Teleport>
    </div>

    <button class="create-button" type="button" @click="emit('create')">
      <span class="create-icon">+</span>
      <span>新建场景</span>
    </button>

    <div class="sidebar-body">
      <TransitionGroup name="scene-list-transition" tag="nav" class="scene-list" aria-label="Scripts">
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
