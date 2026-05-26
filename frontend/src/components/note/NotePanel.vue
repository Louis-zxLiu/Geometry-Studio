<script setup lang="ts">
import { ref } from "vue";
import type { DesignCard } from "../../features/designCard/services/designCardTypes";
import type { AINoteSelectionPayload } from "../../features/ai/services/aiTypes";
import type { NoteRenderBlock } from "../../features/notebook/rendering/noteForwarder";
import type { NoteDocument } from "../../features/notebook/services/notebookStorage";
import NoteDocumentArea from "./panel/NoteDocumentArea.vue";
import NoteFloatingOverlays from "./panel/NoteFloatingOverlays.vue";
import NotePanelShell from "./panel/NotePanelShell.vue";
import { useNoteAIActions } from "./useNoteAIActions";
import { useNoteContextActions } from "./useNoteContextActions";
import { useNoteContextSelection } from "./useNoteContextSelection";
import { useNoteDesignCardDelete } from "./useNoteDesignCardDelete";
import { resolveImagePathFromEventTarget } from "./useNoteDomTargets";
import { useNoteDrop } from "./useNoteDrop";
import { useNoteImagePreview } from "./useNoteImagePreview";
import { useNoteImageSelection } from "./useNoteImageSelection";
import { useNoteMarkdownEditing } from "./useNoteMarkdownEditing";
import { useNotePanelEffects } from "./useNotePanelEffects";
import { useNotePanelWindow } from "./useNotePanelWindow";
import { useNoteSelectionOrder } from "./useNoteSelectionOrder";

const props = defineProps<{
  currentFile: string;
  document: NoteDocument;
  designCards: DesignCard[];
  isOpen: boolean;
  renderBlocks: NoteRenderBlock[];
  saveState: "idle" | "saving" | "saved";
  aiBusy?: boolean;
}>();

const emit = defineEmits<{
  "add-images": [payload: { files: File[]; insertAt: number }];
  "ai-generate": [selection: AINoteSelectionPayload];
  "ai-design": [selection: AINoteSelectionPayload];
  "delete-design-card": [cardId: string];
  "insert-design-card": [payload: { cardId: string; insertAt: number; source?: "editor" | "note" }];
  "open-design-card": [cardId: string];
  "remove-image": [relativePath: string];
  toggle: [];
  "update:markdown": [markdown: string];
}>();

const notebookRoot = ref<HTMLElement | null>(null);
const notebookScroll = ref<HTMLElement | null>(null);
const markdownSurface = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const markdownInput = ref<HTMLTextAreaElement | null>(null);

const { nextSelectionOrder } = useNoteSelectionOrder();
const imagePreview = useNoteImagePreview();

const imageSelection = useNoteImageSelection(() => props.document, nextSelectionOrder);
const {
  clearImageSelection,
  clearUnavailableImageSelections,
  ensureImageSelection,
  selectedImageOrder,
  selectedImagePaths,
} = imageSelection;

const contextSelection = useNoteContextSelection({
  document: () => props.document,
  selectedImageOrder,
  markdownInput,
  notebookRoot,
  ensureImageSelection,
  nextSelectionOrder,
  resolveImagePathFromEventTarget,
});

const {
  buildSelectionPayload,
  closeContextMenu,
  contextMenu,
  contextMenuImages,
  handleContextMenu,
  handleTextSelectionChange,
} = contextSelection;

const markdownEditing = useNoteMarkdownEditing({
  document: () => props.document,
  designCards: () => props.designCards,
  currentFile: () => props.currentFile,
  markdownInput,
  markdownSurface,
  notebookScroll,
  onCloseContextMenu: closeContextMenu,
  onUpdateMarkdown: (markdown) => emit("update:markdown", markdown),
  resolveImagePathFromEventTarget,
});

const {
  cancelMarkdownInputResize,
  editableMarkdown,
  focusMarkdownInputAtEnd,
  getCurrentInsertionIndex,
  handleMarkdownFocus,
  maybeStopEditingFromPointerDown,
  scheduleMarkdownInputResize,
  shouldShowMarkdownInput,
  shouldStartMarkdownEdit,
  updateMarkdown,
} = markdownEditing;

const noteDrop = useNoteDrop({
  getCurrentInsertionIndex,
  getDropInsertionIndex,
  onAddImages: (payload) => emit("add-images", payload),
  onInsertDesignCard: (payload) => emit("insert-design-card", payload),
});

const {
  handleDrop,
  handlePaste,
  pickImages,
  setDragging,
} = noteDrop;

const {
  closePreview,
  handlePreviewWheel,
  openPreview,
  previewImage,
  previewScale,
  resetPreviewZoom,
  zoomPreview,
} = imagePreview;

