import { ref, shallowRef, type ComputedRef, type Ref } from "vue";
import {
  Compartment,
  Decoration,
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
};

export function useCodeMirrorEditor(options: CodeMirrorEditorOptions) {
  const editorView = shallowRef<EditorView | null>(null);
  const isSearchOpen = ref(false);
  const searchMatchCount = ref(0);
  const searchQuery = ref("");
  const searchActiveIndex = ref(-1);
  const editableMode = new Compartment();
  const searchDecorations = new Compartment();
  let isApplyingExternalCode = false;
  let searchRanges: Array<{ from: number; to: number }> = [];

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
          searchDecorations.of(EditorView.decorations.of(buildSearchDecorations())),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isApplyingExternalCode) {
              options.onCodeChange(update.state.doc.toString());
            }
            if (update.docChanged || update.selectionSet || update.viewportChanged) {
              options.onEditorActivity();
            }
            if (update.docChanged && isSearchOpen.value && searchQuery.value !== "") {
              queueMicrotask(() => {
                refreshSearch(false);
              });
            }
          }),
          EditorView.domEventHandlers({
            contextmenu: handleContextMenu,
            keydown: handleEditorKeyDown,
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
    searchRanges = [];
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
    refreshSearch(false);
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

  function handleEditorKeyDown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openSearch();
      return true;
    }
    return false;
  }

  function openSearch() {
    const view = editorView.value;
    isSearchOpen.value = true;
    if (!view) {
      return;
    }

    const selectedText = view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    );
    if (searchQuery.value === "" && selectedText.trim() !== "" && !selectedText.includes("\n")) {
      searchQuery.value = selectedText;
    }
    refreshSearch(true);
  }

  function closeSearch() {
    isSearchOpen.value = false;
    searchQuery.value = "";
    searchMatchCount.value = 0;
    searchActiveIndex.value = -1;
    searchRanges = [];
    applySearchDecorations(buildSearchDecorations());
    focusEditor();
  }

  function updateSearchQuery(value: string) {
    searchQuery.value = value;
    searchActiveIndex.value = 0;
    refreshSearch(true);
  }

  function focusEditor() {
    editorView.value?.focus();
  }

  function findNextMatch() {
    if (searchRanges.length === 0) {
      return;
    }
    searchActiveIndex.value = (searchActiveIndex.value + 1 + searchRanges.length) % searchRanges.length;
    revealActiveMatch();
  }

  function findPreviousMatch() {
    if (searchRanges.length === 0) {
      return;
    }
    searchActiveIndex.value = (searchActiveIndex.value - 1 + searchRanges.length) % searchRanges.length;
    revealActiveMatch();
  }

  function refreshSearch(revealActive: boolean) {
    if (!editorView.value) {
      return;
    }

    const query = searchQuery.value;
    if (query === "") {
      searchRanges = [];
      searchMatchCount.value = 0;
      searchActiveIndex.value = -1;
      applySearchDecorations(buildSearchDecorations());
      return;
    }

    searchRanges = collectSearchRanges(editorView.value.state.doc.toString(), query);
    searchMatchCount.value = searchRanges.length;
    if (searchRanges.length === 0) {
      searchActiveIndex.value = -1;
      applySearchDecorations(buildSearchDecorations());
      return;
    }

    if (searchActiveIndex.value < 0 || searchActiveIndex.value >= searchRanges.length) {
      searchActiveIndex.value = 0;
    }
    applySearchDecorations(buildSearchDecorations());
    if (revealActive) {
      revealActiveMatch();
    }
  }

  function revealActiveMatch() {
    const view = editorView.value;
    if (!view || searchActiveIndex.value < 0 || searchActiveIndex.value >= searchRanges.length) {
      applySearchDecorations(buildSearchDecorations());
      return;
    }

    const activeRange = searchRanges[searchActiveIndex.value];
    applySearchDecorations(buildSearchDecorations());
    view.dispatch({
      selection: { anchor: activeRange.from, head: activeRange.to },
      scrollIntoView: true,
    });
    view.focus();
  }

  function applySearchDecorations(decorations: DecorationSet) {
    editorView.value?.dispatch({
      effects: searchDecorations.reconfigure(EditorView.decorations.of(decorations)),
    });
  }

  function buildSearchDecorations() {
    if (searchRanges.length === 0) {
      return Decoration.none;
    }

    const decorations = searchRanges.map((range, index) =>
      Decoration.mark({
        class: index === searchActiveIndex.value ? "cm-search-match-active" : "cm-search-match",
      }).range(range.from, range.to),
    );
    return Decoration.set(decorations, true);
  }

  function collectSearchRanges(content: string, query: string) {
    const ranges: Array<{ from: number; to: number }> = [];
    if (query === "") {
      return ranges;
    }

    let start = 0;
    while (start <= content.length) {
      const foundAt = content.indexOf(query, start);
      if (foundAt === -1) {
        break;
      }
      ranges.push({ from: foundAt, to: foundAt + query.length });
      start = foundAt + Math.max(query.length, 1);
    }
    return ranges;
  }

  return {
    destroyEditor,
    editorView,
    findNextMatch,
    findPreviousMatch,
    focusEditor,
    isSearchOpen,
    mountEditor,
    openSearch,
    closeSearch,
    searchActiveIndex,
    searchMatchCount,
    searchQuery,
    syncDisabled,
    syncExternalCode,
    updateSearchQuery,
  };
}
