import type { ShallowRef } from "vue";
import type { EditorView } from "../../lib/codemirror";

type EditorViewportAnchorOptions = {
  editorView: ShallowRef<EditorView | null>;
  onAnchorLine: (line: number) => void;
};

export function useEditorViewportAnchor(options: EditorViewportAnchorOptions) {
  let anchorFrame = 0;

  function scheduleAnchorLineUpdate() {
    if (anchorFrame) {
      window.cancelAnimationFrame(anchorFrame);
    }

    anchorFrame = window.requestAnimationFrame(() => {
      anchorFrame = 0;
      const view = options.editorView.value;
      if (!view) {
        return;
      }
      options.onAnchorLine(getViewportAnchorLine(view));
    });
  }

  function cancelAnchorLineUpdate() {
    if (anchorFrame) {
      window.cancelAnimationFrame(anchorFrame);
      anchorFrame = 0;
    }
  }

  function getViewportAnchorLine(view: EditorView) {
    const visible = view.visibleRanges[0];
    if (!visible) {
      return view.state.doc.lineAt(view.state.selection.main.head).number;
    }

    const middle = Math.round((visible.from + visible.to) / 2);
    return view.state.doc.lineAt(middle).number;
  }

  return {
    cancelAnchorLineUpdate,
    getViewportAnchorLine,
    scheduleAnchorLineUpdate,
  };
}
