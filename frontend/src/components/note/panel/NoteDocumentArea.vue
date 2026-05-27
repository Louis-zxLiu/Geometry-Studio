<script setup lang="ts">
import DesignCardInvalidBlock from "../../../features/designCard/components/DesignCardInvalidBlock.vue";
import type { NoteRenderBlock } from "../../../features/notebook/rendering/noteForwarder";
import type { NoteDropInsertionPoint } from "../useNoteDrop";
import NoteDesignCardBlock from "../NoteDesignCardBlock.vue";
import NoteImageBlock from "../NoteImageBlock.vue";

defineProps<{
  armedDesignCardDeleteId: string;
  currentFile: string;
  dropInsertionPoint: NoteDropInsertionPoint | null;
  editableMarkdown: string;
  renderBlocks: NoteRenderBlock[];
  selectedImagePaths: Set<string>;
  shouldShowMarkdownInput: boolean;
}>();

const emit = defineEmits<{
  "delete-design-card": [cardId: string];
  "focus-markdown": [];
  "image-context": [event: MouseEvent, relativePath: string];
  "image-preview": [src: string, alt: string];
  "image-remove": [relativePath: string];
  "image-select": [relativePath: string];
  "input-markdown": [event: Event];
  "open-design-card": [cardId: string];
  paste: [event: ClipboardEvent];
  "pick-images": [event: Event];
  "pointerdown-capture": [event: PointerEvent];
  "select-text": [];
  "surface-click": [event: MouseEvent];
  "surface-context": [event: MouseEvent];
  "write-more": [];
}>();

const notebookScroll = defineModel<HTMLElement | null>("notebookScroll", { default: null });
const markdownSurface = defineModel<HTMLElement | null>("markdownSurface", { default: null });
const markdownInput = defineModel<HTMLTextAreaElement | null>("markdownInput", { default: null });
const fileInput = defineModel<HTMLInputElement | null>("fileInput", { default: null });
</script>

<template>
  <div
    ref="notebookScroll"
    class="notebook-scroll"
    @pointerdown.capture="emit('pointerdown-capture', $event)"
    @paste="emit('paste', $event)"
    @click="emit('surface-click', $event)"
    @contextmenu="emit('surface-context', $event)"
    @mouseup="emit('select-text')"
    @keyup="emit('select-text')"
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
          @focus="emit('focus-markdown')"
          @input="emit('input-markdown', $event)"
          @select="emit('select-text')"
          @click.stop
        />

        <template v-if="!shouldShowMarkdownInput">
          <template v-for="block in renderBlocks" :key="block.id">
            <div
              class="notebook-render-block"
              :class="{
                'drop-before': dropInsertionPoint?.blockId === block.id && dropInsertionPoint.edge === 'before',
                'drop-after': dropInsertionPoint?.blockId === block.id && dropInsertionPoint.edge === 'after',
              }"
              :data-note-block-id="block.id"
              :data-note-insert-before="block.startIndex"
              :data-note-insert-after="block.endIndex"
              :data-note-markdown-source="block.kind === 'markdown' ? block.markdown : undefined"
            >
              <article
                v-if="block.kind === 'markdown'"
                class="notebook-markdown-rendered"
                v-html="block.html"
              ></article>
              <NoteImageBlock
                v-else-if="block.kind === 'image'"
                :block="block"
                :selected="selectedImagePaths.has(block.image.relativePath)"
                @preview="(src, alt) => emit('image-preview', src, alt)"
                @remove="emit('image-remove', $event)"
                @select="emit('image-select', $event)"
                @context="(event, relativePath) => emit('image-context', event, relativePath)"
              />
              <NoteDesignCardBlock
                v-else-if="block.card"
                :card="block.card"
                :armed="armedDesignCardDeleteId === block.card.id"
                :selection-label="block.displayIndex ? `[design-card-${String(block.displayIndex).padStart(2, '0')}]` : ''"
                @delete="emit('delete-design-card', $event)"
                @open="emit('open-design-card', $event)"
              />
              <DesignCardInvalidBlock v-else :card-id="block.cardId" />
            </div>
          </template>
        </template>

        <button
          v-if="!shouldShowMarkdownInput && currentFile"
          class="notebook-continue-writing"
          type="button"
          @click.stop="emit('write-more')"
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
        @change="emit('pick-images', $event)"
      />
    </section>
  </div>
</template>
