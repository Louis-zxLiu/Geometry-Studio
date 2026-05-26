import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "../../lib/codemirror";
import { tokenizePythonLine } from "../../lib/pythonHighlighter";

export const pythonTokenHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildTokenDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildTokenDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

function buildTokenDecorations(view: EditorView) {
  const decorations = [];
  for (const range of view.visibleRanges) {
    let position = range.from;
    while (position <= range.to) {
      const line = view.state.doc.lineAt(position);
      let tokenPosition = line.from;
      for (const token of tokenizePythonLine(line.text)) {
        const tokenEnd = tokenPosition + token.text.length;
        if (token.kind !== "plain" && tokenEnd > line.from) {
          decorations.push(
            Decoration.mark({ class: `cm-python-token cm-python-${token.kind}` }).range(
              tokenPosition,
              tokenEnd,
            ),
          );
        }
        tokenPosition = tokenEnd;
      }
      if (line.to >= range.to || line.number === view.state.doc.lines) {
        break;
      }
      position = line.to + 1;
    }
  }

  return Decoration.set(decorations, true);
}
