<script setup lang="ts">
import { writeNoteImageDragData } from "../../features/notebook/services/noteImageDragData";
import type { NoteRenderBlock } from "../../features/notebook/rendering/noteForwarder";

defineProps<{
  block: Extract<NoteRenderBlock, { kind: "image" }>;
  selected: boolean;
}>();

const emit = defineEmits<{
  preview: [src: string, alt: string];
  remove: [relativePath: string];
  select: [relativePath: string];
  context: [event: MouseEvent, relativePath: string];
}>();

function startDrag(event: DragEvent, block: Extract<NoteRenderBlock, { kind: "image" }>) {
  writeNoteImageDragData(event.dataTransfer, {
    blockId: block.id,
    endIndex: block.endIndex,
    relativePath: block.image.relativePath,
    source: "note",
    startIndex: block.startIndex,
  });
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "copyMove";
  }
}
</script>

<template>
  <figure
    class="notebook-image-block"
    :class="{ selected }"
    :data-note-image-path="block.image.relativePath"
    draggable="true"
    @dragstart="startDrag($event, block)"
    @click="emit('select', block.image.relativePath)"
    @contextmenu.stop.prevent="emit('context', $event, block.image.relativePath)"
  >
    <div class="notebook-image-actions">
      <button
        class="notebook-image-action"
        type="button"
        title="预览图片"
        aria-label="预览图片"
        @click.stop="emit('preview', block.image.dataUrl, block.image.alt || block.image.name)"
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
        @click.stop="emit('remove', block.image.relativePath)"
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
      draggable="false"
    />
  </figure>
</template>
