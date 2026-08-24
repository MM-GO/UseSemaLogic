// WP23a T1/T2 - the client side of the statute catalog.
//
// The server answers GET /law/index with one deterministic, ETag'd projection
// of its catalog (schema "law-index-v1"). At ~6100 statutes a dropdown is not
// an option, so the whole index is kept in memory for the session and every
// keystroke is matched locally; there is deliberately no server side `?q=`.
//
// Everything in this module is DOM free so the matcher can be unit tested.

// One catalog row: [lawId, abbreviation, title, aliases, held].
// Arrays rather than objects because the key names would otherwise be repeated
// once per statute.
export type LawIndexRow = [string, string, string, string[], boolean]

export type LawIndexDocument = {
  schema?: string
  generatedAt?: string
  statutes?: LawIndexRow[]
}

// A catalog row with its pre-folded search keys. Folding once at load time
// keeps the per-keystroke work down to plain string comparisons.
export type LawIndexEntry = {
  lawId: string
  abbreviation: string
  title: string
  aliases: string[]
  // false where the registry knows the statute but this installation does not
  // serve the document (Statute.Bundle == ""). Such a row cannot be opened.
  held: boolean
  foldedAbbreviation: string
  foldedTitle: string
  foldedAliases: string[]
  compactAbbreviation: string
  compactTitle: string
  compactAliases: string[]
}

export const LawIndexSchema = "law-index-v1"
export const LawIndexRoute = "/law/index"
// Rendering thousands of rows costs more than filtering them does.
export const LawPickerRenderLimit = 50
// How many statutes the picker offers on an empty query.
export const LawRecentsLimit = 12

// The server predates S1. A distinct type so the caller can tell "no index
// route" apart from "the index could not be fetched".
export class LawIndexUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LawIndexUnavailableError"
  }
}

// One /law/index round trip, supplied by the caller so this module needs no
// Obsidian imports. `etag` is the value to revalidate with; "" on a cold start.
export type LawIndexFetcher = (etag: string) => Promise<{ status: number; text: string; etag: string }>

const DiacriticPattern = /[\u0300-\u036f]/g
const NonSearchPattern = /[^a-z0-9]+/g

// A reader types "bafoeg" for the statute the catalog spells with an o-umlaut,
// and "Bundesgesetz uber" for the title spelled with a u-umlaut. Folding an
// umlaut to its transcription (rather than only stripping the diacritic) is
// what makes every one of those spellings find the same statute.
export function foldLawText(value: string): string {
  return (value ?? "")
    // NFC first: a decomposed o-umlaut would otherwise lose its diacritic below
    // and fold to "o" instead of "oe".
    .normalize("NFC")
    .toLowerCase()
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(DiacriticPattern, "")
    .replace(/\s+/g, " ")
    .trim()
}

// The folded form without separators, so "sgb5" finds "SGB 5" and a query is
// not defeated by punctuation inside an abbreviation.
export function compactLawText(value: string): string {
  return foldLawText(value).replace(NonSearchPattern, "")
}

function stringField(value: unknown): string {
  return typeof value == "string" ? value : ""
}

function aliasField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((alias): alias is string => typeof alias == "string") : []
}

// WP23a S1 specifies array rows, because the key names would otherwise be
// repeated 6131 times. The object form is accepted as well: it carries the same
// five fields, and refusing to read a catalog over its serialisation shape would
// leave the reader with an empty picker and no explanation.
export function makeLawIndexEntry(row: LawIndexRow | Record<string, unknown>): LawIndexEntry | undefined {
  let lawId: string
  let abbreviation: string
  let title: string
  let aliases: string[]
  let held: boolean
  if (Array.isArray(row)) {
    if (row.length < 3) { return undefined }
    lawId = stringField(row[0])
    abbreviation = stringField(row[1])
    title = stringField(row[2])
    aliases = aliasField(row[3])
    // A row that omits `held` counts as held; only an explicit false disables it.
    held = row[4] !== false
  } else if (row != undefined && typeof row == "object") {
    lawId = stringField(row["lawId"] ?? row["id"] ?? row["docId"] ?? row["docID"])
    abbreviation = stringField(row["abbreviation"] ?? row["abbr"] ?? row["shortTitle"])
    title = stringField(row["title"] ?? row["longTitle"] ?? row["name"])
    aliases = aliasField(row["aliases"] ?? row["alias"])
    held = row["held"] !== false
  } else {
    return undefined
  }
  if (lawId.length == 0) { return undefined }
  return {
    lawId,
    abbreviation,
    title,
    aliases,
    held,
    foldedAbbreviation: foldLawText(abbreviation),
    foldedTitle: foldLawText(title),
    foldedAliases: aliases.map(foldLawText),
    compactAbbreviation: compactLawText(abbreviation),
    compactTitle: compactLawText(title),
    compactAliases: aliases.map(compactLawText)
  }
}

