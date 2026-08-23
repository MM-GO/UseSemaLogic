# WP23a — Loading a statute, and taking it out as Markdown, in the Obsidian client

Change period: 2026-08-22 to ongoing

Companion to [WP23](WP23-Download-Raw-Markdown.md), which builds a download of a
statute's *imported source* on the server. This work package is the client half
of a different question a reader asks first: **which** statute, and **how do I
get what I am looking at out of the view**.

| Field | Value |
| --- | --- |
| Module | the Obsidian add-on (**not in this repository**), plus one small Law route (S1) |
| Depends on | WP07 N2 (the catalog the server already loads), WP20a T3/T4 (API-base resolution and fragment rendering — reuse them, do not rebuild them) |
| Changes the server? | **Only S1**, one read-only index route. Everything else in this package works against routes that exist today. |
| Primary outcome | A reader opens a command, types "BGB", presses Enter, and the Bürgerliches Gesetzbuch is in the Law view; a second command puts what is in that view on the clipboard as Markdown. |
| Does not change | The annotator, `linkview`, the SemaLogic OpenAPI contract, publication policy, or any existing `/law/` route's bytes. |

## Objective

Two reader-facing actions:

1. **Load a statute from a popup.** This installation publishes **6130 of the
   6131 statutes** the registry knows (measured on the running server,
   2026-08-22). A dropdown is not an option at that size; a fuzzy picker over
   abbreviation, title and alias is.
2. **Transfer the loaded statute as Markdown to the clipboard**, beside the
   existing *Copy to Clipboard*, using the same *Transfer as Markdown to
   Clipboard* wording the add-on already uses elsewhere.

Both are read-only. Neither writes to the repository, and neither needs a
session on the SemaLogic side.

## What the server delivers today — measured, not assumed

Everything in this section was exercised against a local server on
2026-08-22 with the current catalog. Numbers are from that run.

### Fetching one statute — exists, unchanged since WP20a

```text
GET /law/doc/<lawId>?view=snapshot
```

```text
Content-Type:  text/html; charset=utf-8
X-SL-Law-Id:   DE.GESETZ.BAFOEG
X-SL-Fragment: true
X-SL-Version:  5
ETag:          "0158acddc527b3af4d2d00f9176f3717"
```

An HTML **fragment** — a `<section class="law" id="DE.GESETZ.…">` and its
contents, decorated, carrying its `<details class="backlink-inline">` blocks as
content. This is exactly the payload [WP20a](WP20a-External-LawLinks-in-the-Client.md)
T4 already specifies for a followed citation. **The picker's "open" step is that
same path with a different starting point.** Reuse the code; do not write a
second renderer.

`?view=snapshot` is the right view here for the same reason WP20a gives: Obsidian
runs no `links.js`, so a backlink badge is an affordance that can never fire, and
the snapshot view is the one that ships the blocks as content instead. The two
other views are `?view=plain` (the stored bytes, undecorated) and the bare route
(decorated, no dated section).

Sizes to design for: BAföG is 1.02 MB, **BGB is 11.4 MB** and fetched in 1.0 s
over loopback. Send the `ETag` back as `If-None-Match` — WP20a T4 says why, and
it matters more here, because a picker invites repeated opening.

### Turning what is in the view back into Markdown — exists, needs no new route

The SemaLogic service's `AnnotatedHTML` rulesettype is **bidirectional**. Post
annotated HTML and it answers with Markdown; the direction is chosen from the
input, not from a flag (`rule.UserSession.AnnotatedHTML` → `hasAnnotateLevel`
→ `annotate.Deannotate`).

```http
POST /rules/parse?sid=<any>
Content-Type: application/json

{"text":[{"textID":"LawView","rules":"<the annotated HTML you hold>"}],
 "rulesettype":"AnnotatedHTML",
 "persistency":false}
```

The reply's `rules` payload is:

