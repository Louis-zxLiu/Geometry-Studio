<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import DesignCardInvalidBlock from "../../features/designCard/components/DesignCardInvalidBlock.vue";
import type { DesignCard } from "../../features/designCard/services/designCardTypes";
import type { AINoteSelectionPayload } from "../../features/ai/services/aiTypes";
import type { NoteRenderBlock } from "../../features/notebook/rendering/noteForwarder";
import type { NoteDocument } from "../../features/notebook/services/notebookStorage";
import NoteContextMenu from "./NoteContextMenu.vue";
import NoteDesignCardBlock from "./NoteDesignCardBlock.vue";
import NoteImageBlock from "./NoteImageBlock.vue";
import NoteImagePreview from "./NoteImagePreview.vue";
import { useNoteContextSelection } from "./useNoteContextSelection";
import { useNoteDesignCardDelete } from "./useNoteDesignCardDelete";
import { useNoteDrop } from "./useNoteDrop";
import { useNoteImagePreview } from "./useNoteImagePreview";
import { useNoteImageSelection } from "./useNoteImageSelection";
import { useNoteMarkdownEditing } from "./useNoteMarkdownEditing";

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
let selectionOrder = 0;

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

function openFilePicker() {
  fileInput.value?.click();
}

function previewContextImage() {
  const image = contextMenuImages.value[0];
  if (!image) {
    return;
  }

  openPreview(image.dataUrl, image.alt || image.name);
  closeContextMenu();
}

function removeContextImages() {
  const images = contextMenuImages.value;
  if (!images.length) {
    return;
  }

  images.forEach((image) => {
    emit("remove-image", image.relativePath);
  });
  clearImageSelection();
  closeContextMenu();
}

function toggleImageSelection(relativePath: string) {
  closeContextMenu();
  imageSelection.toggleImageSelection(relativePath);
}

function handleNotebookPointerDownCapture(event: PointerEvent) {
  if (shouldStartMarkdownEdit(event.target)) {
    event.preventDefault();
    focusMarkdownInputAtEnd();
  }
}

function handleNotebookClick(event: MouseEvent) {
  const relativePath = resolveImagePathFromEventTarget(event.target);
  if (!relativePath) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  toggleImageSelection(relativePath);
}

function handleImageBlockContext(event: MouseEvent, relativePath: string) {
  ensureImageSelection(relativePath);
  handleContextMenu(event);
}

function runAIGeneration() {
  runAIAction("generate");
}

function runAIDesign() {
  runAIAction("design");
}

function runAIAction(kind: "generate" | "design") {
  const selection = buildSelectionPayload();
  if (!selection) {
    closeContextMenu();
    return;
  }

  if (kind === "design") {
    emit("ai-design", selection);
  } else {
    emit("ai-generate", selection);
  }
  closeContextMenu();
}


function handleWindowResize() {
  closeContextMenu();
  scheduleMarkdownInputResize();
}

function handleWindowPointerDown(event: PointerEvent) {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (isInsideFloatingNoteUI(target)) {
    return;
  }

  maybeStopEditingFromPointerDown(target);

  if (!notebookRoot.value?.contains(target)) {
    closeContextMenu();
  }
}

function nextSelectionOrder() {
  selectionOrder += 1;
  return selectionOrder;
}

function resolveImagePathFromEventTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return "";
  }

  const imageElement = target.closest("[data-note-image-path]");
  if (!(imageElement instanceof HTMLElement)) {
    return "";
  }

  return imageElement.dataset.noteImagePath ?? "";
}

function isInsideFloatingNoteUI(target: Node) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(".notebook-context-menu") ||
      target.closest(".notebook-image-preview") ||
      target.closest(".notebook-preview-toolbar"),
  );
}

onMounted(() => {
  window.addEventListener("pointerdown", handleWindowPointerDown, true);
  window.addEventListener("resize", handleWindowResize);
  scheduleMarkdownInputResize();
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handleWindowPointerDown, true);
  window.removeEventListener("resize", handleWindowResize);
  cancelMarkdownInputResize();
  clearDesignCardDeleteTimer();
});

watch(
  () => props.document.images,
  () => {
    clearUnavailableImageSelections();
  },
  { deep: true },
);

watch(
  () => props.aiBusy,
  (busy) => {
    if (busy) {
      closeContextMenu();
    }
  },
);

