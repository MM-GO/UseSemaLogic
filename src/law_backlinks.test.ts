import {
  BacklinkClickableClass, backlinkEntryMarkup, decorateBacklinkEntries, findBacklinkSource,
  resolveBacklinkRoute, routeFromLawHref
} from "./law_backlinks"

function render(html: string): HTMLElement {
  const scope = document.createElement("div")
  scope.innerHTML = html
  document.body.appendChild(scope)
  return scope
}

afterEach(() => { document.body.innerHTML = "" })

function sourceOf(scope: HTMLElement, selector: string): HTMLElement {
  const element = scope.querySelector<HTMLElement>(selector)
  if (element == undefined) { throw new Error(`no element for ${selector}`) }
  return element
}

describe("findBacklinkSource", () => {
  test("resolves the clicked label to its link", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <a class="backlink-source" data-sl-link-kind="backlink" data-sl-target-id="law_BAfoeG.p11.a2">SS 11 Absatz 2</a>
      <span class="backlink-text">Der Bedarf ...</span></li></ul></details>`)
    expect(findBacklinkSource(sourceOf(scope, ".backlink-source"))?.className).toContain("backlink-source")
  })

  test("the quoted sentence is text, not a link", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <span class="backlink-source" data-sl-target-id="law_BAfoeG.p11">SS 11</span>
      <span class="backlink-text">Der Bedarf ...</span></li></ul></details>`)
    expect(findBacklinkSource(sourceOf(scope, ".backlink-text"))).toBeUndefined()
  })

  test("outside a reference list nothing is a backlink", () => {
    const scope = render(`<p><a class="backlink-source" data-sl-target-id="law_x">SS 1</a></p>`)
    expect(findBacklinkSource(sourceOf(scope, "a"))).toBeUndefined()
  })

  test("an external law link stays with the route that already owns it", () => {
    const scope = render(`<div class="backlink-panel"><ol><li class="backlink-entry">
      <a data-sl-link-kind="external-law" data-sl-law-id="AufenthG" data-sl-target-id="law_AufenthG.p25">SS 25</a>
      </li></ol></div>`)
    expect(findBacklinkSource(sourceOf(scope, "a"))).toBeUndefined()
  })
})

describe("resolveBacklinkRoute", () => {
  test("reads the full server contract", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <a class="backlink-source" data-sl-link-kind="backlink" data-sl-law-id="AufenthG"
         data-sl-law-title="Aufenthaltsgesetz" data-sl-target-id="law_AufenthG.p25"
         data-sl-catalog-url="/catalog/laws/AufenthG/annotated"
         data-sl-gii-url="https://www.gesetze-im-internet.de/aufenthg_2004/__25.html">SS 25</a>
      </li></ul></details>`)
    expect(resolveBacklinkRoute(sourceOf(scope, ".backlink-source"))).toEqual({
      targetId: "law_AufenthG.p25",
      lawId: "AufenthG",
      lawTitle: "Aufenthaltsgesetz",
      catalogUrl: "/catalog/laws/AufenthG/annotated",
      giiUrl: "https://www.gesetze-im-internet.de/aufenthg_2004/__25.html",
      label: "SS 25",
      lawAddress: "",
      resolverUrl: ""
    })
  })

  test("a bare fragment link is an address the server wrote", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <a href="#law_BAfoeG.p11.a2">SS 11 Absatz 2</a></li></ul></details>`)
    const route = resolveBacklinkRoute(sourceOf(scope, "a"))
    expect(route?.targetId).toBe("law_BAfoeG.p11.a2")
    expect(route?.catalogUrl).toBe("")
    expect(route?.giiUrl).toBe("")
  })

  test("a percent encoded fragment is decoded", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <a href="#law_BAf%C3%B6G.p11">SS 11</a></li></ul></details>`)
    expect(resolveBacklinkRoute(sourceOf(scope, "a"))?.targetId).toBe("law_BAf\u00f6G.p11")
  })

  test("a public link becomes the GII fallback", () => {
    const scope = render(`<div class="backlink-panel"><ol><li class="backlink-entry">
      <a class="backlink-anchor" href="https://www.gesetze-im-internet.de/aufenthg_2004/__25.html">SS 25</a>
      </li></ol></div>`)
    const route = resolveBacklinkRoute(sourceOf(scope, ".backlink-anchor"))
    expect(route?.giiUrl).toBe("https://www.gesetze-im-internet.de/aufenthg_2004/__25.html")
    expect(route?.targetId).toBe("")
  })

  test("attributes on the entry serve a label that carries none", () => {
    const scope = render(`<details class="backlink-inline"><ul>
      <li class="backlink-entry" data-sl-law-id="BAfoeG" data-sl-target-id="law_BAfoeG.p11.a2">
      <span class="backlink-source">SS 11 Absatz 2</span></li></ul></details>`)
    const route = resolveBacklinkRoute(sourceOf(scope, ".backlink-source"))
    expect(route?.targetId).toBe("law_BAfoeG.p11.a2")
    expect(route?.lawId).toBe("BAfoeG")
  })

  test("a label without attributes takes the entry's own single link", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <span class="backlink-source">SS 11 Absatz 2</span>
      <a class="backlink-anchor" href="#law_BAfoeG.p11.a2">dorthin</a></li></ul></details>`)
    expect(resolveBacklinkRoute(sourceOf(scope, ".backlink-source"))?.targetId).toBe("law_BAfoeG.p11.a2")
  })

  test("a relative href carries both the document and the node", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <a class="backlink-source" href="/law/doc/BAfoeG?view=snapshot#law_BAfoeG.p11.a2">SS 11 Absatz 2</a>
      </li></ul></details>`)
    const route = resolveBacklinkRoute(sourceOf(scope, ".backlink-source"))
    expect(route?.catalogUrl).toBe("/law/doc/BAfoeG?view=snapshot")
    expect(route?.targetId).toBe("law_BAfoeG.p11.a2")
    expect(route?.giiUrl).toBe("")
  })

  test("a public href stays the public address, fragment and all", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <a class="backlink-source" href="https://www.gesetze-im-internet.de/bgb/__488.html#x">SS 488</a>
      </li></ul></details>`)
    const route = resolveBacklinkRoute(sourceOf(scope, ".backlink-source"))
    expect(route?.giiUrl).toBe("https://www.gesetze-im-internet.de/bgb/__488.html#x")
    expect(route?.catalogUrl).toBe("")
  })

  test("a server attribute wins over the href beside it", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <a class="backlink-source" data-sl-target-id="law_BGB.p488.a1"
         href="/law/doc/BGB#law_BGB.p488">SS 488</a></li></ul></details>`)
    expect(resolveBacklinkRoute(sourceOf(scope, ".backlink-source"))?.targetId).toBe("law_BGB.p488.a1")
  })

  test("an entry that names its provision only in words stays inert", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <span class="backlink-source">SS 11 Absatz 2</span>
      <span class="backlink-text">Der Bedarf ...</span></li></ul></details>`)
    expect(resolveBacklinkRoute(sourceOf(scope, ".backlink-source"))).toBeUndefined()
  })
})