export function parseLawIndex(body: string): LawIndexEntry[] {
  let parsed: LawIndexDocument
  try {
    parsed = JSON.parse(body) as LawIndexDocument
  } catch (e) {
    throw new Error(`the law index is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (parsed == undefined || typeof parsed != "object") {
    throw new Error("the law index is not an object")
  }
  if (parsed.schema != undefined && parsed.schema != LawIndexSchema) {
    throw new Error(`unexpected law index schema "${parsed.schema}" (expected "${LawIndexSchema}")`)
  }
  if (!Array.isArray(parsed.statutes)) {
    const keys = Object.keys(parsed).join(", ")
    throw new Error(`the law index carries no statutes array (keys: ${keys.length > 0 ? keys : "none"})`)
  }
  const entries: LawIndexEntry[] = []
  parsed.statutes.forEach((row) => {
    const entry = makeLawIndexEntry(row)
    if (entry != undefined) { entries.push(entry) }
  })
  // A body full of rows that none of the readers above understood is a shape
  // mismatch, not an empty catalog. Silently answering "no statutes" would send
  // the reader looking at the picker instead of at the payload.
  if (entries.length == 0 && parsed.statutes.length > 0) {
    throw new Error(`none of the ${parsed.statutes.length} law index rows could be read;`
      + ` the first one is ${JSON.stringify(parsed.statutes[0]).slice(0, 200)}`)
  }
  return entries
}

// The route a statute's annotated document is served from. One spelling, so a
// reference, a citation and the picker all fetch the same bytes.
export function lawDocumentRoute(lawId: string): string {
  return `/law/doc/${encodeURIComponent(lawId)}?view=snapshot`
}

// A node address ("DE.GESETZ.SGB_8.P13") begins with the statute's own lawId and
// continues with the path inside it. Where one ends cannot be decided by
// counting dots - "DE.GESETZ.SGB_10" and "DE.GESETZ.SGB_10_KAP1_2" are both real
// ids - so it is decided against the catalog itself: the longest known lawId the
// address continues with a dot. "" where the catalog knows no such statute,
// which is an answer, not a guess.
export function lawIdForAddress(address: string, lawIds: Iterable<string>): string {
  const known = lawIds instanceof Set ? lawIds as Set<string> : new Set(lawIds)
  if (known.has(address)) { return address }
  let best = ""
  for (let i = 0; i < address.length; i++) {
    if (address.charAt(i) != ".") { continue }
    const candidate = address.slice(0, i)
    if (candidate.length > best.length && known.has(candidate)) { best = candidate }
  }
  return best
}

// A served document names itself on its root element: a short designation for
// the narrow tab caption, data-sl-title the full name for the view header. Read
// off the bytes rather than the rendered DOM, which has been through Obsidian's
// sanitizer, and only from the root tag - a nested element carries its own
// names, and the first match in the file need not be the document's.
export function readLawDocumentTitles(fragment: string): { shortTitle: string; title: string } {
  const root = /<section[^>]*\sclass="law[^"]*"[^>]*>/.exec(fragment.slice(0, 8000))
  const tag = root == undefined ? "" : root[0]
  return {
    // data-sl-lawlink-source is the designation a citation uses ("SGB 8",
    // "BAfoeG"), and it is the dependable one: SGB 8's data-sl-shorttitle reads
    // "Artikel 1 des Gesetzes v. 26. Juni 1990, BGBl. I S. 1163", which is a
    // promulgation note and not a tab caption (checked against a live service,
    // 2026-08-24).
    shortTitle: attributeValue(tag, "data-sl-lawlink-source") || attributeValue(tag, "data-sl-shorttitle"),
    title: attributeValue(tag, "data-sl-title")
  }
}

function attributeValue(html: string, name: string): string {
  const match = new RegExp(`${name}="([^"]*)"`).exec(html)
  if (match == undefined) { return "" }
  return match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim()
}

