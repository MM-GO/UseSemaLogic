import { ButtonComponent, Notice, WorkspaceLeaf } from "obsidian"
import { SemaLogicView } from "./view"
import { DebugLevMap, RulesettypesCommands, Rstypes_AnnotatedHTML_WithBacklinks } from "./const"
import { slconsolelog } from "./utils"
import { formatLawByteSize, utf8ByteLength } from "./law_index"
import { deannotateLawHtml } from "./law_transfer"

export const LawCatalogViewType = "semalogic-law-catalog"
const LawCatalogOutputFormat = RulesettypesCommands[Rstypes_AnnotatedHTML_WithBacklinks][1]

// The identity of the loaded statute, taken from the index row and from the
// response headers (X-SL-Law-Id / X-SL-Version) - never parsed out of a URL.
export type LawDocumentIdentity = {
  lawId: string
  version: string
  abbreviation: string
}

// A catalog fragment is a read-only AnnotatedHTML result. Extending the main
// view deliberately reuses its controls, source mode, clipboard support and
// diagnostic visibility instead of maintaining a second implementation.
export class LawCatalogView extends SemaLogicView {
  private lawTitle: string = "SemaLogic law"
  private catalogUrl: string = ""
  private targetId: string = ""
  private lawId: string = ""
  private lawVersion: string = ""
  private lawAbbreviation: string = ""
  private transferButton: ButtonComponent | undefined
  private transferRunning: boolean = false
  // WP23 SS3's capability header. "" means this server does not hold the
  // imported source for the loaded document, and the action is not offered.
  private rawDownloadUrl: string = ""
  private rawButton: ButtonComponent | undefined

  constructor(leaf: WorkspaceLeaf) {
    super(leaf)
    this.navigation = true
  }

  getViewType(): string {
    return LawCatalogViewType
  }

  getDisplayText(): string {
    // The short designation, not the full title (issues-private/01). Obsidian's
    // tab captions are narrow: several open statutes truncate to nearly the
    // same text, and the reader can no longer tell them apart. The full title
    // stays visible in the view header.
    return this.lawAbbreviation || this.lawTitle
  }

  getState(): { lawTitle: string; catalogUrl: string; targetId: string; lawId: string; lawVersion: string; lawAbbreviation: string } {
    return {
      lawTitle: this.lawTitle,
      catalogUrl: this.catalogUrl,
      targetId: this.targetId,
      lawId: this.lawId,
      lawVersion: this.lawVersion,
      lawAbbreviation: this.lawAbbreviation
    }
  }

  async setState(state: unknown, result: any): Promise<void> {
    await super.setState(state, result)
    const saved = state as Partial<{ lawTitle: string; catalogUrl: string; targetId: string; lawId: string; lawVersion: string; lawAbbreviation: string }>
    this.lawTitle = saved.lawTitle || this.lawTitle
    this.catalogUrl = saved.catalogUrl || ""
    this.targetId = saved.targetId || ""
    this.lawId = saved.lawId || ""
    this.lawVersion = saved.lawVersion || ""
    this.lawAbbreviation = saved.lawAbbreviation || ""
  }

  public getCatalogRestoreState(): { lawTitle: string; catalogUrl: string; targetId: string; lawId: string; lawVersion: string; lawAbbreviation: string } | undefined {
    // A statute loaded from the picker has no provision target; a followed
    // citation always has one. Either is restorable as long as there is a URL.
    //
    // The saved targetId is a hint for the restore, not a durable address: a
    // re-import can rename it. It is re-resolved against the freshly fetched
    // document, and navigateToProvision reports it when it no longer resolves.
    if (this.catalogUrl.length == 0) { return undefined }
    if (this.targetId.length == 0 && this.lawId.length == 0) { return undefined }
    return this.getState()
  }

  public createDropDownButtonForOutPutFormat(container: HTMLElement, _dropDownValue: string): HTMLElement {
    const controls = super.createDropDownButtonForOutPutFormat(container, LawCatalogOutputFormat)
    this.dropdownButton.setValue(LawCatalogOutputFormat)
    this.dropdownButton.selectEl.disabled = true
    this.dropdownButton.selectEl.setAttr("title", "Catalog documents are fixed to AnnotatedHTML with Backlinks")
    return controls
  }

