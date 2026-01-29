# AGENTS.md

This file records the coding standards and workflow conventions for this
Obsidian TypeScript plugin so future changes stay consistent.

## Obsidian Plugin Conventions

- Use Obsidian APIs (`Vault`, `TFile`, `MarkdownRenderer`) first; only fall back
  to adapter reads when `vault.getAbstractFileByPath` fails.
- Canvas JSON: accept `{ nodes, edges }` plus optional `files` array.
  - `files` entries must be created under `.SemaLogic/nodeinfos/` (or configured folder).
  - Custom fields live under `node.meta`.
  - Support both `meta.SL_LinkedFile` and `meta.SL_DataFile` and their node-level fallbacks.
- Tooltips:
  - Hover tooltips should be bound via a `MutationObserver` to cope with Canvas DOM rebuilds.
  - The `ⓘ` button in the Canvas node menu should open a tooltip and toggle close on second click.
  - Tooltip must close on outside click, ESC, or scroll.
- SL-Interpreter / KnowledgeEdit:
  - Avoid mutating the original text for display. Prefer inline icon + tooltip for results.
  - Use SL64 encoding in inline annotations to avoid Obsidian parsing issues.

## Logging Strategy

- Use `slconsolelog` exclusively (no raw `console.log`).
- Default new diagnostic logs to `DebugLevel_Informative`.
- Error paths must log at `DebugLevel_Error` with request + response details.
- Avoid log spam in tight loops; add debouncing or only log on state changes.

## Build & Test Workflow

- After code changes, run `.\Build_obsidian.ps1` to rebuild and copy the plugin.
- Prefer feature toggles and test data helpers (e.g., `createTestCanvas`) to validate UI behavior.
- When testing tooltips, verify:
  - `SL_DataFile` is preferred for the `ⓘ` button.
  - `SL_LinkedFile` remains used for hover tooltips.

## TypeScript / Code Style

- Keep new code in English. Prefer clear names over abbreviations.
- Use ASCII unless the file already uses Unicode (exception: the `ⓘ` icon).
- Prefer small helper functions and shared utilities over duplicated logic.

## Safety & UX

- Never block or spam requests; throttle updates and only re-request on actual changes.
- UI should degrade gracefully (fallback to node text if linked file is missing).
