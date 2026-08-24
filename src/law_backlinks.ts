// Where a law link points, for both kinds the service emits: the reference list
// ("Verweise") of an AnnotatedHTML-with-backlinks document (issues-private/02),
// and the resolved citations in its running text.
//
// The list names which provisions cite the current node. On the server a
// links.js turns its entries into navigation; Obsidian runs no links.js at all
// - styles.css records the same reason for the badge - so inside the vault the
// entries rendered as text that named a reference without leading to it.
//
// This module is the single place that decides what a clicked link points at,
// so the view's affordance and the plugin's click routes can never disagree
// about which links lead somewhere.
//
// Every address comes from the server: attributes the annotator wrote, or the
// link's own href. The visible label ("SS 11 Absatz 2") is never parsed back
// into a provision - the same constraint the external law links are held to.

export type LawLinkRoute = {
  // The id of the cited provision inside the annotated document.
  targetId: string
  // The statute the citing provision belongs to. Empty means "this document".
  lawId: string
  lawTitle: string
  // Where the annotated document of `lawId` can be fetched, and the public
  // fallback for a statute this installation does not hold.
  catalogUrl: string
  giiUrl: string
  // The link's visible text ("BAfoeG SS 36 Abs. 4 Satz 1"). Used for messages
  // about what was clicked - never an address, and never read back into one.
  label: string
  // The node address of a /law/<address> link, and the URL that resolves it.
  // That route is the service's *public* resolver: it answers 302 to
  // gesetze-im-internet.de. It names the node, but it is not a catalog address
  // and must never be fetched as one.
  lawAddress: string
  resolverUrl: string
}

// Where reference entries live: the appendix a document carries with it, and
// the panel a server side links.js would append.
export const BacklinkContainerSelector = ".backlink-inline, .backlink-panel"

// What inside an entry is the link itself. The quoted sentence
// (.backlink-text) deliberately is not: it is the statute's own text, and a
// reader selects and copies it.
export const BacklinkSourceSelector = [
  "[data-sl-link-kind='backlink']",
  ".backlink-source",
  ".backlink-anchor",
  "a[href]"
].join(", ")

// A resolved citation in the running text. The service spells the classes
// `lawlink external resolved` on the wrapping span and leaves the anchor bare,
// so the anchor is addressed through its container rather than through a class
// of its own.
export const LawCitationSelector = ".lawlink a[href]"

// Put on the links that actually lead somewhere. One the server described
// without a target keeps its quiet presentation instead of promising a jump
// that cannot happen.
export const BacklinkClickableClass = "sl-backlink-clickable"

// Links carrying this are already handled by the external law link route; this
// module must not act on them a second time.
const ExternalLawSelector = "[data-sl-link-kind='external-law']"

// The element a click started on, resolved to the link it belongs to.
// `undefined` for everything outside a reference list, and for the parts of an
// entry that are text rather than link.
export function findBacklinkSource(element: HTMLElement): HTMLElement | undefined {
  const container = element.closest(BacklinkContainerSelector)
  if (container == undefined) { return undefined }
  if (element.closest(ExternalLawSelector) != undefined) { return undefined }
  const source = element.closest(BacklinkSourceSelector) as HTMLElement | null
  if (source == undefined || !container.contains(source)) { return undefined }
  return source
}

export function resolveBacklinkRoute(source: HTMLElement): LawLinkRoute | undefined {
  const entry = backlinkEntryOf(source)
  const own = routeFromChain(source, entry)
  if (own != undefined) { return own }
  // A source label without attributes of its own: the entry may still carry the
  // address on a single other element. One element is read, not the union of
  // all of them, so two references in one entry cannot be merged into a third.
  const alternative = entry.querySelector<HTMLElement>("[data-sl-target-id]")
    ?? entry.querySelector<HTMLElement>("a[href]")
    ?? undefined
  if (alternative == undefined || alternative == source) { return undefined }
  return routeFromChain(alternative, entry)
}

// A resolved citation in the running text carries no attributes at all - only
// the href - so this is the whole of its address.
export function routeFromLawHref(href: string, label: string): LawLinkRoute | undefined {
  const route = emptyRoute(label)
  mergeHref(route, href)
  return isEmptyRoute(route) ? undefined : route
}

// Marks every link in `scope` that leads somewhere. Returns how many.
export function decorateBacklinkEntries(scope: HTMLElement): number {
  let decorated = 0
  scope.querySelectorAll<HTMLElement>(BacklinkContainerSelector).forEach((container) => {
    container.querySelectorAll<HTMLElement>(BacklinkSourceSelector).forEach((source) => {
      if (source.closest(ExternalLawSelector) != undefined) { return }
      if (resolveBacklinkRoute(source) == undefined) { return }
      source.classList.add(BacklinkClickableClass)
      if (source.tagName != "A") {
        // An anchor is focusable and is announced as a link already; a span
        // that behaves like one has to say so itself.
        source.setAttribute("role", "link")
        source.setAttribute("tabindex", "0")
      }
      decorated += 1
    })
  })
  return decorated
}

