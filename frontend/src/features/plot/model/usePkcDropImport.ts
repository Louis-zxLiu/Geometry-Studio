import { onMounted, onUnmounted } from "vue";

type PkcDropImportOptions = {
  onImport: (path: string) => void | Promise<void>;
};

type WailsRuntimeCompat = {
  OnFileDrop?: (
    callback: (x: number, y: number, paths: string[]) => void,
    useDropTarget?: boolean,
  ) => void;
  OnFileDropOff?: () => void;
};

const pkcExtension = ".pkc";

export function usePkcDropImport(options: PkcDropImportOptions) {
  function bindFileDrop() {
    const runtime = getWailsRuntime();
    if (typeof runtime.OnFileDrop !== "function") {
      return;
    }

    runtime.OnFileDrop((x, y, paths) => {
      if (!isWorkspaceDropTarget(x, y)) {
        return;
      }

      const packagePath = findPkcPath(paths);
      if (!packagePath) {
        return;
      }

      void options.onImport(packagePath);
    }, false);
  }

  function unbindFileDrop() {
    const runtime = getWailsRuntime();
    if (typeof runtime.OnFileDropOff === "function") {
      runtime.OnFileDropOff();
    }
  }

  onMounted(bindFileDrop);
  onUnmounted(unbindFileDrop);

  return {
    bindFileDrop,
    unbindFileDrop,
  };
}

function findPkcPath(paths: string[]) {
  return paths.find((path) => path.toLowerCase().endsWith(pkcExtension)) ?? "";
}

function isWorkspaceDropTarget(x: number, y: number) {
  const target = document.elementFromPoint(x, y);
  return target instanceof Element && Boolean(
    target.closest(".editor-panel, .notebook-pane, .notebook-scroll, .notebook-panel-shell"),
  );
}

function getWailsRuntime(): WailsRuntimeCompat {
  return ((window as typeof window & {
    runtime?: WailsRuntimeCompat;
  }).runtime ?? {}) as WailsRuntimeCompat;
}
