<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

type GeometryQualityMode = "fast" | "quality";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [payload: {
    dynamicConstruction: boolean;
    imageDataUrl: string;
    problemText: string;
    qualityMode: GeometryQualityMode;
  }];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const imageDataUrl = ref("");
const imageName = ref("");
const imageMeta = ref("");
const problemText = ref("");
const dynamicConstruction = ref(false);
const qualityMode = ref<GeometryQualityMode>("quality");

const costEstimate = computed(() => {
  const hasImage = !!imageDataUrl.value;
  if (qualityMode.value === "fast") {
    return hasImage
      ? "快速模式：最多 3 轮，使用题图，不追加渲染图反馈，成本较低。"
      : "快速模式：最多 3 轮，适合文字题或先试跑。";
  }
  return hasImage
    ? "精修模式：最多 5 轮，可结合题图和渲染图反馈，成本较高但更稳。"
    : "精修模式：最多 5 轮，适合复杂题和最终出图。";
});

watch(
  () => props.open,
  (open) => {
    if (!open) {
      imageDataUrl.value = "";
      imageName.value = "";
      imageMeta.value = "";
      problemText.value = "";
      dynamicConstruction.value = false;
      qualityMode.value = "quality";
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
  imageName.value = file.name || fallbackName;
  const originalSize = file.size;
  const compressed = await compressImageFile(file);
  imageDataUrl.value = compressed.dataUrl;
  imageMeta.value = formatImageMeta(originalSize, compressed.bytes, compressed.width, compressed.height);
}

function submit() {
  if (props.pending || (!imageDataUrl.value && !problemText.value.trim())) {
    return;
  }
  emit("confirm", {
    dynamicConstruction: dynamicConstruction.value,
    imageDataUrl: imageDataUrl.value,
    problemText: problemText.value.trim(),
    qualityMode: qualityMode.value,
  });
}

async function compressImageFile(file: File) {
  if (/svg|gif/i.test(file.type)) {
    const dataUrl = await readFileAsDataUrl(file);
    return { dataUrl, bytes: estimateDataUrlBytes(dataUrl), width: 0, height: 0 };
  }

  try {
    const source = await readFileAsDataUrl(file);
    const image = await loadImage(source);
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas is unavailable");
    }
    context.drawImage(image, 0, 0, width, height);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const dataUrl = canvas.toDataURL(type, type === "image/jpeg" ? 0.82 : undefined);
    return { dataUrl, bytes: estimateDataUrlBytes(dataUrl), width, height };
  } catch {
    const dataUrl = await readFileAsDataUrl(file);
    return { dataUrl, bytes: estimateDataUrlBytes(dataUrl), width: 0, height: 0 };
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
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

function estimateDataUrlBytes(dataUrl: string) {
  const payload = dataUrl.split(",", 2)[1] ?? "";
  return Math.round((payload.length * 3) / 4);
}

function formatImageMeta(originalBytes: number, nextBytes: number, width: number, height: number) {
  const sizeText = `${formatBytes(originalBytes)} -> ${formatBytes(nextBytes)}`;
  const dimensionText = width && height ? ` · ${width}×${height}` : "";
  return `${sizeText}${dimensionText}`;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
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
        <h2>几何解题</h2>

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
          <span v-else>选择或粘贴题图</span>
        </button>
        <small v-if="imageMeta" class="geometry-image-meta">{{ imageMeta }}</small>

        <textarea
          class="geometry-dialog-textarea"
          :value="problemText"
          :disabled="pending"
          rows="5"
          placeholder="也可以直接输入题干文本；没有配图的几何题会按文字解析"
          @input="problemText = ($event.target as HTMLTextAreaElement).value"
        ></textarea>

        <div class="geometry-cost-mode" role="radiogroup" aria-label="成本模式">
          <button
            type="button"
            :class="{ active: qualityMode === 'fast' }"
            :disabled="pending"
            @click="qualityMode = 'fast'"
          >
            快速
          </button>
          <button
            type="button"
            :class="{ active: qualityMode === 'quality' }"
            :disabled="pending"
            @click="qualityMode = 'quality'"
          >
            精修
          </button>
        </div>
        <p class="geometry-cost-note">{{ costEstimate }}</p>

        <label class="geometry-dynamic-toggle">
          <input
            v-model="dynamicConstruction"
            type="checkbox"
            :disabled="pending"
          />
          <span>
            <strong>生成可调构造代码</strong>
            <small>在 Matplotlib 图里加入滑块，用来调整角度、比例或自由点位置。</small>
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
