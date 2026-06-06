import {
  EditorView,
} from "../../lib/codemirror";

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "0",
    width: "100%",
    backgroundColor: "transparent",
    color: "var(--text)",
    fontFamily: "\"JetBrains Mono\", \"Consolas\", \"Courier New\", monospace",
    fontSize: "13px",
    lineHeight: "1.8",
    outline: "0",
  },
  "&.cm-focused": {
    outline: "0 !important",
  },
  ".cm-scroller": {
    height: "100%",
    overflow: "auto",
    fontFamily: "inherit",
    paddingTop: "0",
    boxSizing: "border-box",
    scrollbarWidth: "thin",
    scrollbarColor: "color-mix(in srgb, var(--muted), transparent 82%) transparent",
  },
  ".cm-scroller::-webkit-scrollbar": {
    width: "8px",
    height: "0",
  },
  ".cm-scroller::-webkit-scrollbar-track": {
    background: "transparent",
  },
  ".cm-scroller::-webkit-scrollbar-thumb": {
    border: "0",
    background: "color-mix(in srgb, var(--muted), transparent 84%)",
  },
  ".cm-scroller::-webkit-scrollbar-thumb:hover": {
    background: "color-mix(in srgb, var(--muted), transparent 74%)",
  },
  ".cm-scroller::-webkit-scrollbar-corner": {
    background: "transparent",
  },
  ".cm-content": {
    boxSizing: "border-box",
    minWidth: "0",
    minHeight: "0",
    padding: "14px 18px 34px 6px",
    caretColor: "var(--text)",
    lineHeight: "1.8",
  },
  ".cm-line": {
    padding: "0",
    lineHeight: "1.8",
    minHeight: "1.8em",
  },
  ".cm-python-keyword": {
    color: "#8b4a24",
    fontWeight: "700",
  },
  ".cm-python-builtin": {
    color: "#2e7c6b",
    fontWeight: "650",
  },
  ".cm-python-string": {
    color: "#69791f",
  },
  ".cm-python-number": {
    color: "#986236",
    fontWeight: "600",
  },
  ".cm-python-comment": {
    color: "#9a9a9a",
    fontStyle: "italic",
  },
  ".cm-python-decorator": {
    color: "#7651a6",
    fontWeight: "650",
  },
  ".cm-python-operator": {
    color: "#7a5a82",
    fontWeight: "600",
  },
  ".cm-gutters": {
    border: "0",
    backgroundColor: "transparent",
    color: "var(--muted)",
    boxSizing: "border-box",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "42px",
    padding: "0 12px 0 0",
    color: "var(--muted)",
    opacity: "0.36",
    fontFamily: "inherit",
    fontSize: "13px",
    lineHeight: "1.8",
    minHeight: "1.8em",
  },
  ".cm-lineNumbers .cm-gutterElement:first-child": {
    height: "0",
    minHeight: "0",
    lineHeight: "0",
    paddingTop: "0",
    paddingBottom: "0",
    overflow: "hidden",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--surface-soft), transparent 72%)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--muted), transparent 78%)",
  },
  ".cm-search-match": {
    backgroundColor: "color-mix(in srgb, #ffd76a, transparent 42%)",
    borderRadius: "3px",
  },
  ".cm-search-match-active": {
    backgroundColor: "color-mix(in srgb, #ffb347, transparent 22%)",
    borderRadius: "3px",
    boxShadow: "inset 0 0 0 1px color-mix(in srgb, #c46a18, transparent 28%)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--text)",
  },
  ".cm-repair-revealed": {
    animation: "editor-repair-line 360ms ease",
  },
  ".cm-streaming-line": {
    animation: "editor-stream-line 220ms ease",
  },
  ".cm-design-card-widget": {
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    padding: "16px 18px 22px 6px",
  },
  ".cm-design-card-widget .design-card-inline-block": {
    width: "100%",
    maxWidth: "100%",
    margin: "0",
  },
});
