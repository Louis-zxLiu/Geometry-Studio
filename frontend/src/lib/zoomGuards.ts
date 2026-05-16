export function installZoomGuards() {
  window.addEventListener("wheel", preventBrowserZoom, { passive: false });
  window.addEventListener("keydown", handleZoomShortcut);
}

function preventBrowserZoom(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) {
    return;
  }

  event.preventDefault();
}

function handleZoomShortcut(event: KeyboardEvent) {
  if (!event.ctrlKey && !event.metaKey) {
    return;
  }

  if (event.key !== "0") {
    return;
  }

  event.preventDefault();
  document.documentElement.style.zoom = "";
  document.body.style.zoom = "";
}
