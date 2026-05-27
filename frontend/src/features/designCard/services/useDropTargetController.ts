import {
  onBeforeUnmount,
  onMounted,
  watch,
  type Ref,
} from "vue";

type DropTargetControllerOptions = {
  host: Ref<HTMLElement | null>;
  onDragEnter?: (event: DragEvent) => void;
  onDragLeave?: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onGlobalDragEnd?: (event: DragEvent) => void;
  onGlobalDrop?: (event: DragEvent) => void;
};

const listenerOptions = { capture: true };

export function useDropTargetController(options: DropTargetControllerOptions) {
  let cleanupHostListeners: (() => void) | null = null;

  const handleDragEnter = (event: Event) => {
    if (event instanceof DragEvent) {
      options.onDragEnter?.(event);
    }
  };

  const handleDragLeave = (event: Event) => {
    if (event instanceof DragEvent) {
      options.onDragLeave?.(event);
    }
  };

  const handleDragOver = (event: Event) => {
    if (event instanceof DragEvent) {
      options.onDragOver(event);
    }
  };

  const handleDrop = (event: Event) => {
    if (event instanceof DragEvent) {
      options.onDrop(event);
    }
  };

  const handleGlobalDragEnd = (event: Event) => {
    if (event instanceof DragEvent) {
      options.onGlobalDragEnd?.(event);
    }
  };

  const handleGlobalDrop = (event: Event) => {
    if (event instanceof DragEvent) {
      options.onGlobalDrop?.(event);
    }
  };

  function bindHost(host: HTMLElement | null) {
    cleanupHostListeners?.();
    cleanupHostListeners = null;

    if (!host) {
      return;
    }

    host.addEventListener("dragenter", handleDragEnter, listenerOptions);
    host.addEventListener("dragleave", handleDragLeave, listenerOptions);
    host.addEventListener("dragover", handleDragOver, listenerOptions);
    host.addEventListener("drop", handleDrop, listenerOptions);
    cleanupHostListeners = () => {
      host.removeEventListener("dragenter", handleDragEnter, listenerOptions);
      host.removeEventListener("dragleave", handleDragLeave, listenerOptions);
      host.removeEventListener("dragover", handleDragOver, listenerOptions);
      host.removeEventListener("drop", handleDrop, listenerOptions);
    };
  }

  onMounted(() => {
    bindHost(options.host.value);
    window.addEventListener("dragend", handleGlobalDragEnd);
    window.addEventListener("drop", handleGlobalDrop);
  });

  onBeforeUnmount(() => {
    cleanupHostListeners?.();
    cleanupHostListeners = null;
    window.removeEventListener("dragend", handleGlobalDragEnd);
    window.removeEventListener("drop", handleGlobalDrop);
  });

  watch(options.host, (host) => {
    bindHost(host);
  });
}