// The shape the service actually serves (BGB, backlinks from other statutes):
// li.backlink-below, the label wrapped in span.backlink-source, and the address
// in the anchor's path with no fragment at all.
const ServedEntry = `<details class="backlink-inline"><ul>
  <li class="backlink-below"><span class="backlink-source">
    <a href="/law/DE.GESETZ.BAFOEG.P36.A4.S1">BAfoeG SS 36 Abs. 4 Satz 1</a></span>:
    <span class="backlink-text">Ausbildungsfoerderung wird nicht vorausgeleistet ...</span></li>
  </ul></details>`

describe("the served reference list", () => {
  test("the address is the path of a /law/<address> href", () => {
    const scope = render(ServedEntry)
    const route = resolveBacklinkRoute(sourceOf(scope, "a"))
    expect(route?.targetId).toBe("DE.GESETZ.BAFOEG.P36.A4.S1")
    expect(route?.lawAddress).toBe("DE.GESETZ.BAFOEG.P36.A4.S1")
    expect(route?.resolverUrl).toBe("/law/DE.GESETZ.BAFOEG.P36.A4.S1")
  })

  // The route answers 302 to gesetze-im-internet.de. Fetching it as a catalog
  // address is what put the public page in a law tab; it must stay apart.
  test("the resolver is never a catalog address", () => {
    const scope = render(ServedEntry)
    const route = resolveBacklinkRoute(sourceOf(scope, "a"))
    expect(route?.catalogUrl).toBe("")
    expect(route?.giiUrl).toBe("")
  })

  test("clicking the wrapping label routes as well as clicking the anchor", () => {
    const scope = render(ServedEntry)
    const label = sourceOf(scope, ".backlink-source")
    expect(findBacklinkSource(label)).not.toBeUndefined()
    expect(resolveBacklinkRoute(label)?.targetId).toBe("DE.GESETZ.BAFOEG.P36.A4.S1")
  })

  test("li.backlink-below is an entry even though it is not .backlink-entry", () => {
    const scope = render(ServedEntry)
    expect(backlinkEntryMarkup(sourceOf(scope, ".backlink-source"))).toContain("backlink-below")
  })

  test("the visible text is kept as a name for the tab", () => {
    const scope = render(ServedEntry)
    expect(resolveBacklinkRoute(sourceOf(scope, "a"))?.label).toBe("BAfoeG SS 36 Abs. 4 Satz 1")
  })

  test("the quoted sentence is still not a link", () => {
    const scope = render(ServedEntry)
    expect(findBacklinkSource(sourceOf(scope, ".backlink-text"))).toBeUndefined()
  })

  test("every entry of a served list resolves", () => {
    const scope = render(`<details class="backlink-inline"><ul>
      <li class="backlink-below"><span class="backlink-source"><a href="/law/DE.GESETZ.BAPOSTG.P12.A1.S6">BAPostG SS 12</a></span></li>
      <li class="backlink-below"><span class="backlink-source"><a href="/law/DE.GESETZ.BAUGB.P102.A3.S2">BauGB SS 102</a></span></li>
      <li class="backlink-below"><span class="backlink-source"><a href="/law/DE.GESETZ.BAUGB.P133.A3.S4">BauGB SS 133</a></span></li>
      </ul></details>`)
    const targets = Array.from(scope.querySelectorAll<HTMLElement>("a"))
      .map((anchor) => resolveBacklinkRoute(anchor)?.targetId)
    expect(targets).toEqual([
      "DE.GESETZ.BAPOSTG.P12.A1.S6", "DE.GESETZ.BAUGB.P102.A3.S2", "DE.GESETZ.BAUGB.P133.A3.S4"
    ])
    expect(decorateBacklinkEntries(scope)).toBe(6)
  })
})

