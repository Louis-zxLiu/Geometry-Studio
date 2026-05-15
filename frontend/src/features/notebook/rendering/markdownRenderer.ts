import MarkdownIt from "markdown-it";
import markdownItKatex from "markdown-it-katex";
import type { NoteImage } from "../services/notebookStorage";

const renderer = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
  typographer: false,
}).use(markdownItKatex);

export function renderMarkdownToHtml(markdown: string, images: NoteImage[] = []) {
  const imageMap = new Map(images.map((image) => [image.relativePath, image]));
  const defaultImageRenderer =
    renderer.renderer.rules.image ??
    ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

  renderer.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const sourcePath = token.attrGet("src") ?? "";
    const linkedImage = imageMap.get(sourcePath);
    if (linkedImage) {
      token.attrSet("src", linkedImage.dataUrl);
      token.attrSet("data-note-image-path", linkedImage.relativePath);
      token.attrSet("data-note-image-alt", linkedImage.alt || linkedImage.name);
    }

    return defaultImageRenderer(tokens, index, options, env, self);
  };

  return renderer.render(markdown);
}
