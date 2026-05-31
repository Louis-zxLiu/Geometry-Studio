<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  currentFile: string;
  scripts: string[];
  typingScriptName: string;
  deletingScriptName: string;
  isRenaming: boolean;
  isDeleting: boolean;
}>();

const emit = defineEmits<{
  delete: [filename: string];
  reorder: [scripts: string[]];
  rename: [oldFilename: string, newFilename: string];
  select: [filename: string];
}>();

const contextScript = ref("");
const renamingScript = ref("");
const renameDraft = ref("");
const deleteConfirmScript = ref("");
const animatedNames = ref<Record<string, string>>({});
const draggingScript = ref("");
const armedDragScript = ref("");
const dropTarget = ref<{ script: string; position: "before" | "after" } | null>(null);
const sceneItemElements = new Map<string, HTMLElement>();
const dragPreview = ref({ left: 0, top: 0, width: 0 });
let dragArmTimer: number | null = null;
let activePointerId: number | null = null;
let dragPointerOffsetY = 0;
let suppressClick = false;

const dragHoldDelayMs = 100;

const visibleScripts = computed(() =>
  props.scripts.map((script) => ({
    name: script,
    label: animatedNames.value[script] ?? script,
  })),
);

const draggingScriptLabel = computed(
  () => visibleScripts.value.find((script) => script.name === draggingScript.value)?.label ?? draggingScript.value,
);

onMounted(() => {
  window.addEventListener("pointerdown", handleGlobalPointerDown, true);
  window.addEventListener("keydown", handleGlobalKeyDown, true);
  window.addEventListener("scroll", closeContextOnly, true);
});

onUnmounted(() => {
  window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
  window.removeEventListener("keydown", handleGlobalKeyDown, true);
  window.removeEventListener("scroll", closeContextOnly, true);
  document.body.classList.remove("scene-list-dragging");
});

watch(
  () => props.typingScriptName,
  (script) => {
    if (script) {
      animateTyping(script);
    }
  },
);

watch(
  () => props.deletingScriptName,
  (script) => {
    if (script) {
      animateDeleting(script);
    }
  },
);

watch(
  () => props.scripts,
  (scripts) => {
    if (contextScript.value && !scripts.includes(contextScript.value)) {
      closeRowActions();
    }
    if (draggingScript.value && !scripts.includes(draggingScript.value)) {
      finishDrag();
    }
    if (armedDragScript.value && !scripts.includes(armedDragScript.value)) {
      cancelDragArm();
    }
  },
);

function openContext(script: string, event: MouseEvent) {
  if (draggingScript.value) {
    return;
  }
  event.preventDefault();
  contextScript.value = script;
  deleteConfirmScript.value = "";
  emit("select", script);
}

function handleGlobalPointerDown(event: PointerEvent) {
  const target = event.target;
  if (target instanceof Element && target.closest(".scene-item")) {
    return;
  }

  closeContextOnly();
}

function handleGlobalKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeRowActions();
  }
}

