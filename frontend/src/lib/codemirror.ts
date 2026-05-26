export { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
export { python } from "@codemirror/lang-python";
export {
  HighlightStyle,
  defaultHighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
export { Compartment, EditorState } from "@codemirror/state";
export {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
export { tags } from "@lezer/highlight";
