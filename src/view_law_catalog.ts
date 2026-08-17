import { ItemView, Notice, sanitizeHTMLToDom, WorkspaceLeaf } from "obsidian"

export const LawCatalogViewType = "semalogic-law-catalog"

// A dedicated leaf keeps fetched catalog fragments inside Obsidian instead of
// treating the server URL as a vault path.
export class LawCatalogView extends ItemView {
  private lawTitle: string = "SemaLogic law"
  private catalogUrl: string = ""

  getViewType(): string {
    return LawCatalogViewType
  }

  getDisplayText(): string {
    return this.lawTitle
  }

  public isCatalogDocument(url: string): boolean {
    return this.catalogUrl == url
  }

  public showLawDocument(title: string, catalogUrl: string, fragment: string, targetId: string): void {
    this.lawTitle = title
    this.catalogUrl = catalogUrl
    this.contentEl.empty()
    this.contentEl.addClass("sl-law-catalog")
    this.contentEl.createEl("h2", { text: title })

    const documentEl = this.contentEl.createDiv({ cls: "sl-law-catalog-document" })
    documentEl.appendChild(sanitizeHTMLToDom(fragment))

    this.navigateToProvision(targetId)
  }

  public navigateToProvision(targetId: string): boolean {
    const target = Array.from(this.contentEl.querySelectorAll<HTMLElement>("[id]")).find((element) => element.id == targetId)
    if (target == undefined) {
      new Notice(`UseSemaLogic: provision ${targetId} was not found in ${this.lawTitle}.`)
      return false
    }
    // After a tab switch Obsidian can finish its layout one frame later. A
    // second exact scroll prevents the target from ending up near, but not at,
    // the provision named by the citation.
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start" })
      window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" }))
    })
    return true
  }

  constructor(leaf: WorkspaceLeaf) {
    super(leaf)
    this.navigation = true
  }
}
