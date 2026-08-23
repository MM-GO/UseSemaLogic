# WP23a in the Obsidian client - what was built

Implementation record for the frontend tasks of
[WP23a](WP23a-Load-a-Statute-in-the-Client.md), plus the raw-source action from
WP23 §3 (`WP23-Download-Raw-Markdown.md`, kept with the `Law` module). The
server side of both - WP23a S1 and WP23's download route - is not in this
repository.

## Reader-facing actions

| Action | Where | What it does |
| --- | --- | --- |
| *UseSemaLogic: Gesetz laden ...* | command palette, and a button in the law view | Opens the statute picker |
| *Transfer as Markdown to Clipboard* | law view, beside *Copy to Clipboard*; also a command | Deannotates the loaded document and puts the Markdown on the clipboard |
| *Original-Markdown herunterladen* | law view; shown only when the server advertises it | Opens the imported `raw.md` unchanged in its own tab |

The last two are **not** the same artifact. WP23a T6 is the reason both carry a
name that says which one it is, and neither ever stands in for the other when
that one fails.

## Routes and headers consumed

| Route / header | Used for |
| --- | --- |
| `GET /law/index` | the catalog, fetched on first use of the picker, revalidated with `If-None-Match` |
| `GET /law/doc/<lawId>?view=snapshot` | the statute fragment, WP20a T4's path verbatim |
| `POST /rules/parse?sid=lawview` | the Markdown round trip (`AnnotatedHTML`, `persistency:false`) |
| `GET /law/download/<docID>/raw.md` | the imported source |
| `X-SL-Law-Id`, `X-SL-Version` | the loaded view's identity - recorded, never parsed out of a URL |
| `X-SL-Raw-Download` | whether the raw-source action is offered at all |
| `ETag` / `If-None-Match` | index revalidation, and a `304` on re-opening a statute |

**Every one of these paths is resolved with `new URL(path, getHostPort(settings))`.**
A bare `/law/...` string handed to Obsidian is read as a vault path; that is the
single most likely way for this work to fail in Obsidian specifically.

## Where the code lives

| File | Contents |
| --- | --- |
| [src/law_index.ts](../src/law_index.ts) | index types, the search folding and scoring, `LawIndexStore`, `LawDocumentCache`. DOM free, and unit tested in [src/law_index.test.ts](../src/law_index.test.ts) |
| [src/law_picker.ts](../src/law_picker.ts) | the `SuggestModal` over ~6100 statutes |
| [src/law_fetch.ts](../src/law_fetch.ts) | streaming download with byte progress, and the `requestUrl` fallback |
| [src/law_progress.ts](../src/law_progress.ts) | the progress overlay for a statute download |
| [src/view_law_catalog.ts](../src/view_law_catalog.ts) | the law view: both Markdown actions and the picker button |
| [src/view_law_raw.ts](../src/view_law_raw.ts) | the raw-source view |
| [main.ts](../main.ts) | commands, index/document caching, opening a statute, error handling |

## Decisions worth knowing

**Matching.** Abbreviation ranks above alias, alias above title; inside each,
exact beats prefix beats contains. Umlauts fold to their transcription rather
than being stripped, so `bafoeg` finds `BAföG`, and a separator-free form is
matched as well, so `sgb5` finds `SGB 5`. There is no debounce: the index is
local and filtering finishes inside a frame.

**Progress.** `requestUrl` buffers the whole body and reports nothing while it
does, so byte progress uses the renderer's own `fetch` with a stream reader.
Obsidian's renderer is subject to CORS, so a server that does not answer the
preflight falls back to `requestUrl` and a busy state; the refusal is remembered
for the session so the preflight is not repeated per statute. Both paths show
the elapsed time, which is what proves the view is not frozen.

**Caching.** Two statutes at most (`LawDocumentCache`), because BGB's fragment
is 11.4 MB. The fetched HTML string is kept with the view: T5 posts exactly
those bytes back, never `container.innerHTML` - Obsidian's sanitizer may drop
attributes it does not recognise, and round-tripping the sanitized DOM would
deannotate a damaged document.

**Failures.**

| Case | Behaviour |
| --- | --- |
| `/law/index` answers `404` | one notice ("Dieser Server kennt noch keinen Gesetzes-Index"), the picker stays disabled for the session, no guessing of LawLinks |
| `/law/doc/<id>` answers `404` | the index is revalidated, the reader is told, and the picker re-opens |
| `304` | the cached copy is rendered - the normal case for a re-open |
| transport error | a notice naming the statute with a *Erneut versuchen* action; nothing is opened, so no view is left half-populated |
| the transfer replies `text/html` | the service took the forward direction: an error notice, and the clipboard is left untouched |

**Recents.** Stored as `lawRecents` in the plugin settings and shown on an empty
query, most recent first.

## Node ids are not durable - what this client does about it

The letter-list nesting fix moves node ids
(`DE.GESETZ.BGB.P543.A2.S1.LA` becomes `...A2.S1.N3.S1.LA`), and it has not
reached everything at once: `/law/doc/<id>` serves checked-in bundle bytes, so
the old flat structure stays there until the corpus is re-annotated and checked
in again, while `POST /rules/parse` already produces the new one.

- **Nothing persistent is keyed on a provision address.** The document cache and
  `lawRecents` use the canonical document id (`DE.GESETZ.BGB`) only.
- **No address is carried between the two sources.** The Markdown transfer posts
  the served bytes and takes only Markdown back.
- **`If-None-Match` is actually sent**, on the index and on every statute, so a
  re-check-in changes the ETag and the client reloads. That is the whole
  handling this change needs.
- **A view's saved `targetId` is a restore hint, not an address.** It is
  re-resolved against the freshly fetched document, and reported when it no
  longer resolves.
- **Duplicate ids are reported rather than silently mis-scrolled.** Bundles that
  predate the fix repeat the same letter address (BGB § 308 four times);
  `querySelector` would land on the first one in document order, so the view
  says how many occurrences there are and that it jumped to the first.

The raw-source file name comes from the download's `Content-Disposition`, with
the route's document segment as fallback - the client assumes no fixed stage
file name, because the bundle's stage files are now named per statute and are
resolved server side.

## Manual check against a local server

Follow WP23a's *Verification* list. In this client the checks map to:
the picker (`BGB`, `Grundgesetz`, nonsense), an empty query after some use,
opening BGB and following a citation inside it, re-opening it (`304`, immediate),
the Markdown transfer pasted into a note (`# ...`, `§ 1`, no `↩`, no `Verweise`,
no `<details`), and the same with the server stopped - a clear notice and an
untouched clipboard.
