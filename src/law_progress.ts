import { formatLawByteSize } from "./law_index"

// WP23a T4 - progress for a statute download.
//
// This is a *client* side progress: unlike the DialectEngine and SL-Interpreter
// overlays in view.ts there is nothing to poll on the server, the number that
// moves is the number of bytes that have arrived. It reuses the same
// `.sl-progress*` classes so both look like one feature, and it lives on
// document.body because the target Law view does not exist yet while the
// fetch runs.
export class LawLoadProgress {
  private root: HTMLElement | undefined
  private phaseEl: HTMLElement | undefined
  private elapsedEl: HTMLElement | undefined
  private messageEl: HTMLElement | undefined
  private barEl: HTMLElement | undefined
  private fillEl: HTMLElement | undefined
  private metaEl: HTMLElement | undefined
  private startedAt: number = 0
  private timer: number | undefined

  public start(title: string, message: string): void {
    this.stop()
    this.startedAt = Date.now()
    const root = document.body.createEl("div", { cls: "sl-progress" })
    root.setAttr("data-sl-test", "law-load-progress")
    const box = root.createEl("div", { cls: "sl-progress-box" })
    const header = box.createEl("div", { cls: "sl-progress-header" })
    this.phaseEl = header.createEl("span", { cls: "sl-progress-phase", text: title })
    this.elapsedEl = header.createEl("span", { cls: "sl-progress-elapsed", text: "0.0 s" })
    this.messageEl = box.createEl("div", { cls: "sl-progress-message", text: message })
    this.barEl = box.createEl("div", { cls: "sl-progress-bar is-indeterminate" })
    this.fillEl = this.barEl.createEl("div", { cls: "sl-progress-fill" })
    this.fillEl.style.width = "42%"
    this.metaEl = box.createEl("div", { cls: "sl-progress-meta", text: "" })
    this.root = root
    // The elapsed time is the part that proves the view is not frozen while a
    // response without a Content-Length is still arriving.
    this.timer = window.setInterval(() => this.renderElapsed(), 200)
  }

  // `total` of 0 keeps the indeterminate bar: the server sent no Content-Length,
  // so the number of bytes still to come is unknown.
  public update(loaded: number, total: number): void {
    if (this.root == undefined) { return }
    if (this.metaEl != undefined) {
      this.metaEl.setText(total > 0
        ? `${formatLawByteSize(loaded)} von ${formatLawByteSize(total)}`
        : formatLawByteSize(loaded))
    }
    if (this.barEl == undefined || this.fillEl == undefined) { return }
    if (total <= 0) {
      this.barEl.addClass("is-indeterminate")
      this.fillEl.style.width = "42%"
      return
    }
    this.barEl.removeClass("is-indeterminate")
    const ratio = Math.max(0, Math.min(1, loaded / total))
    this.fillEl.style.width = `${Math.round(ratio * 100)}%`
  }

  public setMessage(message: string): void {
    this.messageEl?.setText(message)
  }

  public stop(): void {
    if (this.timer != undefined) {
      window.clearInterval(this.timer)
      this.timer = undefined
    }
    this.root?.remove()
    this.root = undefined
    this.phaseEl = undefined
    this.elapsedEl = undefined
    this.messageEl = undefined
    this.barEl = undefined
    this.fillEl = undefined
    this.metaEl = undefined
  }

  private renderElapsed(): void {
    if (this.elapsedEl == undefined) { return }
    this.elapsedEl.setText(`${((Date.now() - this.startedAt) / 1000).toFixed(1)} s`)
  }
}
