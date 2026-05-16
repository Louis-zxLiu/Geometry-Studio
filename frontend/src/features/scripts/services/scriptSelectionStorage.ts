const selectedScriptKey = "plotkitycat:selected-script";

export function createScriptSelectionStorage() {
  return {
    load() {
      if (typeof window === "undefined") {
        return "";
      }

      return window.localStorage.getItem(selectedScriptKey) ?? "";
    },
    save(filename: string) {
      if (typeof window === "undefined") {
        return;
      }

      const normalized = filename.trim();
      if (normalized === "") {
        window.localStorage.removeItem(selectedScriptKey);
        return;
      }

      window.localStorage.setItem(selectedScriptKey, normalized);
    },
  };
}
