import { DropdownComponent, Notice, WorkspaceLeaf } from "obsidian"
import { SemaLogicView } from "./view"
import { RulesettypesCommands, Rstypes_AnnotatedHTML_WithBacklinks } from "./const"

export const LawCatalogViewType = "semalogic-law-catalog"
const LawCatalogOutputFormat = RulesettypesCommands[Rstypes_AnnotatedHTML_WithBacklinks][1]

// A catalog fragment is a read-only AnnotatedHTML result. Extending the main
// view deliberately reuses its controls, source mode, clipboard support and
// diagnostic visibility instead of maintaining a second implementation.
export class LawCatalogView extends SemaLogicView {
  private lawTitle: string = "SemaLogic law"
  private catalogUrl: string = ""
  private targetId: string = ""

  constructor(leaf: WorkspaceLeaf) {
    super(leaf)
    this.navigation = true
  }

  getViewType(): string {
    return LawCatalogViewType
  }

  getDisplayText(): string {
    return this.lawTitle
  }

  getState(): { lawTitle: string; catalogUrl: string; targetId: string } {
    return { lawTitle: this.lawTitle, catalogUrl: this.catalogUrl, targetId: this.targetId }
  }

  async setState(state: unknown, result: any): Promise<void> {
    await super.setState(state, result)
    const saved = state as Partial<{ lawTitle: string; catalogUrl: string; targetId: string }>
    this.lawTitle = saved.lawTitle || this.lawTitle
    this.catalogUrl = saved.catalogUrl || ""
    this.targetId = saved.targetId || ""
  }

  public getCatalogRestoreState(): { lawTitle: string; catalogUrl: string; targetId: string } | undefined {
    if (this.catalogUrl.length == 0 || this.targetId.length == 0) { return undefined }
    return { lawTitle: this.lawTitle, catalogUrl: this.catalogUrl, targetId: this.targetId }
  }

  public createDropDownButtonForOutPutFormat(container: HTMLElement, _dropDownValue: string): HTMLElement {
    const controls = super.createDropDownButtonForOutPutFormat(container, LawCatalogOutputFormat)
    this.dropdownButton.setValue(LawCatalogOutputFormat)
    this.dropdownButton.selectEl.disabled = true
    this.dropdownButton.selectEl.setAttr("title", "Catalog documents are fixed to AnnotatedHTML with Backlinks")
    return controls
  }

  public isCatalogDocument(url: string): boolean {
    return this.catalogUrl == url
  }

  public showLawDocument(title: string, catalogUrl: string, fragment: string, targetId: string): void {
    this.lawTitle = title
    this.catalogUrl = catalogUrl
    this.targetId = targetId
    this.currResult = fragment
    this.currKind = "html"
    this.currFragment = true
    this.currSource = undefined
    this.setNewInitial(LawCatalogOutputFormat, true)
    this.headerEl.setText(title)
    this.contentEl.addClass("sl-law-catalog")
    this.updateView()
    this.navigateToProvision(targetId)
  }

  public navigateToProvision(targetId: string): boolean {
    this.targetId = targetId
    const target = Array.from(this.contentEl.querySelectorAll<HTMLElement>("[id]")).find((element) => element.id == targetId)
    if (target == undefined) {
      new Notice(`UseSemaLogic: provision ${targetId} was not found in ${this.lawTitle}.`)
      return false
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

  async onOpen(): Promise<void> {
    // The plugin restores saved catalog content after it has attached the
    // communication object and can authenticate the catalog request.
  }
}