  // WP23a T5/T6 put the Markdown transfer directly beside Copy to Clipboard, and
  // T2 asks for the picker to be reachable from the Law view as well.
  public createCopyToClipboardButton(container: HTMLElement): HTMLElement {
    super.createCopyToClipboardButton(container)
    this.createTransferAsMarkdownButton(container)
    this.createRawMarkdownButton(container)
    return container
  }

  // WP23a T6 - the second Markdown artifact, named so it cannot be mistaken for
  // the first. Shown only where the server advertised the raw stage; one action
  // never silently stands in for the other when that one fails.
  private createRawMarkdownButton(container: HTMLElement): HTMLElement {
    this.rawButton = new ButtonComponent(container)
      .setButtonText("Original-Markdown herunterladen")
      .setTooltip("Oeffnet die importierte Quelle (bundle-Stufe raw.md) unveraendert in einem eigenen Tab")
      .onClick(() => { void this.openRawMarkdown() })
    this.rawButton.buttonEl.setAttr("data-sl-test", "law-raw-markdown")
    this.refreshRawButton()
    return container
  }

  private refreshRawButton(): void {
    if (this.rawButton == undefined) { return }
    const available = this.rawDownloadUrl.length > 0
    this.rawButton.buttonEl.toggleClass("sl-hidden", !available)
    this.rawButton.setDisabled(!available)
  }

  private async openRawMarkdown(): Promise<void> {
    if (this.rawDownloadUrl.length == 0) { return }
    const plugin = this.slComm?.slPlugin
    if (plugin == undefined) {
      new Notice("UseSemaLogic: der SemaLogic-Dienst ist noch nicht verbunden.")
      return
    }
    await plugin.openLawRawMarkdown(this.rawDownloadUrl, {
      lawId: this.lawId,
      version: this.lawVersion,
      abbreviation: this.lawAbbreviation
    }, this.lawAbbreviation || this.lawTitle || this.lawId)
  }

  private createTransferAsMarkdownButton(container: HTMLElement): HTMLElement {
    this.transferButton = new ButtonComponent(container)
      .setButtonText("Transfer as Markdown to Clipboard")
      // T6: two different Markdown artifacts exist for one statute. This one is
      // the round trip of what is loaded here, not the imported source.
      .setTooltip("Deannotiert das geladene Dokument und legt das Markdown in die Zwischenablage (nicht das Original-Markdown der Quelle)")
      .onClick(() => { void this.transferAsMarkdown() })
    this.transferButton.buttonEl.setAttr("data-sl-test", "law-transfer-markdown")
    return container
  }

  public isCatalogDocument(url: string): boolean {
    return this.catalogUrl == url
  }

  public getLawId(): string {
    return this.lawId
  }

  // The bytes that came off the wire. T5 posts exactly these back; the rendered
  // DOM has been through Obsidian's sanitizer and would deannotate a damaged
  // document.
  public getFetchedHtml(): string {
    return this.currResult
  }

  public showLawDocument(title: string, catalogUrl: string, fragment: string, targetId: string,
    identity?: LawDocumentIdentity, rawDownloadUrl: string = ""): void {
    this.lawTitle = title
    this.catalogUrl = catalogUrl
    this.targetId = targetId
    this.rawDownloadUrl = rawDownloadUrl
    if (identity != undefined) {
      this.lawId = identity.lawId
      this.lawVersion = identity.version
      this.lawAbbreviation = identity.abbreviation
    }
    this.currResult = fragment
    this.currKind = "html"
    this.currFragment = true
    this.currSource = undefined
    this.setNewInitial(LawCatalogOutputFormat, true)
    this.headerEl.setText(title)
    this.contentEl.addClass("sl-law-catalog")
    this.refreshRawButton()
    this.updateView()
    if (targetId.length > 0) {
      this.navigateToProvision(targetId)
    }
  }

