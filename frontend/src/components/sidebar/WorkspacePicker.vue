<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  currentWorkspace: string;
  workspaces: Array<{ name?: string; sceneCount?: number }>;
  isRenaming: boolean;
  isDeleting: boolean;
  isExportMode: boolean;
  pendingAction: "" | "import" | "export";
  selectedWorkspaceNames: string[];
}>();

const emit = defineEmits<{
  create: [name: string];
  delete: [name: string];
  "export-package": [];
  "import-package": [];
  rename: [oldName: string, newName: string];
  switch: [name: string];
  "toggle-export-mode": [];
  "cancel-export-mode": [];
  "toggle-export-selection": [name: string];
}>();

const isOpen = ref(false);
const search = ref("");
const isCreating = ref(false);
const newWorkspaceDraft = ref("");
const contextWorkspace = ref("");
const renamingWorkspace = ref("");
const renameDraft = ref("");
const deleteConfirmWorkspace = ref("");

const visibleWorkspaces = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return props.workspaces.filter((workspace) => {
    const name = workspace.name ?? "";
    return !keyword || name.toLowerCase().includes(keyword);
  });
});

watch(
  () => props.currentWorkspace,
  () => {
    closeRowActions();
  },
);

watch(
  () => props.isExportMode,
  (isExportMode) => {
    if (!isExportMode) {
      closeRowActions(true);
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
  if (props.isRenaming || props.isDeleting || props.isExportMode) {
    return;
  }

  closeRowActions();
}

function toggle(event: MouseEvent) {
  event.stopPropagation();
  isOpen.value = !isOpen.value;
  if (!isOpen.value) {
    close();
  }
}

function keepOpen(event: MouseEvent) {
  event.stopPropagation();
}

function handleBackdropClick() {
  if (props.isRenaming || props.isDeleting) {
    return;
  }

  close();
}

function select(name?: string) {
  if (!name) {
    return;
  }

  if (props.isExportMode) {
    emit("toggle-export-selection", name);
    return;
  }

  emit("switch", name);
  close();
}

function openContext(name: string | undefined, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (!name || props.isExportMode) {
    return;
  }

  contextWorkspace.value = name;
  deleteConfirmWorkspace.value = "";
}

function startCreate() {
  isCreating.value = true;
  newWorkspaceDraft.value = "";
}

function submitCreate() {
  const name = newWorkspaceDraft.value.trim();
  if (!name) {
    return;
  }

  emit("create", name);
  close();
}

function cancelCreate() {
  isCreating.value = false;
  newWorkspaceDraft.value = "";
}

function startRename(name?: string) {
  if (!name || props.isRenaming || props.isDeleting) {
    return;
  }

  renamingWorkspace.value = name;
  renameDraft.value = name;
  deleteConfirmWorkspace.value = "";
}

function submitRename() {
  const nextName = renameDraft.value.trim();
  if (!renamingWorkspace.value || !nextName) {
    return;
  }

  emit("rename", renamingWorkspace.value, nextName);
  closeRowActions();
}

function requestDelete(name?: string) {
  if (!name || name === props.currentWorkspace) {
    return;
  }

  if (deleteConfirmWorkspace.value === name) {
    emit("delete", name);
    closeRowActions();
    return;
  }

  deleteConfirmWorkspace.value = name;
}

function close() {
  if (props.isExportMode) {
    emit("cancel-export-mode");
  }
  isOpen.value = false;
  search.value = "";
  isCreating.value = false;
  newWorkspaceDraft.value = "";
  closeRowActions(true);
}

function closeRowActions(force = false) {
  if (props.isExportMode && !force) {
    return;
  }
  contextWorkspace.value = "";
  renamingWorkspace.value = "";
  renameDraft.value = "";
  deleteConfirmWorkspace.value = "";
}

function isWorkspaceSelected(name?: string) {
  return !!name && props.selectedWorkspaceNames.includes(name);
}

function handleImport() {
  if (props.pendingAction !== "") {
    return;
  }

  emit("import-package");
}

function handleExport() {
  if (props.pendingAction !== "") {
    return;
  }

  if (!props.isExportMode) {
    emit("toggle-export-mode");
    return;
  }

  emit("export-package");
}
</script>

<template>
  <div class="workspace-picker" @click="keepOpen">
    <button class="workspace-trigger" type="button" @click="toggle">
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
      <Transition name="create-dialog-backdrop" appear>
        <div
          v-if="isOpen"
          class="dialog-backdrop workspace-dialog-backdrop"
          @click="handleBackdropClick"
        >
          <section class="create-dialog workspace-dialog" @click.stop>
            <div class="workspace-popover-title">工作区</div>
            <input
              v-model="search"
              class="workspace-search-input"
              type="text"
              placeholder="搜索工作区"
              @keydown.esc.prevent="close"
            />

            <div class="workspace-list">
              <div
                v-for="workspace in visibleWorkspaces"
                :key="workspace.name"
                class="workspace-item"
                :class="{
                  active: !isExportMode && workspace.name === currentWorkspace,
                  contextual: workspace.name === contextWorkspace,
                  renaming: workspace.name === renamingWorkspace,
                  selectable: isExportMode,
                  selected: isExportMode && isWorkspaceSelected(workspace.name),
                }"
                @click="select(workspace.name)"
                @contextmenu="openContext(workspace.name, $event)"
              >
                <template v-if="renamingWorkspace === workspace.name">
                  <input
                    v-model="renameDraft"
                    class="workspace-rename-input"
                    type="text"
                    maxlength="120"
                    :disabled="isRenaming"
                    @click.stop
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
                  <span class="workspace-item-main">
                    <span
                      class="workspace-check"
                      :class="{ boxed: isExportMode, checked: isExportMode && isWorkspaceSelected(workspace.name) }"
                      aria-hidden="true"
                    >
                      {{ isExportMode ? (isWorkspaceSelected(workspace.name) ? "✓" : "") : (workspace.name === currentWorkspace ? "✓" : "") }}
                    </span>
                    <span class="workspace-name">{{ workspace.name }}</span>
                  </span>
                  <span class="workspace-count">{{ workspace.sceneCount ?? 0 }} 个场景</span>
                  <span
                    v-if="workspace.name === contextWorkspace && !isExportMode"
                    class="workspace-actions"
                    @click.stop
                  >
                    <button
                      class="scene-action-icon"
                      type="button"
                      :disabled="isRenaming || isDeleting"
                      @click.stop="startRename(workspace.name)"
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
                      @click.stop="requestDelete(workspace.name)"
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
                v-if="isCreating"
                v-model="newWorkspaceDraft"
                class="workspace-create-input"
                type="text"
                placeholder="输入工作区名称……"
                maxlength="120"
                @keydown.enter.prevent="submitCreate"
                @keydown.esc.prevent="cancelCreate"
              />
              <button
                v-else
                class="workspace-create-button"
                type="button"
                :disabled="isExportMode || pendingAction !== ''"
                @click="startCreate"
              >
                ＋ 新建工作区
              </button>
              <div
                v-if="!isCreating"
                class="workspace-package-actions"
              >
                <button
                  class="workspace-package-link"
                  type="button"
                  :disabled="pendingAction !== ''"
                  @click="handleImport"
                >
                  {{ pendingAction === "import" ? "导入中" : "导入" }}
                </button>
                <span class="workspace-package-divider" aria-hidden="true">|</span>
                <button
                  class="workspace-package-link"
                  :class="{ active: isExportMode }"
                  type="button"
                  :disabled="pendingAction !== '' || (isExportMode && selectedWorkspaceNames.length === 0)"
                  @click="handleExport"
                >
                  {{ pendingAction === "export" ? "导出中" : "导出" }}
                </button>
              </div>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
