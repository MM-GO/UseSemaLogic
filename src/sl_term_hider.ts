import { Decoration, RangeSetBuilder, ViewPlugin, WidgetType } from "@codemirror/view";

class SLHiddenWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "sl-term-hidden";
    span.textContent = "";
    return span;
  }
}

const SL_TERM_REGEX = /\(SL:[^)]+\)/g;

export const slTermHider = ViewPlugin.fromClass(class {
  decorations: any;

  constructor(view: any) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: any) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: any) {
    const builder = new RangeSetBuilder<Decoration>();
    const text = view.state.doc.toString();
    let match;
    while ((match = SL_TERM_REGEX.exec(text)) !== null) {
      const from = match.index;
      const to = from + match[0].length;
      builder.add(from, to, Decoration.replace({ widget: new SLHiddenWidget() }));
    }
    return builder.finish();
  }
}, {
  decorations: (v: any) => v.decorations
});