```json
{"mediaType":"text/markdown","fragment":false,"source":"annotate","html":"# Bundesgesetz über …"}
```

Measured on this server:

| Input | HTML in | Markdown out | Time | Backlink text leaked | Diagnostics |
| --- | --- | --- | --- | --- | --- |
| BAföG `?view=snapshot` | 1.02 MB | 134 KB | ~0.2 s | 0 | none |
| BGB `?view=snapshot` | 11.4 MB | 1.62 MB | 0.2 s | 0 | none |

Three facts worth relying on, each of them checked rather than inferred:

- **The backlink blocks do not survive into the Markdown.** Zero occurrences of
  `backlink` or `Verweise` in either output. This is by construction (WP07a
  B-D1: the blocks are invisible to `Deannotate`), and it is why the decorated
  fragment can be posted back as-is instead of re-fetching `?view=plain`.
- **It is fast at the worst case.** The largest statute in the corpus
  deannotates in 0.2 s. No progress UI is needed for this action.
- **`persistency:false` keeps it stateless.** Nothing is stored, the `sid` is
  irrelevant, and the Law view does not need a SemaLogic session.

### What is missing: there is no way to ask what statutes exist

The `/law/` surface is `/law/<LawLink>`, `/law/doc/<docID>`, `/law/status`,
`/law/backlinks`, `/law/checkin`. None of them answers *"what can I open?"*.
`/law/status` answers about addresses a caller already names, which is the
opposite of what a picker needs. That gap is S1.

## S1 — the one server addition (for the Law agent, not the frontend agent)

```text
GET  /law/index
HEAD /law/index
```

A read-only, deterministic, ETag'd projection of the catalog the server already
holds in memory (`catalog.Loaded`, `catalog.Statute`). It opens no file on the
request path and reads no bundle.

```json
{
  "schema": "law-index-v1",
  "generatedAt": "2026-08-21T15:36:00Z",
  "statutes": [
    ["DE.GESETZ.BGB", "BGB", "Bürgerliches Gesetzbuch", ["Bürgerliches Gesetzbuch"], true],
    ["DE.GESETZ.BAFOEG", "BAföG", "Bundesgesetz über individuelle Förderung der Ausbildung", ["Bundesausbildungsförderungsgesetz"], true]
  ]
}
```

Each row is `[lawId, abbreviation, title, aliases, held]`. Arrays rather than
objects because the key names would otherwise be repeated 6131 times; `held` is
`Statute.Bundle != ""` — whether this installation serves the document itself,
as opposed to merely knowing it from the registry.

Measured from the current catalog:

| Payload | JSON | gzipped |
| --- | --- | --- |
| id + abbreviation + title | 939 KB | 204 KB |
| the above + aliases (15 651 strings, 2.6 per statute) | 1.82 MB | 277 KB |

**Ship the aliases.** 277 KB gzipped, once per session, is the price of a search
that finds "Grundgesetz" when the reader types "GG" and finds "KOVAnpG 10" at
all. Both variants are small enough that no server-side `?q=` search is
warranted — and a local index is what makes the picker respond within a
keystroke, which is the whole user-facing goal.

Requirements:

- Deterministic order (sort by `lawId`) so the ETag is stable across restarts.
- ETag over the serialised body; honour `If-None-Match` with `304`.
- `Cache-Control: no-cache` — revalidate, but let the 304 do the work.
- Matched **before** the LawLink fallback, like every other named route, so
  `index` can never be read as an address.
- No pagination, no `?q=`, no filter parameters. One artifact, cached.

This is the only server work in WP23a. It is deliberately not folded into the
SemaLogic OpenAPI document, for the reason WP23 states at length: `/law/` is a
separately mounted surface and its routes are documented beside it.

## Frontend tasks

### T1 — Fetch and cache the index

On first use (not at plugin load — do not pay for a feature the reader has not
opened), `GET <apiBase>/law/index`, keep the parsed rows in memory for the
session, and keep the `ETag` so a later revalidation costs a `304`.

