import { shallowRef, type ComputedRef, type Ref } from "vue";
import {
  Compartment,
  type DecorationSet,
  EditorState,
  EditorView,
  defaultKeymap,
  drawSelection,
  dropCursor,
  history,
  historyKeymap,
  highlightActiveLine,
  highlightSpecialChars,
  indentUnit,
  indentWithTab,
  keymap,
  lineNumbers,
  python,
  rectangularSelection,
} from "../../lib/codemirror";
import { editorTheme } from "./codeMirrorTheme";
import { pythonTokenHighlight } from "./pythonTokenHighlight";

type CodeMirrorEditorOptions = {
  editorRoot: Ref<HTMLElement | null>;
  normalizedCode: ComputedRef<string>;
  disabled: () => boolean | undefined;
  onAIOptimize: (position: { x: number; y: number }) => void;
  onCodeChange: (code: string) => void;
  onEditorActivity: () => void;
  shouldIgnoreContextMenu: (target: EventTarget | null) => boolean;
};

type MountOptions = {
  cardDecorations: Compartment;
  buildDecorations: () => DecorationSet;
  dragover: (event: DragEvent, view: EditorView) => boolean;
  drop: (event: DragEvent, view: EditorView) => boolean;
};

export function useCodeMirrorEditor(options: CodeMirrorEditorOptions) {
  const editorView = shallowRef<EditorView | null>(null);
  const editableMode = new Compartment();
  let isApplyingExternalCode = false;

  function mountEditor(mountOptions: MountOptions) {
    if (!options.editorRoot.value) {
      return null;
    }

    const view = new EditorView({
      parent: options.editorRoot.value,
      state: EditorState.create({
        doc: options.normalizedCode.value,
        extensions: [
          lineNumbers(),
          highlightSpecialChars(),
          drawSelection(),
          rectangularSelection(),
          dropCursor(),
          python(),
          pythonTokenHighlight,
          indentUnit.of("    "),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          editorTheme,
          editableMode.of(EditorView.editable.of(!options.disabled())),
          mountOptions.cardDecorations.of(EditorView.decorations.of(mountOptions.buildDecorations())),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isApplyingExternalCode) {
              options.onCodeChange(update.state.doc.toString());
            }
            if (update.docChanged || update.selectionSet || update.viewportChanged) {
              options.onEditorActivity();
            }
          }),
          EditorView.domEventHandlers({
            contextmenu: handleContextMenu,
            dragover: mountOptions.dragover,
            drop: mountOptions.drop,
          }),
          highlightActiveLine(),
        ],
      }),
    });

    editorView.value = view;
    return view;
  }

  function destroyEditor() {
    editorView.value?.destroy();
    editorView.value = null;
  }

  function syncExternalCode(code: string) {
    const view = editorView.value;
    if (!view || view.state.doc.toString() === code) {
      return false;
    }

    isApplyingExternalCode = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: code },
    });
    isApplyingExternalCode = false;
    return true;
  }

  function syncDisabled() {
    editorView.value?.dispatch({
      effects: editableMode.reconfigure(EditorView.editable.of(!options.disabled())),
    });
  }

  function handleContextMenu(event: MouseEvent) {
    if (options.disabled() || options.shouldIgnoreContextMenu(event.target)) {
      return false;
    }

    event.preventDefault();
    options.onAIOptimize({ x: event.clientX, y: event.clientY });
    return true;
  }

  return {
    destroyEditor,
    editorView,
    mountEditor,
    syncDisabled,
    syncExternalCode,
  };
}