function closeContextOnly() {
  if (!contextScript.value || renamingScript.value) {
    return;
  }

  contextScript.value = "";
  deleteConfirmScript.value = "";
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

function armDrag(script: string, event: PointerEvent) {
  if (props.isRenaming || props.isDeleting || renamingScript.value || contextScript.value === script) {
    return;
  }

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  cancelDragArm();
  closeContextOnly();
  activePointerId = event.pointerId;
  dragArmTimer = window.setTimeout(() => {
    const sourceElement = sceneItemElements.get(script);
    const sourceBounds = sourceElement?.getBoundingClientRect();
    if (sourceBounds) {
      dragPointerOffsetY = event.clientY - sourceBounds.top;
      dragPreview.value = {
        left: sourceBounds.left,
        top: event.clientY - dragPointerOffsetY,
        width: sourceBounds.width,
      };
    }

    armedDragScript.value = script;
    draggingScript.value = script;
    suppressClick = true;
    closeRowActions();
    document.body.classList.add("scene-list-dragging");
    updateDropTarget(event.clientY);
    dragArmTimer = null;
  }, dragHoldDelayMs);
}

function cancelDragArm() {
  if (dragArmTimer !== null) {
    window.clearTimeout(dragArmTimer);
    dragArmTimer = null;
  }
  armedDragScript.value = "";
}

function handlePointerMove(event: PointerEvent) {
  if (activePointerId !== event.pointerId) {
    return;
  }
  if (!draggingScript.value) {
    return;
  }

  dragPreview.value = {
    ...dragPreview.value,
    top: event.clientY - dragPointerOffsetY,
  };
  updateDropTarget(event.clientY);
}

function updateDropTarget(pointerY: number) {
  if (!draggingScript.value) {
    dropTarget.value = null;
    return;
  }

  const orderedElements = visibleScripts.value
    .filter((script) => script.name !== draggingScript.value)
    .map((script) => ({
      script: script.name,
      element: sceneItemElements.get(script.name),
    }))
    .filter((entry): entry is { script: string; element: HTMLElement } => !!entry.element);

  if (orderedElements.length === 0) {
    dropTarget.value = null;
    return;
  }

  for (const entry of orderedElements) {
    const bounds = entry.element.getBoundingClientRect();
    const midpoint = bounds.top + bounds.height / 2;
    if (pointerY < midpoint) {
      dropTarget.value = { script: entry.script, position: "before" };
      return;
    }
  }

  const lastEntry = orderedElements[orderedElements.length - 1];
  dropTarget.value = { script: lastEntry.script, position: "after" };
}

function handlePointerUp(event: PointerEvent) {
  if (activePointerId !== event.pointerId) {
    return;
  }

  if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (draggingScript.value) {
    commitDrop();
  } else {
    cancelDragArm();
  }
  activePointerId = null;
}

function handlePointerCancel(event: PointerEvent) {
  if (activePointerId !== event.pointerId) {
    return;
  }

  if (event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  finishDrag();
  activePointerId = null;
}

function commitDrop() {
  if (!draggingScript.value || !dropTarget.value || draggingScript.value === dropTarget.value.script) {
    finishDrag();
    return;
  }

  const nextOrder = reorderScripts(
    props.scripts,
    draggingScript.value,
    dropTarget.value.position,
    dropTarget.value.script,
  );
  if (nextOrder.length > 0) {
    emit("reorder", nextOrder);
  }
  finishDrag();
}

function finishDrag() {
  draggingScript.value = "";
  dropTarget.value = null;
  dragPointerOffsetY = 0;
  cancelDragArm();
  document.body.classList.remove("scene-list-dragging");
  window.setTimeout(() => {
    suppressClick = false;
  }, 0);
}

function handleSelect(script: string) {
  if (suppressClick) {
    return;
  }
  emit("select", script);
}

function setSceneItemElement(script: string, element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    sceneItemElements.delete(script);
    return;
  }

  sceneItemElements.set(script, element);
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

function reorderScripts(
  scripts: string[],
  source: string,
  position: "before" | "after",
  target: string,
) {
  const nextScripts = [...scripts];
  const sourceIndex = nextScripts.indexOf(source);
  const targetIndex = nextScripts.indexOf(target);
  if (sourceIndex < 0 || targetIndex < 0) {
    return [];
  }

  const [moved] = nextScripts.splice(sourceIndex, 1);
  const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const insertIndex = position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1;
  nextScripts.splice(insertIndex, 0, moved);

  if (nextScripts.every((script, index) => script === scripts[index])) {
    return [];
  }

  return nextScripts;
}
</script>

<template>
  <TransitionGroup name="scene-list-transition" tag="nav" class="scene-list" aria-label="Scripts">
    <div
      v-for="script in visibleScripts"
      :key="script.name"
      :ref="(element) => setSceneItemElement(script.name, element)"
      class="scene-item"
      :class="{
        active: script.name === currentFile,
        deleting: script.name === deletingScriptName,
        contextual: script.name === contextScript,
        renaming: script.name === renamingScript,
        dragging: script.name === draggingScript,
        armed: script.name === armedDragScript,
        'drop-before': dropTarget?.script === script.name && dropTarget.position === 'before',
        'drop-after': dropTarget?.script === script.name && dropTarget.position === 'after',
      }"
      @contextmenu="openContext(script.name, $event)"
    >
      <button
        class="scene-select-button"
        type="button"
        @click="handleSelect(script.name)"
        @pointerdown="armDrag(script.name, $event)"
        @pointermove="handlePointerMove($event)"
        @pointerup="handlePointerUp($event)"
        @pointercancel="handlePointerCancel($event)"
        @blur="cancelDragArm"
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

  <div
    v-if="draggingScript"
    class="scene-drag-ghost"
    :style="{
      width: `${dragPreview.width}px`,
      transform: `translate3d(${dragPreview.left}px, ${dragPreview.top}px, 0)`,
    }"
    aria-hidden="true"
  >
    <button class="scene-select-button" type="button" tabindex="-1">
      <span class="scene-meta">
        <span class="scene-badge">PY</span>
        <span class="scene-name">{{ draggingScriptLabel }}</span>
      </span>
    </button>
  </div>
</template>
