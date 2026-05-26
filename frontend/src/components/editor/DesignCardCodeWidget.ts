import { WidgetType } from "../../lib/codemirror";
import { writeDesignCardDragData } from "../../features/designCard/services/designCardDragData";
import { getDesignCardSvgAspectRatio } from "../../features/designCard/services/designCardSvgGeometry";
import type { DesignCard } from "../../features/designCard/services/designCardTypes";

export class DesignCardCodeWidget extends WidgetType {
  constructor(
    private readonly card: DesignCard,
    private readonly callbacks: {
      delete: (cardId: string) => void;
      move: (payload: { cardId: string; delta: number }) => void;
      open: (cardId: string) => void;
    },
    private readonly viewportWidth = 0,
  ) {
    super();
  }

  toDOM() {
    const shell = document.createElement("div");
    shell.className = "cm-design-card-widget";
    if (this.viewportWidth > 0) {
      shell.style.width = `${this.viewportWidth}px`;
      shell.style.maxWidth = `${this.viewportWidth}px`;
    }

    const article = document.createElement("article");
    article.className = "design-card-inline-block editor-design-card";
    article.draggable = true;
    article.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    article.addEventListener("dragstart", (event) => {
      article.classList.add("design-card-dragging");
      writeDesignCardDragData(event.dataTransfer, { cardId: this.card.id, source: "editor" });
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
    });
    article.addEventListener("dragend", () => {
      article.classList.remove("design-card-dragging");
    });

    const svgView = document.createElement("div");
    const aspectRatio = getDesignCardSvgAspectRatio(this.card.svg);
    svgView.className = aspectRatio
      ? "design-card-static-svg-view has-intrinsic-ratio"
      : "design-card-static-svg-view";
    if (aspectRatio) {
      svgView.style.aspectRatio = aspectRatio;
    }
    svgView.innerHTML = this.card.svg;
    article.append(svgView);

    const actions = document.createElement("footer");
    actions.className = "design-card-inline-actions";
    actions.addEventListener("click", (event) => event.stopPropagation());
    actions.append(
      this.createIconButton("放大查看", "zoom", () => this.callbacks.open(this.card.id)),
      this.createIconButton("删除设计卡片", "trash", () => this.callbacks.delete(this.card.id)),
    );
    article.append(actions);
    shell.append(article);
    return shell;
  }

  override eq(widget: DesignCardCodeWidget) {
    return (
      this.card.id === widget.card.id &&
      this.card.svg === widget.card.svg &&
      this.viewportWidth === widget.viewportWidth
    );
  }

  override ignoreEvent() {
    return true;
  }

  private createIconButton(title: string, icon: "zoom" | "trash", onClick: () => void) {
    const button = document.createElement("button");
    button.className = icon === "trash" ? "design-card-icon-action design-card-trash" : "design-card-icon-action";
    button.type = "button";
    button.title = title;
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    let deleteTimer = 0;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (icon === "trash" && !button.classList.contains("armed")) {
        button.classList.add("armed");
        button.title = "再次点击确认删除";
        window.clearTimeout(deleteTimer);
        deleteTimer = window.setTimeout(() => {
          button.classList.remove("armed");
          button.title = title;
        }, 1800);
        return;
      }
      onClick();
    });
    button.innerHTML =
      icon === "trash"
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12" /><path d="m9 7 .6-2h4.8L15 7" /><path d="M8 7v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" /></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 5 5" /></svg>';
    return button;
  }
}
