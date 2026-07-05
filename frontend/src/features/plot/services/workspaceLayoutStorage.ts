export type WorkspaceLayoutMode = "split" | "code" | "note";

const layoutModeKey = "plotkitycat:workspace:layout-mode";

export function createWorkspaceLayoutStorage() {
  return {
    loadLayoutMode(fallback: WorkspaceLayoutMode = "split"): WorkspaceLayoutMode {
      if (typeof window === "undefined") {
        return fallback;
      }

      try {
        const raw = window.localStorage.getItem(layoutModeKey);
        if (raw === "split" || raw === "code" || raw === "note") {
          return raw;
        }
      } catch {
        // Ignore storage read failure and keep the fallback mode.
      }

      return fallback;
    },
    saveLayoutMode(mode: WorkspaceLayoutMode) {
      if (typeof window === "undefined") {
        return;
      }

      try {
        window.localStorage.setItem(layoutModeKey, mode);
      } catch {
        // Ignore storage write failure because layout state is non-critical.
      }
    },
  };
}
