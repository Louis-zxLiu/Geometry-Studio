<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [payload: { imageDataUrl: string; problemText: string }];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const imageDataUrl = ref("");
const imageName = ref("");
const problemText = ref("");

watch(
  () => props.open,
  (open) => {
    if (!open) {
      imageDataUrl.value = "";
      imageName.value = "";
      problemText.value = "";
      if (fileInput.value) {
        fileInput.value.value = "";
      }
    }
  },
);

function pickImage() {
  fileInput.value?.click();
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) {
    return;
  }

  imageName.value = file.name;
  imageDataUrl.value = await readFileAsDataUrl(file);
}

function submit() {
  if (props.pending || (!imageDataUrl.value && !problemText.value.trim())) {
    return;
  }
  emit("confirm", {
    imageDataUrl: imageDataUrl.value,
    problemText: problemText.value.trim(),
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}
</script>

<template>
  <Transition name="dialog-enter">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="emit('cancel')">
      <section class="create-dialog geometry-problem-dialog">
        <h2>拍题建模</h2>

        <button
          class="geometry-image-picker"
          type="button"
          :disabled="pending"
          @click="pickImage"
        >
          <img
            v-if="imageDataUrl"
            :src="imageDataUrl"
            :alt="imageName"
          />
          <span v-else>选择题图</span>
        </button>

        <textarea
          class="geometry-dialog-textarea"
          :value="problemText"
          :disabled="pending"
          rows="5"
          placeholder="题干文本"
          @input="problemText = ($event.target as HTMLTextAreaElement).value"
        ></textarea>

        <input
          ref="fileInput"
          class="geometry-hidden-file"
          type="file"
          accept="image/*"
          @change="handleFileChange"
        />

        <div class="create-dialog-actions">
          <button
            class="dialog-button secondary"
            type="button"
            :disabled="pending"
            @click="emit('cancel')"
          >
            取消
          </button>
          <button
            class="dialog-button primary"
            type="button"
            :disabled="pending || (!imageDataUrl && !problemText.trim())"
            @click="submit"
          >
            开始
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>
