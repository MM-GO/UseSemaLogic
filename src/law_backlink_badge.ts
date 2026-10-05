// The backlink count badge ("↩1") of a node that carries no reference list of
// its own.
//
// The server writes the count as data-sl-backlinks, and styles.css shows it as
// ::after. On the service's page links.js turns that badge into a panel;
// Obsidian runs no links.js, so in the vault it was an affordance that led
// nowhere. Where the node holds its own .backlink-inline the stylesheet hides
// the badge - the block is the same fact and opens without a script. What is
// left are single sentences (Law_New), whose citations are mostly made in the
// running text of the same statute and are not repeated in any list.
//
// This module gives those badges a real element to click and finds what the
// count stands for. The element carries no text node - the glyph and number
// stay generated content - so the result search, a reader's copy-paste and
// the deannotation round trip (which posts the fetched bytes, not the DOM)
// all see the statute's text only.

export const BacklinkBadgeClass = "sl-backlink-badge"
// Put on a node whose ::after badge was replaced by a BacklinkBadgeClass child.
export const BacklinkBadgeHostClass = "sl-backlink-badge-host"

const BacklinkListSelector = "details.backlink-inline"

function ownBacklinkList(element: Element): HTMLDetailsElement | undefined {
  return Array.from(element.children).find((child): child is HTMLDetailsElement =>
    child.matches(BacklinkListSelector))
}

// Adds a clickable badge to every counted node without its own list. Returns
// how many were added; running it twice adds none.
export function addBacklinkBadges(scope: HTMLElement): number {
  let added = 0
  scope.querySelectorAll<HTMLElement>("[data-sl-backlinks]").forEach((host) => {
    if (host.classList.contains(BacklinkBadgeClass) || host.classList.contains(BacklinkBadgeHostClass)) { return }
    if (ownBacklinkList(host) != undefined) { return }
    const count = (host.getAttribute("data-sl-backlinks") ?? "").trim()
    if (count.length == 0 || host.id.length == 0) { return }
    const badge = document.createElement("span")
    badge.className = BacklinkBadgeClass
    badge.setAttribute("data-sl-backlinks", count)
    badge.setAttribute("role", "button")
    badge.setAttribute("tabindex", "0")
    badge.setAttribute("aria-label", `${count} Verweis(e) auf diese Stelle`)
    host.appendChild(badge)
    host.classList.add(BacklinkBadgeHostClass)
    added += 1
  })
  return added
}

// The node a badge counts for.
export function backlinkBadgeHost(badge: HTMLElement): HTMLElement | undefined {
  const host = badge.parentElement
  return host != undefined && host.classList.contains(BacklinkBadgeHostClass) ? host : undefined
}

export type InDocumentCitation = {
  // The citation's own anchor ("Sätzen 1").
  link: HTMLAnchorElement
  // The provision that makes the citation - where a click leads.
  citingId: string
}

// The citations of `targetId` in the running text of `scope`. Reference lists
// are left out: their entries point from the cited node to the citing one, the
// opposite direction.
export function findInDocumentCitations(scope: HTMLElement, targetId: string): InDocumentCitation[] {
  const citations: InDocumentCitation[] = []
  scope.querySelectorAll<HTMLAnchorElement>(".lawlink a[href^='#']").forEach((link) => {
    if (link.closest(".backlink-inline") != undefined) { return }
    if (decodeFragment((link.getAttribute("href") ?? "").slice(1)) != targetId) { return }
    const citing = link.closest<HTMLElement>("[id]")
    if (citing == undefined) { return }
    citations.push({ link, citingId: citing.id })
  })
  return citations
}

// The nearest enclosing reference list - the Absatz or § the node belongs to.
// It names the citations of the whole section, so it is offered as the place
// to look further, not as this node's own list.
export function nearestBacklinkList(host: HTMLElement): HTMLDetailsElement | undefined {
  let current = host.parentElement
  while (current != undefined) {
    const list = ownBacklinkList(current)
    if (list != undefined) { return list }
    current = current.parentElement
  }
  return undefined
}

function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch (e) {
    return fragment
  }
}