Resolve `/law/index` against the configured API base exactly as WP20a T3
requires. **A bare `/law/…` string handed to Obsidian is read as a vault path**
— that is the mistake this add-on has already made once, and the rule is
`new URL(path, apiBaseUrl)`.

If the route answers `404`, the server predates S1: show one clear notice
("Dieser Server kennt noch keinen Gesetzes-Index") and disable the command.
Do not fall back to guessing LawLinks.

### T2 — The picker

An Obsidian `SuggestModal`/`FuzzySuggestModal`, opened by a command
("Gesetz laden…") and by a button in the Law view. What makes it usable at 6130
entries:

- **Match against abbreviation, title and every alias**, and score the
  abbreviation highest. A reader types `BGB`, `SGB 5`, `GG` — the official short
  form is what they know.
- **Render abbreviation as the title line, official title as the subtitle.**
  `BGB` alone is unhelpful in a list; the full name alone is unreadable at that
  length.
- **Empty query shows recents**, most recent first, from plugin data. This is
  the single largest usability win: a reader works with the same handful of
  statutes for weeks.
- **Cap the rendered list** (~50). Filtering 6131 × ~4 strings per keystroke is
  well under a frame; rendering thousands of DOM nodes is not.
- **Mark a statute that is not held** (`held === false`) and disable opening it.
  One of the 6131 is in this state today; the count depends on the installation,
  and offering a row that cannot open is worse than not offering it.
- Do not debounce. The index is local; debouncing only adds lag.

### T3 — Open the chosen statute

Reuse WP20a T4's path verbatim:

```js
const url = new URL(`/law/doc/${encodeURIComponent(lawId)}?view=snapshot`, apiBaseUrl);
```

Fetch with `If-None-Match` when a copy is cached, insert the returned fragment
into the Law view, name the tab from the abbreviation (fall back to the title,
then the `lawId`), and bind the existing external-citation handler to the new
content so citations followed from within it keep working.

**Keep the fetched HTML string**, alongside whatever is rendered. T5 needs it.

Record `X-SL-Law-Id` and `X-SL-Version` with the view. They are the view's
identity, available without parsing 11 MB of body, and T5 reports them.

### T4 — Progress and failure

BGB is 11.4 MB. Show a determinate progress indication while fetching where the
`Content-Length` allows it, and a busy state otherwise; the reader must not see
a frozen modal. Failures:

| Case | Behaviour |
| --- | --- |
| `404` on `/law/doc/<id>` | The catalog and the repository disagree — a check-in can change what is held after the index was fetched. Revalidate the index, say the statute is not available on this server, and keep the picker open. |
| Network error / timeout | Report it naming the statute; offer a retry. Never leave the view half-populated. |
| `304` | Render the cached copy. This is the normal case for a re-open. |

### T5 — Transfer as Markdown to Clipboard

Add the action to the Law view beside *Copy to Clipboard*, with the same wording
the add-on uses elsewhere: **Transfer as Markdown to Clipboard**.

```js
const res = await fetch(new URL("/rules/parse?sid=lawview", apiBaseUrl), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: [{ textID: "LawView", rules: fetchedHtml }],   // T3's kept string
    rulesettype: "AnnotatedHTML",
    persistency: false,
  }),
});
const { rules } = await res.json();
await navigator.clipboard.writeText(rules.html);
```

**Post the string T3 kept, never `container.innerHTML`.** Obsidian's HTML
sanitizer may drop attributes it does not recognise — WP20a T1 exists solely
because of that hazard, and
[Readme_Annotation.md](../EPICS/Workflow/Readme_Annotation.md) records it for
`data-sl-text`. Round-tripping the sanitized DOM would deannotate a damaged
document and produce Markdown that is quietly missing structure. The bytes that
came off the wire are the ones that round-trip.