watch(
  () => props.document.markdown,
  () => {
    void nextTick(scheduleMarkdownInputResize);
  },
);

watch(
  () => [shouldShowMarkdownInput.value, props.isOpen],
  () => {
    void nextTick(scheduleMarkdownInputResize);
  },
);
</script>

<template>
  <aside ref="notebookRoot" class="notebook-pane" :class="{ collapsed: !isOpen }">
    <button
      class="notebook-spine"
      type="button"
      :title="isOpen ? '收起笔记区' : '展开笔记区'"
      :aria-label="isOpen ? '收起笔记区' : '展开笔记区'"
      @click="emit('toggle')"
    >
      <svg class="notebook-spine-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          v-if="isOpen"
          d="m14 7-5 5 5 5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.7"
        />
        <path
          v-else
          d="m10 7 5 5-5 5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.7"
        />
      </svg>
    </button>

    <div v-show="isOpen" class="notebook-panel-shell">
      <button
        class="notebook-attach-button"
        type="button"
        title="添加图片"
        aria-label="添加图片"
        @click="openFilePicker"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M8 12.5 13.5 7a3.2 3.2 0 1 1 4.5 4.5l-7.6 7.6a4.4 4.4 0 0 1-6.2-6.2l8-8"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.6"
          />
        </svg>
      </button>
      <div
        ref="notebookScroll"
        class="notebook-scroll"
        @pointerdown.capture="handleNotebookPointerDownCapture"
        @paste="handlePaste"
        @dragenter.prevent="setDragging(true)"
        @dragover.prevent="setDragging(true)"
        @dragleave.prevent="setDragging(false)"
        @drop="handleDrop"
        @click="handleNotebookClick"
        @contextmenu="handleContextMenu"
        @mouseup="handleTextSelectionChange"
        @keyup="handleTextSelectionChange"
      >
        <section class="notebook-document-flow">
          <div
            ref="markdownSurface"
            class="notebook-markdown-surface"
            :class="{ editing: shouldShowMarkdownInput }"
          >
            <textarea
              v-show="shouldShowMarkdownInput"
              ref="markdownInput"
              class="notebook-markdown-input"
              :value="editableMarkdown"
              placeholder=""
              rows="1"
              :disabled="!currentFile"
              @focus="handleMarkdownFocus"
              @input="updateMarkdown"
              @select="handleTextSelectionChange"
              @click.stop
            />

            <template v-if="!shouldShowMarkdownInput">
              <template v-for="block in renderBlocks" :key="block.id">
                <article
                  v-if="block.kind === 'markdown'"
                  class="notebook-markdown-rendered"
                  v-html="block.html"
                ></article>
                <NoteImageBlock
                  v-else-if="block.kind === 'image'"
                  :block="block"
                  :selected="selectedImagePaths.has(block.image.relativePath)"
                  @preview="openPreview"
                  @remove="emit('remove-image', $event)"
                  @select="toggleImageSelection"
                  @context="handleImageBlockContext"
                />
                <NoteDesignCardBlock
                  v-else-if="block.card"
                  :card="block.card"
                  :armed="armedDesignCardDeleteId === block.card.id"
                  @delete="requestDesignCardDelete"
                  @open="emit('open-design-card', $event)"
                />
                <DesignCardInvalidBlock v-else :card-id="block.cardId" />
              </template>
            </template>

            <button
              v-if="!shouldShowMarkdownInput && currentFile"
              class="notebook-continue-writing"
              type="button"
              @click.stop="focusMarkdownInputAtEnd"
            >
              继续写点什么
            </button>
          </div>

          <input
            ref="fileInput"
            class="notebook-file-input"
            type="file"
            accept="image/*"
            multiple
            @change="pickImages"
          />

        </section>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="floating-menu" appear>
        <NoteContextMenu
          v-if="contextMenu && !aiBusy"
          :position="contextMenu"
          :images="contextMenuImages"
          @preview="previewContextImage"
          @design="runAIDesign"
          @generate="runAIGeneration"
          @remove="removeContextImages"
        />
      </Transition>

      <Transition name="preview-dialog" appear>
        <NoteImagePreview
          v-if="previewImage"
          :image="previewImage"
          :scale="previewScale"
          @close="closePreview"
          @wheel="handlePreviewWheel"
          @zoom="zoomPreview"
          @reset="resetPreviewZoom"
        />
      </Transition>
    </Teleport>
  </aside>
</template>
