import { App, Notice, SuggestModal } from "obsidian"
import {
  LawIndexEntry, LawPickerRenderLimit, LawRecentsLimit,
  filterLawEntries, firstLawEntries, orderLawRecents
} from "./law_index"

// WP23a T2 - the fuzzy picker over the whole catalog.
//
// SuggestModal rather than FuzzySuggestModal: the ranking has to know which of
// abbreviation, alias and title matched (the official short form is what a
// reader knows and has to win), and Obsidian's generic fuzzy scorer cannot be
// told that. The index is local, so there is no debounce - it would only add
// lag to a filter that already finishes well inside a frame.
export class LawPickerModal extends SuggestModal<LawIndexEntry> {
  // What an empty query shows, computed once per open: the statutes this reader
  // last opened, then the head of the catalog to browse from.
  private emptyQueryList: LawIndexEntry[]
  private recentSet: Set<string>

  constructor(
    app: App,
    private entries: LawIndexEntry[],
    recentIds: string[],
    private onPick: (entry: LawIndexEntry) => void
  ) {
    super(app)
    const recents = orderLawRecents(entries, recentIds, LawRecentsLimit)
    this.recentSet = new Set(recents.map((entry) => entry.lawId))
    // Recents alone would hide the catalog: after opening a single statute the
    // list had exactly one row and there was no way to browse to another.
    const head = firstLawEntries(entries, LawPickerRenderLimit)
      .filter((entry) => !this.recentSet.has(entry.lawId))
    this.emptyQueryList = recents.concat(head).slice(0, LawPickerRenderLimit)
    this.limit = LawPickerRenderLimit
    this.setPlaceholder(`Gesetz suchen (${entries.length}) - Abkürzung, Titel oder Alias`)
    this.emptyStateText = "Kein Gesetz gefunden."
    this.modalEl.addClass("sl-law-picker")
    this.inputEl.setAttr("data-sl-test", "law-picker-input")
    this.setInstructions([
      { command: "↑↓", purpose: "auswählen" },
      { command: "↵", purpose: "laden" },
      { command: "esc", purpose: "schließen" }
    ])
  }

  getSuggestions(query: string): LawIndexEntry[] {
    // The empty query is the single largest usability win here: a reader works
    // with the same handful of statutes for weeks. The catalog head follows the
    // recents so the list is never a dead end - neither on first use, when
    // there is no history, nor after the first statute, when there is one.
    if (query.trim().length == 0) {
      return this.emptyQueryList
    }
    return filterLawEntries(this.entries, query, LawPickerRenderLimit)
  }

  renderSuggestion(entry: LawIndexEntry, el: HTMLElement): void {
    el.addClass("sl-law-suggestion")
    el.setAttr("data-sl-law-id", entry.lawId)
    // The abbreviation alone is unhelpful in a list and the official title alone
    // is unreadable at its length, so both are shown, in that order.
    const title = el.createEl("div", { cls: "sl-law-suggestion-title" })
    title.createEl("span", { cls: "sl-law-suggestion-abbr", text: entry.abbreviation || entry.lawId })
    if (this.recentSet.has(entry.lawId)) {
      title.createEl("span", { cls: "sl-law-suggestion-badge is-recent", text: "zuletzt" })
    }
    if (!entry.held) {
      title.createEl("span", { cls: "sl-law-suggestion-badge", text: "nicht vorhanden" })
      el.addClass("is-unavailable")
    }
    el.createEl("div", { cls: "sl-law-suggestion-subtitle", text: entry.title || entry.lawId })
  }

  // The documented hook, and the only one this modal overrides. An earlier
  // version intercepted `selectSuggestion` to keep the picker open on an
  // unavailable row; that sits between Obsidian's chooser and this method and
  // swallowed the choice entirely. A refused row now costs a notice and a
  // closed picker - a worse consolation prize than staying open, but never a
  // click that does nothing at all.
  onChooseSuggestion(entry: LawIndexEntry, _evt: MouseEvent | KeyboardEvent): void {
    if (entry == undefined) {
      new Notice("UseSemaLogic: die Auswahl konnte keinem Gesetz zugeordnet werden.")
      return
    }
    // `held === false` means the registry knows the statute but this
    // installation does not serve the document.
    if (!entry.held) {
      new Notice(`UseSemaLogic: ${entry.abbreviation || entry.lawId} wird auf diesem Server nicht vorgehalten.`)
      return
    }
    this.onPick(entry)
  }
}
