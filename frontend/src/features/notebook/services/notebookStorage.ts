export type NoteImage = {
  name: string;
  alt: string;
  dataUrl: string;
  relativePath: string;
};

export type NoteDocument = {
  markdown: string;
  images: NoteImage[];
};

const panelStateKey = "plotkitycat:note:panel-open";

export function createNotePanelStorage() {
  return {
    loadPanelState() {
      if (typeof window === "undefined") {
        return true;
      }

      const raw = window.localStorage.getItem(panelStateKey);
      return raw !== "0";
    },
    savePanelState(isOpen: boolean) {
      if (typeof window === "undefined") {
        return;
      }

      window.localStorage.setItem(panelStateKey, isOpen ? "1" : "0");
    },
  };
}

export function createEmptyNoteDocument(): NoteDocument {
  return {
    markdown: "",
    images: [],
  };
}

export function normalizeNoteDocument(value: Partial<NoteDocument> | null | undefined): NoteDocument {
  return {
    markdown: typeof value?.markdown === "string" ? value.markdown : "",
    images: Array.isArray(value?.images)
      ? value.images
          .map((image) => ({
            name: typeof image?.name === "string" ? image.name : "reference-image",
            alt: typeof image?.alt === "string" ? image.alt : "",
            dataUrl: typeof image?.dataUrl === "string" ? image.dataUrl : "",
            relativePath:
              typeof image?.relativePath === "string" ? image.relativePath : "",
          }))
          .filter((image) => image.dataUrl !== "")
      : [],
  };
}
