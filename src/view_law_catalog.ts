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
}