describe("/law paths that name a document rather than a node", () => {
  test("a document route is not mistaken for an address", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-below">
      <a href="/law/doc/BGB?view=snapshot">BGB</a></li></ul></details>`)
    const route = resolveBacklinkRoute(sourceOf(scope, "a"))
    expect(route?.targetId).toBe("")
    expect(route?.catalogUrl).toBe("/law/doc/BGB?view=snapshot")
  })
})

describe("decorateBacklinkEntries", () => {
  test("marks only the entries that lead somewhere", () => {
    const scope = render(`<details class="backlink-inline"><ul>
      <li class="backlink-entry"><span class="backlink-source" data-sl-target-id="law_BAfoeG.p11">SS 11</span></li>
      <li class="backlink-entry"><span class="backlink-source">SS 12</span></li>
      </ul></details>`)
    expect(decorateBacklinkEntries(scope)).toBe(1)
    const sources = scope.querySelectorAll(".backlink-source")
    expect(sources[0].classList.contains(BacklinkClickableClass)).toBe(true)
    expect(sources[1].classList.contains(BacklinkClickableClass)).toBe(false)
  })

  test("a span that behaves like a link says so; an anchor already does", () => {
    const scope = render(`<details class="backlink-inline"><ul>
      <li class="backlink-entry"><span class="backlink-source" data-sl-target-id="law_BAfoeG.p11">SS 11</span></li>
      <li class="backlink-entry"><a class="backlink-source" href="#law_BAfoeG.p12">SS 12</a></li>
      </ul></details>`)
    decorateBacklinkEntries(scope)
    const span = sourceOf(scope, "span.backlink-source")
    expect(span.getAttribute("role")).toBe("link")
    expect(span.getAttribute("tabindex")).toBe("0")
    const anchor = sourceOf(scope, "a.backlink-source")
    expect(anchor.getAttribute("role")).toBeNull()
    expect(anchor.getAttribute("tabindex")).toBeNull()
  })
})

describe("backlinkEntryMarkup", () => {
  test("reports the whole entry, not the clicked label", () => {
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <span class="backlink-source">SS 11 Absatz 2</span>
      <span class="backlink-text">Der Bedarf ...</span></li></ul></details>`)
    const markup = backlinkEntryMarkup(sourceOf(scope, ".backlink-source"))
    expect(markup).toContain("backlink-entry")
    expect(markup).toContain("backlink-text")
  })

  test("a long entry is cut rather than filling the log", () => {
    const filler = "x".repeat(3000)
    const scope = render(`<details class="backlink-inline"><ul><li class="backlink-entry">
      <span class="backlink-source">SS 11</span><span class="backlink-text">${filler}</span></li></ul></details>`)
    const markup = backlinkEntryMarkup(sourceOf(scope, ".backlink-source"))
    expect(markup.length).toBeLessThan(1300)
    expect(markup.endsWith(" ...")).toBe(true)
  })
})

// The citation the /rules/parse path emits for the same statute: no attributes,
// an absolute href against the service's public host. Verified against a live
// service on 2026-08-24.
describe("routeFromLawHref", () => {
  test("an absolute citation resolves to the same address as a relative one", () => {
    const route = routeFromLawHref("https://semalogic.de/law/DE.GESETZ.SGB_8.P13", "SS 13 SGB 8")
    expect(route?.lawAddress).toBe("DE.GESETZ.SGB_8.P13")
    expect(route?.targetId).toBe("DE.GESETZ.SGB_8.P13")
    expect(route?.resolverUrl).toBe("https://semalogic.de/law/DE.GESETZ.SGB_8.P13")
  })

  // The public host must not turn into the GII fallback: that is what sent the
  // reader out of Obsidian while the statute was in the catalog all along.
  test("the public resolver is not mistaken for a public page", () => {
    const route = routeFromLawHref("https://semalogic.de/law/DE.GESETZ.SGB_8.P13", "SS 13")
    expect(route?.giiUrl).toBe("")
    expect(route?.catalogUrl).toBe("")
  })

  test("a genuinely public page stays the public fallback", () => {
    const route = routeFromLawHref("https://www.gesetze-im-internet.de/sgb_8/__13.html", "SS 13")
    expect(route?.giiUrl).toBe("https://www.gesetze-im-internet.de/sgb_8/__13.html")
    expect(route?.lawAddress).toBe("")
  })

  test("an unresolved citation has no href and no route", () => {
    expect(routeFromLawHref("", "SS 11")).toBeUndefined()
  })
})
