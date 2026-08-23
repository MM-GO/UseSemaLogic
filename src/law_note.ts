// The statute as a note in the vault.
//
// A statute chosen from the picker opens as an ordinary Obsidian Markdown tab,
// which means it has to be a real file - there is no way to hand Obsidian an
// in-memory string and get a standard Markdown view. The note therefore *is*
// the cache: its frontmatter records where the bytes came from and which
// version they are, so re-opening the same statute can revalidate with
// If-None-Match and leave an unchanged note alone.

// Which of the two legitimate Markdown artifacts a note holds. WP23a T6: they
// are not the same file, and the note has to say which one it is.
export type LawNoteSource = "raw.md" | "deannotate"

export type LawNoteMeta = {
  lawId: string
  abbreviation: string
  title: string
  version: string
  source: LawNoteSource
  etag: string
  retrieved: string
}

export const LawNoteFolder = "SemaLogic/Gesetze"

const FrontmatterKeys = {
  lawId: "sl-law-id",
  abbreviation: "sl-law-abbreviation",
  title: "sl-law-title",
  version: "sl-law-version",
  source: "sl-law-source",
  etag: "sl-law-etag",
  retrieved: "sl-law-retrieved"
}

// Obsidian file names cannot carry these, and a statute abbreviation can
// ("SGB 5" is fine, "AO 1977" is fine, but some carry a slash).
const ForbiddenNameChars = /[\\/:*?"<>|#^[\]]/g

export function lawNoteFileName(abbreviation: string, lawId: string): string {
  const base = (abbreviation || lawId).replace(ForbiddenNameChars, "-").replace(/\s+/g, " ").trim()
  return `${base.length > 0 ? base : lawId}.md`
}

export function lawNotePath(abbreviation: string, lawId: string, folder: string = LawNoteFolder): string {
  return `${folder}/${lawNoteFileName(abbreviation, lawId)}`
}

// Double quoted throughout: an official title contains colons often enough, and
// an ETag is quoted by definition.
function yamlScalar(value: string): string {
  return `"${(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`
}

export function buildLawNote(markdown: string, meta: LawNoteMeta): string {
  const lines = [
    "---",
    `${FrontmatterKeys.lawId}: ${yamlScalar(meta.lawId)}`,
    `${FrontmatterKeys.abbreviation}: ${yamlScalar(meta.abbreviation)}`,
    `${FrontmatterKeys.title}: ${yamlScalar(meta.title)}`,
    `${FrontmatterKeys.version}: ${yamlScalar(meta.version)}`,
    `${FrontmatterKeys.source}: ${yamlScalar(meta.source)}`,
    `${FrontmatterKeys.etag}: ${yamlScalar(meta.etag)}`,
    `${FrontmatterKeys.retrieved}: ${yamlScalar(meta.retrieved)}`,
    "---",
    ""
  ]
  // The body goes in unchanged. A raw.md that carries frontmatter of its own
  // keeps it - it just reads as content below this block, because Obsidian
  // only treats the first block as frontmatter.
  return lines.join("\n") + markdown
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed.charAt(0) == "\"" && trimmed.charAt(trimmed.length - 1) == "\"") {
    return trimmed.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\")
  }
  return trimmed
}

// Reads back what buildLawNote wrote. Deliberately its own small parser rather
// than Obsidian's metadata cache: the cache is populated asynchronously and can
// still be empty for a file that was just written.
export function readLawNoteMeta(content: string): Partial<LawNoteMeta> | undefined {
  if (!content.startsWith("---")) { return undefined }
  const end = content.indexOf("\n---", 3)
  if (end < 0) { return undefined }
  const meta: Partial<LawNoteMeta> = {}
  content.slice(3, end).split("\n").forEach((line) => {
    const separator = line.indexOf(":")
    if (separator <= 0) { return }
    const key = line.slice(0, separator).trim()
    const value = unquote(line.slice(separator + 1))
    switch (key) {
      case FrontmatterKeys.lawId: meta.lawId = value; break
      case FrontmatterKeys.abbreviation: meta.abbreviation = value; break
      case FrontmatterKeys.title: meta.title = value; break
      case FrontmatterKeys.version: meta.version = value; break
      case FrontmatterKeys.source: meta.source = value == "raw.md" ? "raw.md" : "deannotate"; break
      case FrontmatterKeys.etag: meta.etag = value; break
      case FrontmatterKeys.retrieved: meta.retrieved = value; break
    }
  })
  return meta
}

// An existing note is only revalidated against the artifact it was written
// from. Switching source (the server started serving raw.md) has to re-fetch,
// because a 304 from the other route would say nothing about this note.
export function lawNoteRevalidationEtag(meta: Partial<LawNoteMeta> | undefined, source: LawNoteSource): string {
  if (meta == undefined || meta.source != source) { return "" }
  return meta.etag ?? ""
}
