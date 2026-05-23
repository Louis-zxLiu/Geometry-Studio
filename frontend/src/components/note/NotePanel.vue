<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AINoteSelectionPayload } from "../../features/ai/services/aiTypes";
import type { NoteRenderBlock } from "../../features/notebook/rendering/noteForwarder";
import type { NoteDocument } from "../../features/notebook/services/notebookStorage";
import {
  buildAINoteSelectionPayload,
  collectSelectedImagesForContextMenu,
} from "../../features/notebook/selection/noteSelection";
import NoteContextMenu from "./NoteContextMenu.vue";
import NoteImageBlock from "./NoteImageBlock.vue";
import NoteImagePreview from "./NoteImagePreview.vue";

const props = defineProps<{
  currentFile: string;
  document: NoteDocument;
  isOpen: boolean;
  renderBlocks: NoteRenderBlock[];
  saveState: "idle" | "saving" | "saved";
  aiBusy?: boolean;
}>();

const emit = defineEmits<{
  "add-images": [payload: { files: File[]; insertAt: number }];
  "ai-generate": [selection: AINoteSelectionPayload];
  "ai-design": [selection: AINoteSelectionPayload];
  "remove-image": [relativePath: string];
  toggle: [];
  "update:markdown": [markdown: string];
}>();

const notebookRoot = ref<HTMLElement | null>(null);
const notebookScroll = ref<HTMLElement | null>(null);
const markdownSurface = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const markdownInput = ref<HTMLTextAreaElement | null>(null);
const previewImage = ref<{ src: string; alt: string } | null>(null);
const previewScale = ref(1);
const isEditingMarkdown = ref(false);
const isDragging = ref(false);
const textSelection = ref<{ text: string; selectedAt: number } | null>(null);
const selectedImageOrder = ref<Record<string, number>>({});
const contextMenu = ref<{ x: number; y: number } | null>(null);
let selectionOrder = 0;
let markdownResizeFrame = 0;

const markdownBlocks = computed(() =>
  props.renderBlocks.filter((block) => block.kind === "markdown"),
);

const imageBlocks = computed(() =>
  props.renderBlocks.filter((block) => block.kind === "image"),
);

const contextMenuImages = computed(() =>
  collectSelectedImagesForContextMenu(props.document, textSelection.value, selectedImageOrder.value),
);

const shouldShowMarkdownInput = computed(() => isEditingMarkdown.value);
const selectedImagePaths = computed(
  () => new Set(Object.keys(selectedImageOrder.value)),
);

function updateMarkdown(event: Event) {
  emit("update:markdown", (event.target as HTMLTextAreaElement).value);
  scheduleMarkdownInputResize();
}

function openFilePicker() {
  fileInput.value?.click();
}

function openPreview(src: string, alt: string) {
  previewImage.value = { src, alt };
  previewScale.value = 1;
}

function closePreview() {
  previewImage.value = null;
  previewScale.value = 1;
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
  selectedImageOrder.value = {};
  closeContextMenu();
}

function focusMarkdownInputAtEnd() {
  const nextMarkdown = ensureTrailingWriteLine(props.document.markdown);
  if (nextMarkdown !== props.document.markdown) {
    emit("update:markdown", nextMarkdown);
  }

  isEditingMarkdown.value = true;
  closeContextMenu();
  void nextTick(() => {
    const textarea = markdownInput.value;
    const scrollContainer = notebookScroll.value;
    if (!textarea) {
      return;
    }

    resizeMarkdownInput();
    const end = textarea.value.length;
    textarea.focus();
    textarea.setSelectionRange(end, end);
    textarea.scrollTop = textarea.scrollHeight;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  });
}

function pickImages(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files?.length) {
    return;
  }

  emit("add-images", {
    files: Array.from(target.files),
    insertAt: getCurrentInsertionIndex(),
  });
  target.value = "";
}

function handlePaste(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items ?? []);
  const files = items
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File);

  if (!files.length) {
    return;
  }

  event.preventDefault();
  emit("add-images", {
    files,
    insertAt: getCurrentInsertionIndex(),
  });
}

