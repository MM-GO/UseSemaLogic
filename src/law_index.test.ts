import {
  LawIndexRow, LawIndexStore, LawIndexUnavailableError,
  compactLawText, filterLawEntries, firstLawEntries, foldLawText, formatLawByteSize,
  lawDocumentRoute, lawIdForAddress, makeLawIndexEntry, orderLawRecents, parseLawIndex,
  readLawDocumentTitles, rememberLawRecent, utf8ByteLength
} from "./law_index"

const rows: LawIndexRow[] = [
  ["DE.GESETZ.BGB", "BGB", "Bürgerliches Gesetzbuch", ["Bürgerliches Gesetzbuch"], true],
  ["DE.GESETZ.BGBEG", "BGBEG", "Einführungsgesetz zum Bürgerlichen Gesetzbuche", [], true],
  ["DE.GESETZ.GG", "GG", "Grundgesetz für die Bundesrepublik Deutschland", ["Grundgesetz"], true],
  ["DE.GESETZ.BAFOEG", "BAföG", "Bundesgesetz über individuelle Förderung der Ausbildung", ["Bundesausbildungsförderungsgesetz"], true],
  ["DE.GESETZ.SGB_5", "SGB 5", "Fünftes Buch Sozialgesetzbuch", [], true],
  ["DE.GESETZ.NICHTDA", "NichtDa", "Nicht vorgehaltenes Gesetz", [], false]
]

function entries() {
  return rows.map((row) => makeLawIndexEntry(row)!)
}

function ids(query: string): string[] {
  return filterLawEntries(entries(), query).map((entry) => entry.lawId)
}

describe("foldLawText / compactLawText", () => {
  test("folds umlauts to their transcription instead of dropping the diacritic", () => {
    expect(foldLawText("BAföG")).toBe("bafoeg")
    expect(foldLawText("über")).toBe("ueber")
    expect(foldLawText("Maß")).toBe("mass")
  })

  test("folds a decomposed umlaut the same way as a precomposed one", () => {
    // o + combining diaeresis must not lose the diacritic and fold to "bafog".
    expect(foldLawText("BAfo\u0308G")).toBe("bafoeg")
  })

  test("compact drops separators so sgb5 and SGB 5 meet", () => {
    expect(compactLawText("SGB 5")).toBe("sgb5")
    expect(compactLawText(" sgb-5 ")).toBe("sgb5")
  })
})

describe("filterLawEntries", () => {
  test("an exact abbreviation is the first hit", () => {
    expect(ids("BGB")[0]).toBe("DE.GESETZ.BGB")
  })

  test("the abbreviation outranks a title that merely contains the query", () => {
    const hits = ids("BGB")
    expect(hits.indexOf("DE.GESETZ.BGB")).toBeLessThan(hits.indexOf("DE.GESETZ.BGBEG"))
  })

  test("an alias finds the statute", () => {
    expect(ids("Grundgesetz")).toContain("DE.GESETZ.GG")
  })

  test("the transcribed spelling finds the umlaut spelling", () => {
    expect(ids("bafoeg")[0]).toBe("DE.GESETZ.BAFOEG")
  })

  test("a query without the separator finds the spaced abbreviation", () => {
    expect(ids("sgb5")[0]).toBe("DE.GESETZ.SGB_5")
    expect(ids("SGB 5")[0]).toBe("DE.GESETZ.SGB_5")
  })

  test("nonsense matches nothing", () => {
    expect(ids("qqzzxx")).toHaveLength(0)
  })

  test("an empty query matches nothing - the picker shows recents instead", () => {
    expect(ids("   ")).toHaveLength(0)
  })

  test("the rendered list is capped", () => {
    const many = Array.from({ length: 300 }, (_unused, i): LawIndexRow =>
      [`DE.GESETZ.X${i}`, `X${i}`, `Gesetz ${i}`, [], true])
    const capped = filterLawEntries(many.map((row) => makeLawIndexEntry(row)!), "x", 50)
    expect(capped).toHaveLength(50)
  })

  test("an unheld statute is still found, so the picker can say why it cannot open", () => {
    const hit = filterLawEntries(entries(), "NichtDa")[0]
    expect(hit.lawId).toBe("DE.GESETZ.NICHTDA")
    expect(hit.held).toBe(false)
  })
})

