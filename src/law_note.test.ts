import {
  LawNoteMeta, buildLawNote, lawNoteFileName, lawNotePath,
  lawNoteRevalidationEtag, readLawNoteMeta
} from "./law_note"

const meta: LawNoteMeta = {
  lawId: "DE.GESETZ.BGB",
  abbreviation: "BGB",
  title: "Bürgerliches Gesetzbuch",
  version: "5",
  source: "raw.md",
  etag: "\"0158acddc527b3af\"",
  retrieved: "2026-08-23T09:00:00.000Z"
}

describe("lawNoteFileName", () => {
  test("keeps a readable abbreviation", () => {
    expect(lawNoteFileName("BGB", "DE.GESETZ.BGB")).toBe("BGB.md")
    expect(lawNoteFileName("SGB 5", "DE.GESETZ.SGB_5")).toBe("SGB 5.md")
  })

  test("replaces characters a vault path cannot carry", () => {
    expect(lawNoteFileName("AO/1977", "DE.X")).toBe("AO-1977.md")
    expect(lawNoteFileName("A:B*C?", "DE.X")).toBe("A-B-C-.md")
  })

  test("falls back to the document id", () => {
    expect(lawNoteFileName("", "DE.GESETZ.BGB")).toBe("DE.GESETZ.BGB.md")
    expect(lawNotePath("", "DE.GESETZ.BGB")).toBe("SemaLogic/Gesetze/DE.GESETZ.BGB.md")
  })
})

describe("buildLawNote / readLawNoteMeta", () => {
  test("the body goes in unchanged below the frontmatter", () => {
    const note = buildLawNote("# Bürgerliches Gesetzbuch\n\n§ 1 …", meta)
    expect(note.endsWith("# Bürgerliches Gesetzbuch\n\n§ 1 …")).toBe(true)
    expect(note.startsWith("---\n")).toBe(true)
  })

  test("round trips every field, including a quoted ETag and a title with a colon", () => {
    const tricky: LawNoteMeta = { ...meta, title: "Gesetz: über \"Anführungszeichen\" und \\ Rückstriche" }
    const parsed = readLawNoteMeta(buildLawNote("body", tricky))
    expect(parsed?.lawId).toBe(tricky.lawId)
    expect(parsed?.title).toBe(tricky.title)
    expect(parsed?.etag).toBe(tricky.etag)
    expect(parsed?.version).toBe("5")
    expect(parsed?.source).toBe("raw.md")
  })

  test("a raw.md that carries its own frontmatter keeps it as content", () => {
    const note = buildLawNote("---\nfremd: ja\n---\n\n# Titel", meta)
    // Only the first block is frontmatter, and it is ours.
    expect(readLawNoteMeta(note)?.lawId).toBe("DE.GESETZ.BGB")
    expect(note).toContain("fremd: ja")
  })

  test("a note without frontmatter reads as no metadata", () => {
    expect(readLawNoteMeta("# Just a note")).toBeUndefined()
  })
})

describe("lawNoteRevalidationEtag", () => {
  test("revalidates only against the artifact the note was written from", () => {
    const parsed = readLawNoteMeta(buildLawNote("body", meta))
    expect(lawNoteRevalidationEtag(parsed, "raw.md")).toBe(meta.etag)
    // The server started serving raw.md; a 304 from that route would say
    // nothing about a note built from the deannotate round trip.
    expect(lawNoteRevalidationEtag(parsed, "deannotate")).toBe("")
  })

  test("no note means no conditional request", () => {
    expect(lawNoteRevalidationEtag(undefined, "raw.md")).toBe("")
  })
})
