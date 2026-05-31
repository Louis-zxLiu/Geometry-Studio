<script setup lang="ts">
import brandLogoUrl from "../../assets/brand-logo.png";
import SceneList from "./SceneList.vue";
import SidebarFooter from "./SidebarFooter.vue";
import WorkspacePicker from "./WorkspacePicker.vue";

defineProps<{
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
  reorder: [scripts: string[]];
  rename: [oldFilename: string, newFilename: string];
  "rename-workspace": [oldName: string, newName: string];
  select: [filename: string];
  settings: [];
  "switch-workspace": [name: string];
}>();
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

    <WorkspacePicker
      :current-workspace="currentWorkspace"
      :workspaces="workspaces"
      :is-renaming="isRenaming"
      :is-deleting="isDeleting"
      @switch="emit('switch-workspace', $event)"
      @create="emit('create-workspace', $event)"
      @rename="(oldName, newName) => emit('rename-workspace', oldName, newName)"
      @delete="emit('delete-workspace', $event)"
    />

    <button class="create-button" type="button" @click="emit('create')">
      <span class="create-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="M10 4.5v11" />
          <path d="M4.5 10h11" />
        </svg>
      </span>
      <span>新建场景</span>
    </button>

    <div class="sidebar-body">
      <SceneList
        :scripts="scripts"
        :current-file="currentFile"
        :typing-script-name="typingScriptName"
        :deleting-script-name="deletingScriptName"
        :is-renaming="isRenaming"
        :is-deleting="isDeleting"
        @reorder="emit('reorder', $event)"
        @select="emit('select', $event)"
        @rename="(oldFilename, newFilename) => emit('rename', oldFilename, newFilename)"
        @delete="emit('delete', $event)"
      />

      <SidebarFooter
        @settings="emit('settings')"
        @ai-settings="emit('ai-settings')"
        @appearance="emit('appearance')"
      />
    </div>
  </aside>
</template>