describe("recents", () => {
  test("keeps the given order and drops ids the catalog no longer knows", () => {
    const recents = orderLawRecents(entries(), ["DE.GESETZ.GG", "DE.GESETZ.WEG", "DE.GESETZ.BGB"])
    expect(recents.map((entry) => entry.lawId)).toEqual(["DE.GESETZ.GG", "DE.GESETZ.BGB"])
  })

  test("re-opening a statute moves it to the front without duplicating it", () => {
    expect(rememberLawRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"])
    expect(rememberLawRecent(["a", "b"], "z")).toEqual(["z", "a", "b"])
  })

  test("the list is capped", () => {
    const long = Array.from({ length: 20 }, (_unused, i) => `id${i}`)
    expect(rememberLawRecent(long, "new", 5)).toHaveLength(5)
  })
})

describe("firstLawEntries", () => {
  test("is the catalog head by abbreviation, so an empty query is never an empty list", () => {
    const head = firstLawEntries(entries(), 3)
    expect(head.map((entry) => entry.abbreviation)).toEqual(["BAföG", "BGB", "BGBEG"])
  })
})

describe("parseLawIndex", () => {
  test("reads the law-index-v1 projection", () => {
    const parsed = parseLawIndex(JSON.stringify({ schema: "law-index-v1", statutes: rows }))
    expect(parsed).toHaveLength(rows.length)
    expect(parsed[0].abbreviation).toBe("BGB")
    expect(parsed[5].held).toBe(false)
  })

  test("a row without the held flag counts as held", () => {
    const parsed = parseLawIndex(JSON.stringify({ schema: "law-index-v1", statutes: [["DE.X", "X", "Gesetz X"]] }))
    expect(parsed[0].held).toBe(true)
  })

  test("rejects a foreign schema rather than guessing", () => {
    expect(() => parseLawIndex(JSON.stringify({ schema: "law-index-v2", statutes: [] }))).toThrow(/schema/)
  })

  test("reads the object row form as well as the specified array form", () => {
    const parsed = parseLawIndex(JSON.stringify({
      schema: "law-index-v1",
      statutes: [{ lawId: "DE.GESETZ.BGB", abbreviation: "BGB", title: "Bürgerliches Gesetzbuch", aliases: [], held: true }]
    }))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].abbreviation).toBe("BGB")
  })

  test("rows that no reader understands are reported, not silently dropped", () => {
    expect(() => parseLawIndex(JSON.stringify({
      schema: "law-index-v1",
      statutes: [{ kennung: "DE.GESETZ.BGB", kurz: "BGB" }]
    }))).toThrow(/none of the 1 law index rows could be read/)
  })

  test("a genuinely empty catalog is not an error", () => {
    expect(parseLawIndex(JSON.stringify({ schema: "law-index-v1", statutes: [] }))).toHaveLength(0)
  })

  test("rejects a body that is not the index", () => {
    expect(() => parseLawIndex("<html>not json</html>")).toThrow()
    expect(() => parseLawIndex(JSON.stringify({ schema: "law-index-v1" }))).toThrow(/statutes/)
  })
})

describe("LawIndexStore", () => {
  const body = JSON.stringify({ schema: "law-index-v1", statutes: rows })

  test("fetches once and serves the session copy afterwards", async () => {
    let calls = 0
    const store = new LawIndexStore(async () => {
      calls++
      return { status: 200, text: body, etag: '"abc"' }
    })
    await store.load()
    await store.load()
    expect(calls).toBe(1)
    expect(store.getEntries()).toHaveLength(rows.length)
  })

  test("revalidates with the ETag and keeps the copy on 304", async () => {
    const seen: string[] = []
    const store = new LawIndexStore(async (etag) => {
      seen.push(etag)
      return seen.length == 1
        ? { status: 200, text: body, etag: '"abc"' }
        : { status: 304, text: "", etag: '"abc"' }
    })
    await store.load()
    const revalidated = await store.load(true)
    expect(seen).toEqual(["", '"abc"'])
    expect(revalidated).toHaveLength(rows.length)
  })

  test("404 means the server predates the index route", async () => {
    const store = new LawIndexStore(async () => ({ status: 404, text: "", etag: "" }))
    await expect(store.load()).rejects.toBeInstanceOf(LawIndexUnavailableError)
  })

  test("a non-2xx status is reported rather than parsed", async () => {
    const store = new LawIndexStore(async () => ({ status: 500, text: "boom", etag: "" }))
    await expect(store.load()).rejects.toThrow(/HTTP 500/)
  })
})

describe("sizes", () => {
  test("counts UTF-8 bytes, not characters", () => {
    expect(utf8ByteLength("abc")).toBe(3)
    expect(utf8ByteLength("ä")).toBe(2)
    expect(utf8ByteLength("€")).toBe(3)
    expect(utf8ByteLength("😀")).toBe(4)
  })

  test("formats with a German decimal comma", () => {
    expect(formatLawByteSize(512)).toBe("512 B")
    expect(formatLawByteSize(140923)).toBe("137,6 KB")
    expect(formatLawByteSize(11.4 * 1024 * 1024)).toBe("11,4 MB")
  })
})

