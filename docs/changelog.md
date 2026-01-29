### Development

The PlugIn for SemaLogic is under development.

### 2.3.0 / 2026-01-29 - Canvas tooltips + SL-Interpreter UX

Enhancements:

* Canvas tooltips for linked node info files (TestCanvas helper + node info button)
* SL-Interpreter feedback shown via inline icon and tooltip, avoiding text mutation
* Markdown parsing throttled with change detection and on-focus refresh

Bugfixes:

* KnowledgeEdit / SL-Interpreter canvas updates no longer spam requests
* Canvas2SL errors now log request and response details for troubleshooting

### 2.2.0 / 2026-01-29 - Knowledge Canvas + UI stability

Enhancements:

* KnowledgeGraph output can be opened as an Obsidian Canvas (auto-creates/updates `SemaLogic/KnowledgeGraph.canvas`)
* Ribbon toggle for Knowledge view

Bugfixes:

* SemaLogic.View controls are no longer re-created on update (Dropdown stays open)
* Error output in SemaLogic.View is consolidated into a single refreshed error area

### 2.1.2 / 2024-05-09 - Qucik-Bugfix-release SemaLogic Output-Button

Bugfixes:

* SemaLogic.View: Switch between SemaLogic Outputs is not usable

### 2.1. / 2024-05-08 - Bugfix-release and enhancement for third party commands

Enhancement:

* call webservices via a direct SemaLogic-command line for transfer view
* integrate knowledge tree

Bugfixes:

* minor bugfixes in behaviour of transfer.view
* SID randomized

### 2.0. / 2023-12-05 - Initial release for public obsidian add-on

First initial release to add SemaLogic-service as a public add-on-version to obsidian

### 1.1. / 2023-07-07 - Using JSON-Output for third party services

Creating third party view with an example to hand over the json-output-format to an answer set programming-solver.

### 1.0. / 2023-02-25 - Initial release obsidian with SemaLogic

First possible interaction with internal SemaLogic-Service.