// Score tiers, lower is better. The abbreviation is what a reader knows, so it
// outranks the alias, which outranks the official title.
const FieldAbbreviation = 0
const FieldAlias = 10
const FieldTitle = 20
const QualityEqual = 0
const QualityPrefix = 100
const QualityContains = 200
// A match on the separator-free form is a slightly weaker signal than the same
// match on the folded text.
const CompactPenalty = 5
const QualitySubsequence = 500
export const LawNoMatch = -1

function matchQuality(haystack: string, needle: string): number {
  if (haystack.length == 0 || needle.length == 0) { return LawNoMatch }
  if (haystack == needle) { return QualityEqual }
  const index = haystack.indexOf(needle)
  if (index == 0) { return QualityPrefix }
  if (index > 0) { return QualityContains + Math.min(index, 50) }
  return LawNoMatch
}

function isSubsequence(haystack: string, needle: string): boolean {
  if (needle.length == 0) { return false }
  let position = 0
  for (let i = 0; i < needle.length; i++) {
    position = haystack.indexOf(needle.charAt(i), position)
    if (position < 0) { return false }
    position++
  }
  return true
}

function better(current: number, candidate: number): number {
  if (candidate == LawNoMatch) { return current }
  if (current == LawNoMatch || candidate < current) { return candidate }
  return current
}

function scoreField(base: number, folded: string, compact: string, foldedQuery: string, compactQuery: string): number {
  let score = LawNoMatch
  const foldedQuality = matchQuality(folded, foldedQuery)
  if (foldedQuality != LawNoMatch) { score = base + foldedQuality }
  const compactQuality = matchQuality(compact, compactQuery)
  if (compactQuality != LawNoMatch) { score = better(score, base + compactQuality + CompactPenalty) }
  return score
}

// LawNoMatch (-1) where the entry does not match at all.
export function scoreLawEntry(entry: LawIndexEntry, foldedQuery: string, compactQuery: string): number {
  if (foldedQuery.length == 0) { return LawNoMatch }
  let score = scoreField(FieldAbbreviation, entry.foldedAbbreviation, entry.compactAbbreviation, foldedQuery, compactQuery)
  for (let i = 0; i < entry.foldedAliases.length; i++) {
    score = better(score, scoreField(FieldAlias, entry.foldedAliases[i], entry.compactAliases[i], foldedQuery, compactQuery))
  }
  score = better(score, scoreField(FieldTitle, entry.foldedTitle, entry.compactTitle, foldedQuery, compactQuery))
  if (score != LawNoMatch) { return score }
  // Last resort: the letters of the query appear in order in the abbreviation.
  // Restricted to the abbreviation because a subsequence over 6100 titles finds
  // everything and therefore nothing.
  if (compactQuery.length > 1 && isSubsequence(entry.compactAbbreviation, compactQuery)) {
    return QualitySubsequence + entry.compactAbbreviation.length
  }
  return LawNoMatch
}

// Ranked matches, capped at `limit`. Ties go to the shorter abbreviation - at
// equal score "BGB" is what the reader meant, not "BGBEG".
export function filterLawEntries(entries: LawIndexEntry[], query: string, limit: number = LawPickerRenderLimit): LawIndexEntry[] {
  const foldedQuery = foldLawText(query)
  const compactQuery = compactLawText(query)
  if (foldedQuery.length == 0) { return [] }
  const scored: { entry: LawIndexEntry; score: number }[] = []
  entries.forEach((entry) => {
    const score = scoreLawEntry(entry, foldedQuery, compactQuery)
    if (score != LawNoMatch) { scored.push({ entry, score }) }
  })
  scored.sort((left, right) => {
    if (left.score != right.score) { return left.score - right.score }
    if (left.entry.abbreviation.length != right.entry.abbreviation.length) {
      return left.entry.abbreviation.length - right.entry.abbreviation.length
    }
    return left.entry.lawId.localeCompare(right.entry.lawId)
  })
  return scored.slice(0, limit).map((hit) => hit.entry)
}

