<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AINoteSelectionItem, AINoteSelectionPayload } from "../features/ai/services/aiTypes";
import type { NoteRenderBlock } from "../features/notebook/rendering/noteForwarder";
import type { NoteDocument } from "../features/notebook/services/notebookStorage";

const props = defineProps<{
  currentFile: string;
  document: NoteDocument;
  isOpen: boolean;
  renderBlocks: NoteRenderBlock[];
  saveState: "idle" | "saving" | "saved";
  aiBusy?: boolean;
}>();

const emit = defineEmits<{
  "add-images": [files: File[]];
  "ai-generate": [selection: AINoteSelectionPayload];
  "remove-image": [relativePath: string];
  toggle: [];
  "update:markdown": [markdown: string];
}>();

const notebookRoot = ref<HTMLElement | null>(null);
const notebookScroll = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const markdownInput = ref<HTMLTextAreaElement | null>(null);
const previewImage = ref<{ src: string; alt: string } | null>(null);
const isEditingMarkdown = ref(false);
const isDragging = ref(false);
const textSelection = ref<{ text: string; selectedAt: number } | null>(null);
const selectedImageOrder = ref<Record<string, number>>({});
const contextMenu = ref<{ x: number; y: number } | null>(null);
let selectionOrder = 0;

const markdownBlocks = computed(() =>
  props.renderBlocks.filter((block) => block.kind === "markdown"),
);

const imageBlocks = computed(() =>
  props.renderBlocks.filter((block) => block.kind === "image"),
);

const shouldShowMarkdownInput = computed(
  () => isEditingMarkdown.value || props.document.markdown.trim() === "",
);
const selectedImagePaths = computed(
  () => new Set(Object.keys(selectedImageOrder.value)),
);

function updateMarkdown(event: Event) {
  emit("update:markdown", (event.target as HTMLTextAreaElement).value);
}

function openFilePicker() {
  fileInput.value?.click();
}

function openPreview(src: string, alt: string) {
  previewImage.value = { src, alt };
}

function closePreview() {
  previewImage.value = null;
}

function focusMarkdownInput() {
  isEditingMarkdown.value = true;
  closeContextMenu();
  window.requestAnimationFrame(() => {
    markdownInput.value?.focus();
  });
}

function pickImages(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files?.length) {
    return;
  }

  emit("add-images", Array.from(target.files));
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
  emit("add-images", files);
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
  emit("add-images", files);
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
  event.preventDefault();
  const relativePath = resolveImagePathFromEventTarget(event.target);
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

function handleNotebookClick(event: MouseEvent) {
  const relativePath = resolveImagePathFromEventTarget(event.target);
  if (!relativePath) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  toggleImageSelection(relativePath);
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
  const selection = buildSelectionPayload();
  if (!selection) {
    closeContextMenu();
    return;
  }

  emit("ai-generate", selection);
  closeContextMenu();
}

function buildSelectionPayload(): AINoteSelectionPayload | null {
  const orderedItems: Array<AINoteSelectionItem & { selectedAt: number }> = [];
  if (textSelection.value?.text) {
    orderedItems.push({
      kind: "text",
      text: textSelection.value.text,
      selectedAt: textSelection.value.selectedAt,
    });
  }

  props.document.images.forEach((image) => {
    const selectedAt = selectedImageOrder.value[image.relativePath];
    if (!selectedAt) {
      return;
    }

    orderedItems.push({
      kind: "image",
      name: image.name,
      alt: image.alt,
      dataUrl: image.dataUrl,
      relativePath: image.relativePath,
      selectedAt,
    });
  });

  orderedItems.sort((left, right) => left.selectedAt - right.selectedAt);
  if (!orderedItems.length) {
    return null;
  }

  return {
    items: orderedItems.map(({ selectedAt: _selectedAt, ...item }) => item),
  };
}

function hasSelection() {
  return buildSelectionPayload() !== null;
}

function closeContextMenu() {
  contextMenu.value = null;
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

function handleWindowPointerDown(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Node) || notebookRoot.value?.contains(target)) {
    return;
  }

  closeContextMenu();
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

onMounted(() => {
  window.addEventListener("mousedown", handleWindowPointerDown);
  window.addEventListener("resize", closeContextMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener("mousedown", handleWindowPointerDown);
  window.removeEventListener("resize", closeContextMenu);
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
            class="notebook-markdown-surface"
            :class="{ editing: shouldShowMarkdownInput }"
            @click="focusMarkdownInput"
          >
            <textarea
              v-show="shouldShowMarkdownInput"
              ref="markdownInput"
              class="notebook-markdown-input"
              :value="document.markdown"
              placeholder=""
              rows="1"
              :disabled="!currentFile"
              @focus="isEditingMarkdown = true"
              @blur="isEditingMarkdown = false"
              @input="updateMarkdown"
              @select="handleTextSelectionChange"
            />

            <article
              v-for="block in markdownBlocks"
              v-show="!shouldShowMarkdownInput"
              :key="block.id"
              class="notebook-markdown-rendered"
              v-html="block.html"
            ></article>
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
            <figure
              class="notebook-image-block"
              :class="{ selected: selectedImagePaths.has(block.image.relativePath) }"
              @mousedown.left.prevent
              @click="toggleImageSelection(block.image.relativePath)"
              @contextmenu.stop.prevent="ensureImageSelection(block.image.relativePath); handleContextMenu($event)"
            >
              <div class="notebook-image-actions">
                <button
                  class="notebook-image-action"
                  type="button"
                  title="预览图片"
                  aria-label="预览图片"
                  @click.stop="openPreview(block.image.dataUrl, block.image.alt || block.image.name)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6Z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.7"
                    />
                    <path
                      d="M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.7"
                    />
                  </svg>
                </button>

                <button
                  class="notebook-image-action danger"
                  type="button"
                  title="移除图片"
                  aria-label="移除图片"
                  @click.stop="emit('remove-image', block.image.relativePath)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M6 7h12"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.7"
                    />
                    <path
                      d="m9 7 .6-2h4.8L15 7"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.7"
                    />
                    <path
                      d="M8 7v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7"
                      fill="none"
                      stroke="currentColor"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.7"
                    />
                  </svg>
                </button>
              </div>
              <img
                class="notebook-image"
                :src="block.image.dataUrl"
                :alt="block.image.alt || block.image.name"
              />
            </figure>
          </template>
        </section>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenu && !aiBusy"
        class="notebook-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        @mousedown.stop
      >
        <button class="notebook-context-action" type="button" @click="runAIGeneration">
          <svg class="notebook-context-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4.5" y="4.5" width="15" height="15" />
            <path d="M9 15.4 12 8.6l3 6.8" />
            <path d="M10 13.2h4" />
            <path d="M8 4.5V2.8" />
            <path d="M16 4.5V2.8" />
            <path d="M8 21.2v-1.7" />
            <path d="M16 21.2v-1.7" />
          </svg>
          <span>可视化</span>
        </button>
      </div>

      <div
        v-if="previewImage"
        class="notebook-image-preview"
        role="dialog"
        aria-modal="true"
        @click.self="closePreview"
      >
        <button
          class="notebook-preview-close"
          type="button"
          title="关闭预览"
          aria-label="关闭预览"
          @click="closePreview"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="m7 7 10 10M17 7 7 17"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8"
            />
          </svg>
        </button>
        <img
          class="notebook-preview-image"
          :src="previewImage.src"
          :alt="previewImage.alt"
        />
      </div>
    </Teleport>
  </aside>
</template>
