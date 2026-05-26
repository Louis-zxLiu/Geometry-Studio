import { ref } from "vue";

export function useNoteImagePreview() {
  const previewImage = ref<{ src: string; alt: string } | null>(null);
  const previewScale = ref(1);

  function openPreview(src: string, alt: string) {
    previewImage.value = { src, alt };
    previewScale.value = 1;
  }

  function closePreview() {
    previewImage.value = null;
    previewScale.value = 1;
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

  return {
    closePreview,
    handlePreviewWheel,
    openPreview,
    previewImage,
    previewScale,
    resetPreviewZoom,
    zoomPreview,
  };
}

function clampPreviewScale(scale: number) {
  return Math.max(0.6, Math.min(4, Number(scale.toFixed(2))));
}