// The empty-query list: the statutes this reader last opened, most recent
// first. Ids that are no longer in the catalog are dropped silently.
export function orderLawRecents(entries: LawIndexEntry[], recentIds: string[], limit: number = LawRecentsLimit): LawIndexEntry[] {
  const byId = new Map<string, LawIndexEntry>()
  entries.forEach((entry) => byId.set(entry.lawId, entry))
  const recents: LawIndexEntry[] = []
  recentIds.forEach((lawId) => {
    if (recents.length >= limit) { return }
    const entry = byId.get(lawId)
    if (entry != undefined) { recents.push(entry) }
  })
  return recents
}

// What the picker offers before the reader has opened anything: the head of the
// catalog by abbreviation. Without it an empty query on first use shows an empty
// list, which is indistinguishable from an index that failed to load.
export function firstLawEntries(entries: LawIndexEntry[], limit: number = LawPickerRenderLimit): LawIndexEntry[] {
  return entries
    .slice()
    .sort((left, right) => left.foldedAbbreviation.localeCompare(right.foldedAbbreviation) ||
      left.lawId.localeCompare(right.lawId))
    .slice(0, limit)
}

export function rememberLawRecent(recentIds: string[], lawId: string, limit: number = LawRecentsLimit): string[] {
  const next = [lawId, ...recentIds.filter((id) => id != lawId)]
  return next.slice(0, limit)
}

// The session copy of /law/index. Loaded on first use - not at plugin load, so
// a reader who never opens the picker never pays for it.
export class LawIndexStore {
  private entries: LawIndexEntry[] | undefined
  private etag: string = ""

  constructor(private fetcher: LawIndexFetcher) { }

  public isLoaded(): boolean {
    return this.entries != undefined
  }

  public getEntries(): LawIndexEntry[] {
    return this.entries ?? []
  }

  public reset(): void {
    this.entries = undefined
    this.etag = ""
  }

  // `force` revalidates an index that is already in memory; this is T4's
  // recovery after /law/doc answered 404, not a periodic refresh.
  public async load(force: boolean = false): Promise<LawIndexEntry[]> {
    if (this.entries != undefined && !force) { return this.entries }
    const response = await this.fetcher(this.etag)
    if (response.status == 404) {
      throw new LawIndexUnavailableError("this server has no /law/index route")
    }
    if (response.status == 304) {
      if (this.entries != undefined) { return this.entries }
      // Revalidated against an ETag whose body is no longer held; ask again cold.
      this.etag = ""
      const reload = await this.fetcher("")
      if (reload.status == 404) {
        throw new LawIndexUnavailableError("this server has no /law/index route")
      }
      if (reload.status < 200 || reload.status >= 300) {
        throw new Error(`HTTP ${reload.status}`)
      }
      this.entries = parseLawIndex(reload.text)
      this.etag = reload.etag
      return this.entries
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }
    this.entries = parseLawIndex(response.text)
    this.etag = response.etag
    return this.entries
  }
}

// Counted rather than measured with TextEncoder/Blob: those allocate a second
// copy of a document that can be 11 MB, which is exactly what WP23a's "Limits"
// section says not to do just to print a size.
export function utf8ByteLength(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) { bytes += 1 }
    else if (code < 0x800) { bytes += 2 }
    else if (code >= 0xd800 && code <= 0xdbff) {
      // A surrogate pair is one 4-byte code point; skip its low half.
      bytes += 4
      i++
    }
    else { bytes += 3 }
  }
  return bytes
}

// Sizes in the notices are what tells a reader that an 11 MB statute actually
// arrived. German decimal comma, to match the rest of the reader-facing text.
export function formatLawByteSize(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B` }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB` }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
}
