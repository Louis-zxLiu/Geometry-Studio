export function resolveImagePathFromEventTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return "";
  }

  const imageElement = target.closest<HTMLElement>("[data-note-image-path]");
  if (!(imageElement instanceof HTMLElement)) {
    return "";
  }

  return imageElement.dataset.noteImagePath ?? "";
}

export function isInsideFloatingNoteUI(target: Node) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(".notebook-context-menu") ||
      target.closest(".notebook-image-preview") ||
      target.closest(".notebook-preview-toolbar"),
  );
}