// The markup of the whole entry, for the log line that has to name what the
// server did not send. The clicked label alone would hide an address sitting on
// a sibling, which is the one thing such a line must not do.
export function backlinkEntryMarkup(source: HTMLElement, limit: number = 1200): string {
  const markup = backlinkEntryOf(source).outerHTML ?? ""
  return markup.length > limit ? `${markup.slice(0, limit)} ...` : markup
}

function backlinkEntryOf(source: HTMLElement): HTMLElement {
  return (source.closest(".backlink-entry") as HTMLElement | null)
    ?? (source.closest("li") as HTMLElement | null)
    ?? source
}

// Reads one link's address from the element itself and from its ancestors up to
// the entry, so a server that puts the attributes on the <li> and the label on
// a child works as well as one that puts everything on the anchor.
function routeFromChain(element: HTMLElement, entry: HTMLElement): LawLinkRoute | undefined {
  const chain: HTMLElement[] = []
  let current: HTMLElement | null = element
  while (current != undefined) {
    chain.push(current)
    if (current == entry) { break }
    current = current.parentElement
  }
  const route: LawLinkRoute = {
    targetId: firstDataValue(chain, "slTargetId"),
    lawId: firstDataValue(chain, "slLawId"),
    lawTitle: firstDataValue(chain, "slLawTitle"),
    catalogUrl: firstDataValue(chain, "slCatalogUrl"),
    giiUrl: firstDataValue(chain, "slGiiUrl"),
    label: labelOf(element),
    lawAddress: "",
    resolverUrl: ""
  }
  mergeHref(route, firstHref(chain))
  return isEmptyRoute(route) ? undefined : route
}

// An href read as the two things it can carry: where the document is, and which
// node inside it. Both are addresses the server wrote.
function mergeHref(route: LawLinkRoute, href: string): void {
  if (href.length == 0) { return }
  const hashAt = href.indexOf("#")
  const path = hashAt < 0 ? href : href.slice(0, hashAt)
  const fragment = hashAt < 0 ? "" : href.slice(hashAt + 1)
  if (route.targetId.length == 0 && fragment.length > 0) {
    route.targetId = decodeFragment(fragment)
  }
  // Both link kinds spell their target as /law/<address> - the reference list
  // relative, a citation absolute against the service's public host. That route
  // is the *public* resolver: it answers 302 to gesetze-im-internet.de. It names
  // the node - which is also the id the annotated document gives it - but it is
  // not a catalog address, and fetching it as one delivers the public page in
  // place of the statute.
  const address = lawAddressOf(path)
  if (address.length > 0) {
    route.lawAddress = address
    route.resolverUrl = path
    if (route.targetId.length == 0) { route.targetId = address }
    return
  }
  if (path.length == 0 || route.catalogUrl.length > 0 || route.giiUrl.length > 0) { return }
  // A public address is the fallback data-sl-gii-url describes and is opened as
  // it stands; anything else is resolved against the configured API base, the
  // same way an external law link's catalog URL is.
  if (isAbsoluteHttpUrl(path)) {
    route.giiUrl = href
  } else {
    route.catalogUrl = path
  }
}

function emptyRoute(label: string): LawLinkRoute {
  return {
    targetId: "", lawId: "", lawTitle: "", catalogUrl: "", giiUrl: "",
    label, lawAddress: "", resolverUrl: ""
  }
}

function isEmptyRoute(route: LawLinkRoute): boolean {
  return route.targetId.length == 0 && route.lawId.length == 0 && route.catalogUrl.length == 0
    && route.giiUrl.length == 0 && route.lawAddress.length == 0
}

// Display text only: collapsed, and cut where a tab title stops being one.
function labelOf(element: HTMLElement): string {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim()
  return text.length > 80 ? `${text.slice(0, 80)}...` : text
}

function firstDataValue(chain: HTMLElement[], key: string): string {
  for (const element of chain) {
    const value = element.dataset?.[key]
    if (typeof value == "string" && value.trim().length > 0) { return value.trim() }
  }
  return ""
}

function firstHref(chain: HTMLElement[]): string {
  for (const element of chain) {
    const href = element.getAttribute("href")
    if (href != undefined && href.trim().length > 0) { return href.trim() }
  }
  return ""
}

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch (e) {
    return fragment
  }
}

// The single segment of a /law/<address> path. Deliberately not matched for
// /law/doc/<lawId> and friends: those name a document, not a node.
const LawAddressPattern = /^(?:.*\/)?law\/([^/]+)\/?$/

function lawAddressOf(path: string): string {
  const match = LawAddressPattern.exec(path.split("?")[0])
  return match == undefined ? "" : decodeFragment(match[1])
}

function isAbsoluteHttpUrl(href: string): boolean {
  return /^https?:\/\//i.test(href)
}