const {
  armedDesignCardDeleteId,
  clearDesignCardDeleteTimer,
  requestDesignCardDelete,
} = useNoteDesignCardDelete((cardId) => emit("delete-design-card", cardId));

const {
  handleImageBlockContext,
  previewContextImage,
  removeContextImages,
  toggleImageSelection,
} = useNoteContextActions({
  clearImageSelection,
  closeContextMenu,
  contextMenuImages,
  ensureImageSelection,
  handleContextMenu,
  openPreview,
  removeImage: (relativePath) => emit("remove-image", relativePath),
  toggleImageSelection: imageSelection.toggleImageSelection,
});

const {
  runAIDesign,
  runAIGeneration,
} = useNoteAIActions({
  buildSelectionPayload,
  closeContextMenu,
  onDesign: (selection) => emit("ai-design", selection),
  onGenerate: (selection) => emit("ai-generate", selection),
});

const {
  handleNotebookClick,
  handleNotebookPointerDownCapture,
  handleWindowPointerDown,
  handleWindowResize,
} = useNotePanelWindow({
  closeContextMenu,
  focusMarkdownInputAtEnd,
  maybeStopEditingFromPointerDown,
  notebookRoot,
  scheduleMarkdownInputResize,
  shouldStartMarkdownEdit,
  toggleImageSelection,
});

function openFilePicker() {
  fileInput.value?.click();
}

function getDropInsertionIndex(event: DragEvent) {
  const block = resolveDropBlock(event);
  if (!block) {
    return getCurrentInsertionIndex();
  }

  const before = Number(block.dataset.noteInsertBefore);
  const after = Number(block.dataset.noteInsertAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return getCurrentInsertionIndex();
  }

  const rect = block.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? before : after;
}

function resolveDropBlock(event: DragEvent) {
  if (event.target instanceof Element) {
    const block = event.target.closest<HTMLElement>("[data-note-insert-before][data-note-insert-after]");
    if (block) {
      return block;
    }
  }

  const root = markdownSurface.value;
  if (!root) {
    return null;
  }

  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>("[data-note-insert-before][data-note-insert-after]"),
  );
  return blocks.find((block) => event.clientY < block.getBoundingClientRect().bottom)
    ?? blocks[blocks.length - 1]
    ?? null;
}

useNotePanelEffects({
  aiBusy: () => props.aiBusy,
  cancelMarkdownInputResize,
  clearDesignCardDeleteTimer,
  clearUnavailableImageSelections,
  closeContextMenu,
  document: () => props.document,
  handleWindowPointerDown,
  handleWindowResize,
  isOpen: () => props.isOpen,
  scheduleMarkdownInputResize,
  shouldShowMarkdownInput,
});
</script>

<template>
  <NotePanelShell
    v-model:notebook-root="notebookRoot"
    :is-open="isOpen"
    @attach="openFilePicker"
    @toggle="emit('toggle')"
  >
    <NoteDocumentArea
      v-model:notebook-scroll="notebookScroll"
      v-model:markdown-surface="markdownSurface"
      v-model:markdown-input="markdownInput"
      v-model:file-input="fileInput"
      :armed-design-card-delete-id="armedDesignCardDeleteId"
      :current-file="currentFile"
      :editable-markdown="editableMarkdown"
      :render-blocks="renderBlocks"
      :selected-image-paths="selectedImagePaths"
      :should-show-markdown-input="shouldShowMarkdownInput"
      @delete-design-card="requestDesignCardDelete"
      @drag-state="setDragging"
      @drop="handleDrop"
      @focus-markdown="handleMarkdownFocus"
      @image-context="handleImageBlockContext"
      @image-preview="openPreview"
      @image-remove="emit('remove-image', $event)"
      @image-select="toggleImageSelection"
      @input-markdown="updateMarkdown"
      @open-design-card="emit('open-design-card', $event)"
      @paste="handlePaste"
      @pick-images="pickImages"
      @pointerdown-capture="handleNotebookPointerDownCapture"
      @select-text="handleTextSelectionChange"
      @surface-click="handleNotebookClick"
      @surface-context="handleContextMenu"
      @write-more="focusMarkdownInputAtEnd"
    />

    <template #overlays>
      <NoteFloatingOverlays
        :ai-busy="aiBusy"
        :context-menu="contextMenu"
        :context-menu-images="contextMenuImages"
        :preview-image="previewImage"
        :preview-scale="previewScale"
        @close-preview="closePreview"
        @design="runAIDesign"
        @generate="runAIGeneration"
        @preview-context-image="previewContextImage"
        @remove-context-images="removeContextImages"
        @reset-preview="resetPreviewZoom"
        @wheel-preview="handlePreviewWheel"
        @zoom-preview="zoomPreview"
      />
    </template>
  </NotePanelShell>
</template>