function handleDrop(event: DragEvent) {
  isDragging.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );
  if (!files.length) {
    return;
  }

  event.preventDefault();
  emit("add-images", {
    files,
    insertAt: getCurrentInsertionIndex(),
  });
}

function setDragging(nextValue: boolean) {
  isDragging.value = nextValue;
}

function toggleImageSelection(relativePath: string) {
  closeContextMenu();
  if (!relativePath) {
    return;
  }

  if (selectedImageOrder.value[relativePath]) {
    const nextOrder = { ...selectedImageOrder.value };
    delete nextOrder[relativePath];
    selectedImageOrder.value = nextOrder;
    return;
  }

  selectedImageOrder.value = {
    ...selectedImageOrder.value,
    [relativePath]: nextSelectionOrder(),
  };
}

function handleContextMenu(event: MouseEvent) {
  const relativePath = resolveImagePathFromEventTarget(event.target);
  const hasContextSelection = relativePath !== "" || isTextSelectionContextTarget(event.target);
  if (!hasContextSelection) {
    closeContextMenu();
    return;
  }

  event.preventDefault();
  if (relativePath) {
    ensureImageSelection(relativePath);
  }
  syncTextSelection();
  if (!hasSelection()) {
    closeContextMenu();
    return;
  }

  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
  };
}

function handleTextSelectionChange() {
  window.requestAnimationFrame(() => {
    syncTextSelection();
  });
}

function handleMarkdownFocus() {
  isEditingMarkdown.value = true;
  scheduleMarkdownInputResize();
}

function handlePreviewWheel(event: WheelEvent) {
  if (!previewImage.value) {
    return;
  }

  event.preventDefault();
  const nextScale = event.deltaY < 0 ? previewScale.value + 0.2 : previewScale.value - 0.2;
  previewScale.value = clampPreviewScale(nextScale);
}

function zoomPreview(delta: number) {
  previewScale.value = clampPreviewScale(previewScale.value + delta);
}

function resetPreviewZoom() {
  previewScale.value = 1;
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

function shouldStartMarkdownEdit(target: EventTarget | null) {
  if (!props.currentFile || shouldShowMarkdownInput.value) {
    return false;
  }

  if (resolveImagePathFromEventTarget(target)) {
    return false;
  }

  if (target === notebookScroll.value) {
    return true;
  }

  if (!(target instanceof Node)) {
    return false;
  }

  if (markdownSurface.value?.contains(target)) {
    return true;
  }

  if (target instanceof HTMLElement) {
    return target.classList.contains("notebook-document-flow");
  }

  return false;
}

function handleImageBlockContext(event: MouseEvent, relativePath: string) {
  ensureImageSelection(relativePath);
  handleContextMenu(event);
}

function syncTextSelection() {
  const textarea = markdownInput.value;
  if (textarea && document.activeElement === textarea) {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const nextText = textarea.value.slice(start, end).trim();
    if (nextText !== "") {
      textSelection.value = {
        text: nextText,
        selectedAt: nextSelectionOrder(),
      };
      return;
    }
  }

  const selection = window.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    !notebookRoot.value?.contains(selection.anchorNode) ||
    !notebookRoot.value?.contains(selection.focusNode)
  ) {
    textSelection.value = null;
    return;
  }

  const nextText = selection.toString().trim();
  if (nextText === "") {
    textSelection.value = null;
    return;
  }

  textSelection.value = {
    text: nextText,
    selectedAt: nextSelectionOrder(),
  };
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

function buildSelectionPayload(): AINoteSelectionPayload | null {
  return buildAINoteSelectionPayload(
    props.document,
    textSelection.value,
    selectedImageOrder.value,
  );
}

function isTextSelectionContextTarget(target: EventTarget | null) {
  const textarea = markdownInput.value;
  if (
    textarea &&
    document.activeElement === textarea &&
    textarea.selectionStart !== textarea.selectionEnd &&
    target === textarea
  ) {
    return true;
  }

  if (!(target instanceof Node)) {
    return false;
  }

  const selection = window.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    !notebookRoot.value?.contains(selection.anchorNode) ||
    !notebookRoot.value?.contains(selection.focusNode)
  ) {
    return false;
  }

  try {
    return selection.getRangeAt(0).intersectsNode(target);
  } catch {
    return false;
  }
}

