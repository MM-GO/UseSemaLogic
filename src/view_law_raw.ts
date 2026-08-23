import { DropdownComponent, WorkspaceLeaf } from "obsidian"
import { SemaLogicView } from "./view"

export const LawRawViewType = "semalogic-law-raw"

// The dropdown of the base view offers parse formats and re-parses on change.
// A raw source document is not a parse result, so the control is kept for the
// layout but pinned to one honest label.
const LawRawOutputFormat = "Original-Markdown (raw.md)"

export type LawRawIdentity = {
  lawId: string
  version: string
  abbreviation: string
  fileName: string
}

// WP23 SS3 / WP23a T6 - the *imported source* of a statute, byte for byte as it
// arrived, opened in its own tab.
//
// This is deliberately a second view type rather than another mode of the Law
// view: WP23a T6 exists because the two Markdown artifacts for one statute are
// not the same file, and a reader must never be left guessing which one is on
// screen. The header says so, and the tab is named after the download's own
// file name.
export class LawRawMarkdownView extends SemaLogicView {
  private lawTitle: string = "Original-Markdown"
  private downloadUrl: string = ""
  private lawId: string = ""
  private lawVersion: string = ""
  private lawAbbreviation: string = ""
  private fileName: string = ""

  constructor(leaf: WorkspaceLeaf) {
    super(leaf)
    this.navigation = true
    // The point of this view is the imported source as it stands, so it opens
    // as text. The mode toggle still works, but view-locally: switching to the
    // rendered look here must not change every other SemaLogic view, and
    // rendering 1.6 MB of Markdown is not what a reader asked for by default.
    this.resultAsSourceOverride = true
  }

  getViewType(): string {
    return LawRawViewType
  }

  getDisplayText(): string {
    return this.lawTitle
  }

  getState(): { lawTitle: string; downloadUrl: string; lawId: string; lawVersion: string; lawAbbreviation: string; fileName: string } {
    return {
      lawTitle: this.lawTitle,
      downloadUrl: this.downloadUrl,
      lawId: this.lawId,
      lawVersion: this.lawVersion,
      lawAbbreviation: this.lawAbbreviation,
      fileName: this.fileName
    }
  }

  async setState(state: unknown, result: any): Promise<void> {
    await super.setState(state, result)
    const saved = state as Partial<{ lawTitle: string; downloadUrl: string; lawId: string; lawVersion: string; lawAbbreviation: string; fileName: string }>
    this.lawTitle = saved.lawTitle || this.lawTitle
    this.downloadUrl = saved.downloadUrl || ""
    this.lawId = saved.lawId || ""
    this.lawVersion = saved.lawVersion || ""
    this.lawAbbreviation = saved.lawAbbreviation || ""
    this.fileName = saved.fileName || ""
  }

  public getRawRestoreState(): { lawTitle: string; downloadUrl: string; lawId: string; lawVersion: string; lawAbbreviation: string; fileName: string } | undefined {
    if (this.downloadUrl.length == 0) { return undefined }
    return this.getState()
  }

  public isRawDocument(downloadUrl: string): boolean {
    return this.downloadUrl == downloadUrl
  }

  public createDropDownButtonForOutPutFormat(container: HTMLElement, _dropDownValue: string): HTMLElement {
    this.dropdownButton = new DropdownComponent(container)
      .addOption(LawRawOutputFormat, LawRawOutputFormat)
      .setValue(LawRawOutputFormat)
    this.dropdownButton.selectEl.disabled = true
    this.dropdownButton.selectEl.setAttr("title",
      "Die importierte Quelle des Gesetzes (bundle-Stufe raw.md), unveraendert")
    this.dropdownButton.selectEl.setAttr("data-sl-test", "output-format")
    return container
  }

  public showRawMarkdown(markdown: string, downloadUrl: string, identity: LawRawIdentity): void {
    this.downloadUrl = downloadUrl
    this.lawId = identity.lawId
    this.lawVersion = identity.version
    this.lawAbbreviation = identity.abbreviation
    this.fileName = identity.fileName
    this.lawTitle = identity.fileName || `${identity.abbreviation || identity.lawId} (raw.md)`
    this.currResult = markdown
    this.currKind = "html"
    this.currFragment = true
    this.currSource = undefined
    // Renders through Obsidian's own Markdown renderer; the source toggle of the
    // base view shows the identical bytes as text.
    this.currFormat = "markdown"
    this.setNewInitial(LawRawOutputFormat, true)
    this.headerEl.setText(this.lawTitle)
    this.contentEl.addClass("sl-law-raw")
    this.renderProvenanceHint()
    this.updateView()
  }

  public showRestoreError(message: string): void {
    this.setNewInitial(LawRawOutputFormat, true)
    this.headerEl.setText(this.lawTitle)
    this.resultEl.empty()
    this.resultEl.createEl("p", { text: message, cls: "semalogic-error" })
  }

  // T6: never let this artifact be mistaken for the Deannotate round trip of
  // the loaded document. The two differ, and the view says which one this is.
  private renderProvenanceHint(): void {
    const hint = this.contentEl.createEl("p", { cls: "sl-law-raw-hint" })
    hint.setText(`Importierte Quelle (bundle-Stufe raw.md) von ${this.lawAbbreviation || this.lawId}`
      + (this.lawVersion.length > 0 ? `, Version ${this.lawVersion}` : "")
      + " - nicht der Markdown-Ruecklauf des geladenen Dokuments.")
    // Directly under the header, above the controls.
    this.headerEl.after(hint)
  }

  async onOpen(): Promise<void> {
    // The plugin restores saved raw content once the communication object is
    // attached and the download can be authenticated.
  }
}
