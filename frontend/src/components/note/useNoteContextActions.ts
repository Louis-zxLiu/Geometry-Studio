import type { Ref } from "vue";
import type { NoteImage } from "../../features/notebook/services/notebookStorage";

type NoteContextActionsOptions = {
  clearImageSelection: () => void;
  closeContextMenu: () => void;
  contextMenuImages: Readonly<Ref<NoteImage[]>>;
  openPreview: (src: string, alt: string) => void;
  removeImage: (relativePath: string) => void;
  toggleImageSelection: (relativePath: string) => void;
  ensureImageSelection: (relativePath: string) => void;
  handleContextMenu: (event: MouseEvent) => void;
};

export function useNoteContextActions(options: NoteContextActionsOptions) {
  function previewContextImage() {
    const image = options.contextMenuImages.value[0];
    if (!image) {
      return;
    }

    options.openPreview(image.dataUrl, image.alt || image.name);
    options.closeContextMenu();
  }

  function removeContextImages() {
    const images = options.contextMenuImages.value;
    if (!images.length) {
      return;
    }

    images.forEach((image) => {
      options.removeImage(image.relativePath);
    });
    options.clearImageSelection();
    options.closeContextMenu();
  }

  function toggleImageSelection(relativePath: string) {
    options.closeContextMenu();
    options.toggleImageSelection(relativePath);
  }

  function handleImageBlockContext(event: MouseEvent, relativePath: string) {
    options.ensureImageSelection(relativePath);
    options.handleContextMenu(event);
  }

  return {
    handleImageBlockContext,
    previewContextImage,
    removeContextImages,
    toggleImageSelection,
  };
}
