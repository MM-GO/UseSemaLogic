# Changelog

## Development

The PlugIn for SemaLogic is under development.

Unreleased - loading a statute in the client ([WP23a](WP23a-Load-a-Statute-in-the-Client.md)):

* New ribbon icon *Gesetz laden ...* (beside the view toggles) and a command of the same name: a fuzzy picker over the whole statute catalog (`GET /law/index`), matching abbreviation, official title and every alias, with the abbreviation ranked highest
* An empty query lists the statutes last opened; they are kept in the plugin settings
* Statutes the installation knows but does not hold are marked *nicht vorhanden* and cannot be opened
* The chosen statute opens as an ordinary Markdown note under `SemaLogic/Gesetze/`, in a new tab of the main editor area - not in a plugin view. Preferred source is the imported `raw.md`; where the server does not hold it, the served document is fetched and deannotated
* The note's frontmatter records `sl-law-id`, version, source and ETag, so re-opening the same statute revalidates with `If-None-Match` and leaves an unchanged note untouched
* New *Transfer as Markdown to Clipboard* action in the law view: the loaded document is deannotated by `/rules/parse` (`AnnotatedHTML`, `persistency:false`) and the Markdown goes to the clipboard, with a notice naming the statute and its size
* New *Original-Markdown herunterladen* action in the law view, shown only where the server advertises the raw source (`X-SL-Raw-Download`): opens the imported `raw.md` unchanged in its own tab. It is a different artifact from the Markdown transfer and is labelled as such
* New commands *UseSemaLogic: Gesetzes-Index pruefen* and *erstes Gesetz aus dem Index laden (Test)* for diagnosing an empty picker
* Law leaves are looked up with `instanceof` instead of `getViewType()`: Obsidian restores workspace leaves deferred, and the placeholder carries none of the view's methods

Unreleased - SemaLogic Service API 00.03.00:

* Every `/rules/parse` reply is read as the new `rulesout` envelope; markup, SVG and Canvas are extracted from `rules` instead of the raw body ([FRONTEND_MIGRATION_00_03_00.md](FRONTEND_MIGRATION_00_03_00.md))
* Server findings are shown in the SemaLogic view: severity, subject symbol and grouped repetitions
* Defects, warnings and notes each sit in their own collapsed section; `Defects`, `Warnings` and `Developer` buttons in the control row hide and show them, and the last state is kept in the settings (*Show defects* / *Show warnings* / *Show developer findings*)
* `Developer` switches the request to `audience=developer` and names the number of withheld messages, e.g. `Developer (2)`
* Error replies use the same envelope, so failures report the diagnostic message instead of a bare HTTP status
* `SemanticTree` output (`fragment: false`) is rendered inline as HTML like every other output format instead of in a scrolling frame; the document's own style rules come along, scoped to the result element
* New `AnnotatedHTML` output format (the service still echoes the submitted text; flagged in the view)
* Canonical endpoints `/api-version` and `/session/progress` and the lowercase `nlp` parameter; requires service API 00.03.00 or higher

## 2.4.0 / 2026-07-31 - Dialect engine + law annotations

Enhancements:

* Dialect_Gen: new dialect engine run with server progress (`/rules/progress`): phase, elapsed time and item progress in the SemaLogic view
* SL-Interpreter uses the same server progress display instead of the spinner overlay
* Styling for SemaLogic law annotations (sections, profiles, `:target` highlighting) directly in `styles.css`
* Law links can be followed in Live Preview
* `- [?]` tasks are rendered as a question icon instead of a done item

## 2.3.4 / 2026-07-07 - SL-Interpret OpenAPI update

Enhancements:

* SL-Interpret now sends the marked editor text in the `interprete` request parameter
* SL-Interpret now sends the full active editor content as contextual `text`

## 2.3.0 / 2026-01-29 - Canvas tooltips + SL-Interpreter UX

Enhancements:

* Canvas tooltips for linked node info files (TestCanvas helper + node info button)
* SL-Interpreter feedback shown via inline icon and tooltip, avoiding text mutation
* Markdown parsing throttled with change detection and on-focus refresh

Bugfixes:

* KnowledgeEdit / SL-Interpreter canvas updates no longer spam requests
* Canvas2SL errors now log request and response details for troubleshooting

## 2.2.0 / 2026-01-29 - Knowledge Canvas + UI stability

Enhancements:

* KnowledgeGraph output can be opened as an Obsidian Canvas (auto-creates/updates `SemaLogic/KnowledgeGraph.canvas`)
* Ribbon toggle for Knowledge view

Bugfixes:

* SemaLogic.View controls are no longer re-created on update (Dropdown stays open)
* Error output in SemaLogic.View is consolidated into a single refreshed error area

## 2.1.2 / 2024-05-09 - Qucik-Bugfix-release SemaLogic Output-Button

Bugfixes:

* SemaLogic.View: Switch between SemaLogic Outputs is not usable

## 2.1. / 2024-05-08 - Bugfix-release and enhancement for third party commands

Enhancement:

* call webservices via a direct SemaLogic-command line for transfer view
* integrate knowledge tree

Bugfixes:

* minor bugfixes in behaviour of transfer.view
* SID randomized

## 2.0. / 2023-12-05 - Initial release for public obsidian add-on

First initial release to add SemaLogic-service as a public add-on-version to obsidian

## 1.1. / 2023-07-07 - Using JSON-Output for third party services

Creating third party view with an example to hand over the json-output-format to an answer set programming-solver.

## 1.0. / 2023-02-25 - Initial release obsidian with SemaLogic

First possible interaction with internal SemaLogic-Service.