describe("lawIdForAddress", () => {
  // The catalog of this installation, in the shapes that make the decision hard.
  const known = [
    "DE.GESETZ.BAFOEG", "DE.GESETZ.AFBG", "DE.GESETZ.2_HSTRUKTG",
    "DE.GESETZ.SGB_8", "DE.GESETZ.SGB_10", "DE.GESETZ.SGB_10_KAP1_2",
    "DE.GESETZ.FREIZUEGG_EU"
  ]

  test("splits an address at the statute it belongs to", () => {
    expect(lawIdForAddress("DE.GESETZ.AFBG.P10.A2.S2", known)).toBe("DE.GESETZ.AFBG")
    expect(lawIdForAddress("DE.GESETZ.2_HSTRUKTG.P8.A4.S1", known)).toBe("DE.GESETZ.2_HSTRUKTG")
    expect(lawIdForAddress("DE.GESETZ.FREIZUEGG_EU.P1.A2.N3", known)).toBe("DE.GESETZ.FREIZUEGG_EU")
  })

  // Counting dots would answer "DE.GESETZ.SGB_10" for both of these.
  test("the longest known statute wins, not the shortest prefix", () => {
    expect(lawIdForAddress("DE.GESETZ.SGB_10_KAP1_2.P1", known)).toBe("DE.GESETZ.SGB_10_KAP1_2")
    expect(lawIdForAddress("DE.GESETZ.SGB_10.P1", known)).toBe("DE.GESETZ.SGB_10")
  })

  test("an address that is a statute itself is that statute", () => {
    expect(lawIdForAddress("DE.GESETZ.SGB_8", known)).toBe("DE.GESETZ.SGB_8")
  })

  test("a statute the catalog does not know is not invented", () => {
    expect(lawIdForAddress("DE.GESETZ.NOTHELD.P1", known)).toBe("")
    expect(lawIdForAddress("", known)).toBe("")
  })
})

describe("lawDocumentRoute", () => {
  test("one spelling for every caller", () => {
    expect(lawDocumentRoute("DE.GESETZ.SGB_8")).toBe("/law/doc/DE.GESETZ.SGB_8?view=snapshot")
  })
})

describe("readLawDocumentTitles", () => {
  // SGB 8 as the live service serves it: the short title is its promulgation
  // note, and only data-sl-lawlink-source is the designation a tab can carry.
  test("the citation designation beats the short title", () => {
    const fragment = `<section class="law" data-sl-lawlink-source="SGB 8"`
      + ` data-sl-shorttitle="Artikel 1 des Gesetzes v. 26. Juni 1990, BGBl. I S. 1163"`
      + ` data-sl-title="Sozialgesetzbuch (SGB) - Achtes Buch (VIII) -" id="DE.GESETZ.SGB_8">`
    expect(readLawDocumentTitles(fragment).shortTitle).toBe("SGB 8")
    expect(readLawDocumentTitles(fragment).title).toBe("Sozialgesetzbuch (SGB) - Achtes Buch (VIII) -")
  })

  test("a nested element does not name the document", () => {
    const fragment = `<section class="law" data-sl-lawlink-source="BAfoeG" data-sl-title="Bundesgesetz">`
      + `<section class="section" data-sl-lawlink-source="Anlage" data-sl-title="Anlage 1">`
    expect(readLawDocumentTitles(fragment)).toEqual({ shortTitle: "BAfoeG", title: "Bundesgesetz" })
  })

  test("reads the names the document gives itself", () => {
    const fragment = `<section class="law" data-sl-shorttitle="AFBG"`
      + ` data-sl-title="Gesetz zur Foerderung der beruflichen Aufstiegsfortbildung"`
      + ` id="DE.GESETZ.AFBG"><h1>AFBG</h1></section>`
    expect(readLawDocumentTitles(fragment)).toEqual({
      shortTitle: "AFBG",
      title: "Gesetz zur Foerderung der beruflichen Aufstiegsfortbildung"
    })
  })

  test("entities in an attribute are text again", () => {
    expect(readLawDocumentTitles(`<section class="law" data-sl-title="Recht &amp; Ordnung">`).title)
      .toBe("Recht & Ordnung")
  })

  test("a document that names itself nowhere reports nothing", () => {
    expect(readLawDocumentTitles(`<section class="law"><h1>x</h1></section>`))
      .toEqual({ shortTitle: "", title: "" })
  })
})
