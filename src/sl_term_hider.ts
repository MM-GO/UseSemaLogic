import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

function decodeSLTerm(b64: string): string {
  try {
    const bin = atob(b64);
    const pct = Array.from(bin, (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    return decodeURIComponent(pct);
  } catch (e) {
    return "";
  }
}

class SLHintWidget extends WidgetType {
  private term: string;
  private view: any;
  private selFrom: number;
  private selTo: number;
  constructor(term: string, view: any, selFrom: number, selTo: number) {
    super();
    this.term = term;
    this.view = view;
    this.selFrom = selFrom;
    this.selTo = selTo;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "sl-term-hint";
    span.textContent = "ⓘ";
    span.title = this.term;
    span.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      try {
        this.view.dispatch({
          selection: { anchor: this.selFrom, head: this.selTo },
          scrollIntoView: true
        });
      } catch (e) {
        // ignore
      }
      document.dispatchEvent(new CustomEvent("sl-interpreter"));
    });
    return span;
  }
}

const SL_TERM_REGEX = /«(.+?)»\s*\((SL64|SL):([^)]+)\)/g;

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
      const matchText = match[0];
      const from = match.index;
      const to = from + matchText.length;
      const orig = match[1] ?? "";
      const mode = match[2] ?? "SL";
      const rawTerm = match[3] ?? "";
      let term = rawTerm;
      if (mode === "SL64") {
        term = decodeSLTerm(rawTerm);
      } else {
        term = rawTerm
          .replace(/\\\)/g, ")")
          .replace(/\\\(/g, "(")
          .replace(/\\\\/g, "\\");
      }

      const endBracket = matchText.indexOf("]");
      if (endBracket >= 0) {
        builder.add(from, from + endBracket + 1, Decoration.mark({ class: "sl-term-origin" }));
      }

      const slIndex = matchText.indexOf("(" + mode + ":");
      if (slIndex >= 0) {
        const slFrom = from + slIndex;
        const slTo = to;
        const origFrom = from + 1;
        const origTo = from + endBracket;
        builder.add(slFrom, slTo, Decoration.replace({ widget: new SLHintWidget(term, view, origFrom, origTo) }));
      } else {
        const origFrom = from + 1;
        const origTo = from + endBracket;
        builder.add(from, to, Decoration.replace({ widget: new SLHintWidget(term, view, origFrom, origTo) }));
      }
    }
    return builder.finish();
  }
}, {
  decorations: (v: any) => v.decorations
});
