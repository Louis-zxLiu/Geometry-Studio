<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [payload: { dynamicConstruction: boolean; imageDataUrl: string; problemText: string }];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const imageDataUrl = ref("");
const imageName = ref("");
const problemText = ref("");
const dynamicConstruction = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      imageDataUrl.value = "";
      imageName.value = "";
      problemText.value = "";
      dynamicConstruction.value = false;
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

  await applyImageFile(file);
}

async function handlePaste(event: ClipboardEvent) {
  if (!props.open || props.pending) {
    return;
  }

  const file = getClipboardImage(event.clipboardData);
  if (!file) {
    return;
  }

  event.preventDefault();
  await applyImageFile(file, "粘贴的题图");
}

async function applyImageFile(file: File, fallbackName = "题图") {
  imageName.value = file.name;
  if (!imageName.value) {
    imageName.value = fallbackName;
  }
  imageDataUrl.value = await readFileAsDataUrl(file);
}

function submit() {
  if (props.pending || (!imageDataUrl.value && !problemText.value.trim())) {
    return;
  }
  emit("confirm", {
    dynamicConstruction: dynamicConstruction.value,
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

function getClipboardImage(data: DataTransfer | null) {
  const items = Array.from(data?.items ?? []);
  for (const item of items) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      return file;
    }
  }

  return Array.from(data?.files ?? []).find((file) => file.type.startsWith("image/")) ?? null;
}

onMounted(() => {
  window.addEventListener("paste", handlePaste);
});

onBeforeUnmount(() => {
  window.removeEventListener("paste", handlePaste);
});
</script>

<template>
  <Transition name="dialog-enter">
    <div v-if="open" class="dialog-backdrop" @mousedown.self="emit('cancel')">
      <section class="create-dialog geometry-problem-dialog">
        <h2>拍照解题</h2>

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
          <span v-else>选择/粘贴题图</span>
        </button>

        <textarea
          class="geometry-dialog-textarea"
          :value="problemText"
          :disabled="pending"
          rows="5"
          placeholder="也可以直接输入题干文本；没有配图的几何题会按文字解析"
          @input="problemText = ($event.target as HTMLTextAreaElement).value"
        ></textarea>

        <label class="geometry-dynamic-toggle">
          <input
            v-model="dynamicConstruction"
            type="checkbox"
            :disabled="pending"
          />
          <span>
            <strong>生成可调构象代码</strong>
            <small>在生成的 Matplotlib 代码中加入滑块，用来调整角度、比例或自由点位置。</small>
          </span>
        </label>

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
            开始解题
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>