function clampPreviewScale(scale: number) {
  return Math.max(0.6, Math.min(4, Number(scale.toFixed(2))));
}

function hasSelection() {
  return buildSelectionPayload() !== null;
}

function closeContextMenu() {
  contextMenu.value = null;
}

function handleWindowResize() {
  closeContextMenu();
  scheduleMarkdownInputResize();
}

function scheduleMarkdownInputResize() {
  if (markdownResizeFrame) {
    window.cancelAnimationFrame(markdownResizeFrame);
  }

  markdownResizeFrame = window.requestAnimationFrame(() => {
    markdownResizeFrame = 0;
    resizeMarkdownInput();
  });
}

function resizeMarkdownInput() {
  const textarea = markdownInput.value;
  if (!textarea || !shouldShowMarkdownInput.value) {
    return;
  }

  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(42, textarea.scrollHeight)}px`;
}

function ensureImageSelection(relativePath: string) {
  if (!relativePath || selectedImageOrder.value[relativePath]) {
    return;
  }

  selectedImageOrder.value = {
    ...selectedImageOrder.value,
    [relativePath]: nextSelectionOrder(),
  };
}

function handleWindowPointerDown(event: PointerEvent) {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (isInsideFloatingNoteUI(target)) {
    return;
  }

  const isInsideMarkdownSurface = Boolean(markdownSurface.value?.contains(target));
  if (isEditingMarkdown.value && !isInsideMarkdownSurface) {
    isEditingMarkdown.value = false;
  }

  if (!notebookRoot.value?.contains(target)) {
    closeContextMenu();
  }
}

function clearUnavailableImageSelections() {
  const availablePaths = new Set(
    props.document.images.map((image) => image.relativePath),
  );
  const nextSelection: Record<string, number> = {};
  Object.entries(selectedImageOrder.value).forEach(([relativePath, selectedAt]) => {
    if (availablePaths.has(relativePath)) {
      nextSelection[relativePath] = selectedAt;
    }
  });
  selectedImageOrder.value = nextSelection;
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

function ensureTrailingWriteLine(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized) {
    return normalized;
  }

  if (normalized.endsWith("\n\n")) {
    return normalized;
  }

  if (normalized.endsWith("\n")) {
    return `${normalized}\n`;
  }

  return `${normalized}\n\n`;
}

function getCurrentInsertionIndex() {
  const textarea = markdownInput.value;
  if (textarea && document.activeElement === textarea) {
    return textarea.selectionStart ?? textarea.value.length;
  }

  return props.document.markdown.length;
}

onMounted(() => {
  window.addEventListener("pointerdown", handleWindowPointerDown, true);
  window.addEventListener("resize", handleWindowResize);
  scheduleMarkdownInputResize();
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handleWindowPointerDown, true);
  window.removeEventListener("resize", handleWindowResize);
  if (markdownResizeFrame) {
    window.cancelAnimationFrame(markdownResizeFrame);
  }
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
              :value="document.markdown"
              placeholder=""
              rows="1"
              :disabled="!currentFile"
              @focus="handleMarkdownFocus"
              @input="updateMarkdown"
              @select="handleTextSelectionChange"
              @click.stop
            />

            <article
              v-for="block in markdownBlocks"
              v-show="!shouldShowMarkdownInput"
              :key="block.id"
              class="notebook-markdown-rendered"
              v-html="block.html"
            ></article>

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

          <template v-for="block in imageBlocks" :key="block.id">
            <NoteImageBlock
              :block="block"
              :selected="selectedImagePaths.has(block.image.relativePath)"
              @preview="openPreview"
              @remove="emit('remove-image', $event)"
              @select="toggleImageSelection"
              @context="handleImageBlockContext"
            />
          </template>

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