Check the reply before writing to the clipboard: `rules.mediaType` must be
`text/markdown`. If it is `text/html`, the service took the *forward* direction —
the input was not recognised as annotated — and the correct response is an error
notice, not putting HTML on the clipboard under a Markdown label.

Confirm with a notice naming the statute and the size ("BGB als Markdown
kopiert — 1,6 MB"). At these sizes a silent clipboard write leaves the reader
unsure whether anything happened.

The add-on's existing `execCommand` fallback (`.sl-clipboard-helper` in
[styles.css](styles.css)) stays the fallback where `navigator.clipboard` is
unavailable.

### T6 — Say which Markdown this is

There are **two** legitimate Markdown artifacts for one statute, and they are
not the same file:

| Action | Source | BAföG size | What it is |
| --- | --- | --- | --- |
| **Transfer as Markdown to Clipboard** (T5) | `Deannotate` of the loaded document | 137 766 B | The structural round trip of what is in the view |
| **Original-Markdown herunterladen** ([WP23](WP23-Download-Raw-Markdown.md) §3) | the bundle's `raw.md` stage | 140 923 B | The imported source, byte-for-byte as it arrived |

WP23 is explicit that the raw download must not be labelled as anything else,
and the reverse holds too. If both actions are offered in the same view, their
labels must say which is which. Do not let one silently stand in for the other
when the other fails.

WP23's action is out of scope here; this task is only the naming discipline that
keeps the two apart.

## Limits and pitfalls

- **The API base.** Every URL in this package is origin-relative and must be
  resolved against the configured base (WP20a T3). This is the single most
  likely way for this work to fail in Obsidian specifically.
- **Statute size.** BGB's fragment is 11.4 MB. Cache by `ETag`, do not hold more
  than a couple of documents in memory, and never keep both the fetched string
  and a second serialisation of the same document longer than the transfer takes.
- **`sid`.** `/rules/parse` requires one but nothing is stored at
  `persistency:false`. Use a constant; do not allocate a session per transfer.
- **Do not parse `href`.** WP20a T2's rule holds everywhere in this package: the
  `lawId` comes from the index row or from `X-SL-Law-Id`, never from a URL.
- **The index is a snapshot.** It reflects the catalog at the moment it was
  fetched. A check-in can publish or replace a document afterwards; T4's `404`
  path is the recovery, not a defensive formality.

## Verification

Server side (S1), from `Law/`:

```sh
go test ./serve
go test ./...
```

Client side, against a local server with the corpus checked in:

1. Open the picker, type `BGB` — the Bürgerliches Gesetzbuch is the first hit.
   Type `Grundgesetz` — GG is found by alias. Type nonsense — the list is empty
   and says so.
2. Open with an empty query after using the plugin — the recents are listed.
3. Open BGB; confirm the tab is named, the document renders, and a citation
   inside it still opens its target (WP20a's handler is bound to the new
   content).
4. Re-open the same statute; confirm the request answers `304` and the render is
   immediate.
5. Run *Transfer as Markdown to Clipboard*; paste into a note. Confirm the head
   (`# Bundesgesetz über …`), that `§ 1` is present, and that the text contains
   no `↩`, no `Verweise`, and no `<details`.
6. Do the same for BGB and confirm the transfer completes in well under a second
   and the notice names the size.
7. Stop the server, run the transfer, and confirm a clear error notice and an
   untouched clipboard.

## Out of scope

- Any change to the annotator, `linkview`, or how a citation is resolved.
- Loading a statute the installation does not hold, by fetching it from
  gesetze-im-internet.de or anywhere else on the request path.
- Editing, check-in, or any write path from the client.
- WP23's raw-source download action itself — only the labelling rule in T6.
- A server-side search API. If the index ever outgrows a client-side filter,
  that is its own decision with its own measurements; at 277 KB gzipped it has
  not.
- Paragraph-level navigation inside the loaded statute beyond the anchor
  scrolling WP20a T4 already specifies.