  public navigateToProvision(targetId: string): boolean {
    this.targetId = targetId
    const matches = Array.from(this.contentEl.querySelectorAll<HTMLElement>("[id]")).filter((element) => element.id == targetId)
    const target = matches[0]
    if (target == undefined) {
      // The right reaction, not a defect: a checked-in bundle can carry an
      // older id structure than the annotator now produces (letter lists were
      // nested under their number), so an address can simply be absent. Say so
      // instead of scrolling somewhere plausible.
      new Notice(`UseSemaLogic: provision ${targetId} was not found in ${this.lawTitle}.`)
      return false
    }
    if (matches.length > 1) {
      // Bundles that predate the nesting fix carry the same letter address
      // several times (BGB SS 308 has four). Scrolling to the first one in
      // document order can be the wrong letter, and the reader has to know that
      // rather than trust the position.
      new Notice(`UseSemaLogic: ${targetId} kommt in ${this.lawTitle} ${matches.length}-mal vor; angesprungen wird die erste Fundstelle.`)
      slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
        `Ambiguous provision address in a served bundle (lawId=${this.lawId}, target=${targetId}, occurrences=${matches.length})`)
    }
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" })
      window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" }))
    })
    return true
  }

  public showRestoreError(message: string): void {
    this.setNewInitial(LawCatalogOutputFormat, true)
    this.headerEl.setText(this.lawTitle)
    this.resultEl.empty()
    this.resultEl.createEl("p", { text: message, cls: "semalogic-error" })
  }

  // WP23a T5 - the AnnotatedHTML rulesettype is bidirectional: posting
  // annotated HTML answers with Markdown, and the direction comes from the
  // input rather than from a flag. Nothing is stored (persistency:false), so
  // this needs no SemaLogic session.
  //
  // Only the Markdown comes back from this round trip. A document served from
  // /law/doc/ and the same statute freshly annotated by /rules/parse currently
  // carry different node ids, so no address may be carried from one to the
  // other - and none is.
  public async transferAsMarkdown(): Promise<void> {
    if (this.transferRunning) { return }
    const annotatedHtml = this.getFetchedHtml()
    const name = this.lawAbbreviation || this.lawTitle || this.lawId || "Gesetz"
    if (annotatedHtml.length == 0) {
      new Notice("UseSemaLogic: es ist kein Gesetzestext geladen.")
      return
    }
    const settings = this.slComm?.slPlugin?.settings
    if (settings == undefined) {
      new Notice("UseSemaLogic: der SemaLogic-Dienst ist noch nicht verbunden.")
      return
    }
    this.setTransferRunning(true)
    try {
      const { markdown, mediaType } = await deannotateLawHtml(settings, annotatedHtml)
      // A text/html reply means the service took the *forward* direction: the
      // input was not recognised as annotated. Putting that on the clipboard
      // under a Markdown label is exactly the failure to avoid.
      if (mediaType != "text/markdown") {
        new Notice(`UseSemaLogic: ${name} wurde nicht als annotiertes HTML erkannt (mediaType ${mediaType || "unbekannt"}); die Zwischenablage bleibt unveraendert.`)
        slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
          `Law markdown transfer returned the wrong direction (lawId=${this.lawId}, mediaType=${mediaType})`)
        return
      }
      if (markdown.length == 0) {
        new Notice(`UseSemaLogic: ${name} lieferte kein Markdown zurueck.`)
        return
      }
      await this.writeToClipboard(markdown)
      // At these sizes a silent clipboard write leaves the reader unsure
      // whether anything happened at all.
      new Notice(`UseSemaLogic: ${name} als Markdown kopiert - ${formatLawByteSize(utf8ByteLength(markdown))}`)
      slconsolelog(DebugLevMap.DebugLevel_Informative, this.slComm?.slview,
        `Law markdown transfer done (lawId=${this.lawId}, version=${this.lawVersion}, htmlLength=${annotatedHtml.length}, markdownLength=${markdown.length})`)
    } catch (e) {
      new Notice(`UseSemaLogic: ${name} konnte nicht als Markdown uebertragen werden. ${e instanceof Error ? e.message : String(e)}`)
      slconsolelog(DebugLevMap.DebugLevel_Error, this.slComm?.slview,
        `Law markdown transfer failed (lawId=${this.lawId}): ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      this.setTransferRunning(false)
    }
  }

  private setTransferRunning(running: boolean): void {
    this.transferRunning = running
    if (this.transferButton == undefined) { return }
    this.transferButton.setDisabled(running)
    this.transferButton.setButtonText(running ? "Transfer ..." : "Transfer as Markdown to Clipboard")
  }

  async onOpen(): Promise<void> {
    // The plugin restores saved catalog content after it has attached the
    // communication object and can authenticate the catalog request.
  }
}
