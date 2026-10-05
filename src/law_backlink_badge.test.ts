import {
  BacklinkBadgeClass, BacklinkBadgeHostClass, addBacklinkBadges, backlinkBadgeHost,
  findInDocumentCitations, nearestBacklinkList
} from "./law_backlink_badge"

function render(html: string): HTMLElement {
  const scope = document.createElement("div")
  scope.innerHTML = html
  document.body.appendChild(scope)
  return scope
}

afterEach(() => { document.body.innerHTML = "" })

// Shaped after Law_New's BauGB SS 1a Abs. 2: the Absatz carries its own list,
// its sentence S1 only the count, and S3 cites S1 in its running text.
const Paragraph = `
<div class="subsection" id="P1A.A2" data-sl-backlinks="1">
  <details class="backlink-inline"><summary class="backlink-summary">↩ 1 Verweis</summary>
    <ul><li class="backlink-entry"><span class="backlink-source"><a href="#P34.A5.S3">SS 34</a></span></li></ul>
  </details>
  <p><span class="sentence" id="P1A.A2.S1" data-sl-backlinks="1">(2) Mit Grund und Boden ...</span></p>
  <p><span class="sentence" id="P1A.A2.S3">Die Grundsaetze nach den
    <span class="lawlink resolved"><a href="#P1A.A2.S1">Saetzen 1</a></span> und 2 ...</span></p>
</div>`

describe("addBacklinkBadges", () => {
  test("only a counted node without its own list gets a badge", () => {
    const scope = render(Paragraph)
    expect(addBacklinkBadges(scope)).toBe(1)
    const badge = scope.querySelector<HTMLElement>(`.${BacklinkBadgeClass}`)
    expect(badge?.parentElement?.id).toBe("P1A.A2.S1")
    expect(badge?.getAttribute("data-sl-backlinks")).toBe("1")
    expect(scope.querySelector("[id='P1A.A2']")?.classList.contains(BacklinkBadgeHostClass)).toBe(false)
  })

  test("the badge adds no text to the statute", () => {
    const scope = render(Paragraph)
    const before = scope.textContent
    addBacklinkBadges(scope)
    expect(scope.textContent).toBe(before)
  })

  test("running it again adds nothing", () => {
    const scope = render(Paragraph)
    addBacklinkBadges(scope)
    expect(addBacklinkBadges(scope)).toBe(0)
    expect(scope.querySelectorAll(`.${BacklinkBadgeClass}`).length).toBe(1)
  })

  test("a badge knows the node it counts for", () => {
    const scope = render(Paragraph)
    addBacklinkBadges(scope)
    const badge = scope.querySelector<HTMLElement>(`.${BacklinkBadgeClass}`)!
    expect(backlinkBadgeHost(badge)?.id).toBe("P1A.A2.S1")
  })
})

describe("findInDocumentCitations", () => {
  test("finds the running-text citation and the provision making it", () => {
    const scope = render(Paragraph)
    const citations = findInDocumentCitations(scope, "P1A.A2.S1")
    expect(citations.map((citation) => citation.citingId)).toEqual(["P1A.A2.S3"])
    expect(citations[0].link.textContent).toBe("Saetzen 1")
  })

  test("reference list entries point the other way and are left out", () => {
    const scope = render(Paragraph)
    expect(findInDocumentCitations(scope, "P34.A5.S3")).toEqual([])
  })
})

describe("nearestBacklinkList", () => {
  test("is the list of the enclosing section", () => {
    const scope = render(Paragraph)
    const host = scope.querySelector<HTMLElement>("[id='P1A.A2.S1']")!
    expect(nearestBacklinkList(host)?.querySelector("summary")?.textContent).toBe("↩ 1 Verweis")
  })

  test("is undefined where no section carries one", () => {
    const scope = render(`<p><span id="X.S1" data-sl-backlinks="2">Text</span></p>`)
    expect(nearestBacklinkList(scope.querySelector<HTMLElement>("[id='X.S1']")!)).toBeUndefined()
  })
})
