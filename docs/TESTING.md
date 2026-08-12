# Testing

## Fast local checks

Run the existing unit tests with:

```powershell
npm test
```

Run the plugin build and copy it to the configured test vault with:

```powershell
.\Build_obsidian.ps1
```

## Obsidian CLI test setup

The CLI tests require Obsidian Desktop 1.12.7 or later, the current Obsidian
installer, and a running Obsidian application. In Obsidian open **Settings >
General**, enable **Command line interface**, complete the registration prompt,
then restart the terminal. Verify the installation with:

```powershell
obsidian version
```

Create a dedicated vault for automation. Its absolute path must have a folder
name containing `test`; never point the test configuration at a personal or
production vault.

Copy the local configuration template and set the test-vault path:

```powershell
Copy-Item tests\obsidian\.env.example tests\obsidian\.env
```

Set `SL_TEST_VAULT` in that file. It is ignored by Git. Install the plugin in
this vault once by running `Build_obsidian.ps1`; its target is currently the
repository's established test vault. If a different vault is configured, copy
`main.js`, `manifest.json`, and `styles.css` into
`.obsidian\plugins\semalogic` in that vault before running the preflight.

Validate the setup without changing the vault or contacting a service:

```powershell
npm run test:obsidian:preflight
```

The preflight validates the CLI, its version command, the test-vault path, the
installed plugin, and that a configured service URL is loopback-only. It does
not start Obsidian or the SemaLogic server.

The smoke runner then runs Jest, builds the plugin, copies the build only to
the configured test vault, and reloads the running Obsidian instance:

```powershell
npm.cmd run test:obsidian:smoke
```

Use `-NoBuild` only while investigating an already copied build:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test-obsidian.ps1 -Mode smoke -NoBuild
```

Each run writes `report.json` below `tests/obsidian/artifacts/`; this folder is
ignored by Git. Before copying or running a command, the runner checks that the
currently active Obsidian vault is exactly `SL_TEST_VAULT`. It then verifies the
fixture commands, opens the generated Canvas, checks its DOM marker, and fails
on captured JavaScript errors. Failed assertions retain DOM, console, error,
and screenshot artifacts.

## Stable DOM test contract

CLI tests must use the following stable selectors rather than CSS layout
classes or Obsidian-internal element order:

| Selector | Meaning |
| --- | --- |
| `[data-sl-test="semalogic-view"]` | SemaLogic result view root |
| `[data-sl-test="result"]` | Extracted and rendered service payload |
| `[data-sl-test="diagnostics"]` | Diagnostics panel, including a clean summary |
| `[data-sl-test="error"]` | Request error area |
| `[data-sl-test="canvas"]` | An opened Canvas managed by the plugin |
| `[data-sl-test="canvas-info-button"]` | The `ⓘ` Canvas menu button |
| `[data-sl-test="canvas-tooltip"]` | Open Canvas tooltip |
| `[data-sl-test-tooltip-bound="1"]` | Canvas node with the hover handler attached |

The two fixture commands log their completed path with `slconsolelog` and show
a Notice. This lets a CLI test wait for a positive completion signal instead of
using a fixed delay.

Obsidian namespaces plugin command IDs. The CLI therefore executes the Canvas
fixtures as `semalogic:sl_create_test_canvas` and
`semalogic:sl_create_template_canvas`, even though the plugin registers their
short IDs without that prefix.

The interaction, request, navigation, regression, and implementation matrix is
maintained in [OBSIDIAN_CLI_TEST_CASES.md](OBSIDIAN_CLI_TEST_CASES.md).

## SemaLogicView Golden workflow

The integration runner creates `TestCases/SemaLogicView/basic-semalogic.md` in
the test vault. Before the SemaLogicView suite it closes the test workspace's
open Markdown, Canvas, SemaLogic, and Transfer tabs (sidebars remain intact),
then opens the fixture in the left Markdown pane. It opens the SemaLogicView in
the right split pane, verifies that layout, and first requests the fixture's
SemaLogic result through the actual dropdown. Only afterwards does it select
SVG and toggle source/rendered mode. Canvas fixtures are created by the smoke
test but intentionally remain closed; Canvas interaction has its own dedicated
suite. After the result/Golden check, the SemaLogicView and the Markdown
fixture are closed again. Every subsequent test begins with the same empty
document-workspace state.

On the first successful run it pauses while the SemaLogicView remains open.
Review the visible result and answer `y` only if it is the approved Golden.
The accepted result is stored in
`tests/obsidian/golden/semalogic-view-basic.json`; later runs compare the
rendered text against it and retain the actual result as an artifact on a
difference.

The Source/Rendered control is exercised through the plugin command
`semalogic:sl_toggle_result_source`, which calls the same view method as the
visible button. This avoids relying on synthetic browser clicks, which Obsidian
does not consistently treat like a user gesture in CLI developer evaluation.

## SemaLogic service

Server-backed tests are a later, opt-in integration mode. Keep
`SL_SERVICE_URL` local (for example `http://127.0.0.1:28000`). The start and
stop commands are intentionally empty until the service repository provides
the supported local commands. No test may fall back to the public default
service.

The supported local service command is now configured in the template as
`go run server.go`, executed in the SemaLogic service repository. Its default
test URL is `http://127.0.0.1:28000`. The lifecycle adapter starts this command
only when no compatible service is already listening, waits for
`/api-version`, and enables `SEMALOGIC_TRACE` for request evidence.

Run the first service-backed AddOn interaction tests with:

```powershell
npm.cmd run test:obsidian:integration
```

The explicit variants are:

```powershell
# Keep an already running service alive after the test.
npm.cmd run test:obsidian:integration:keep-server

# Stop only the process tree the test runner started itself.
npm.cmd run test:obsidian:integration:stop-server
```

It assigns a fresh SID, configures a temporary local-only test profile,
reloads the plugin, uses the real output dropdown to issue SemaLogic and SVG
requests, verifies the rendered response, resets the SID, and restores the
prior test-vault settings file. The `stop-server` variant terminates only a
server process tree started by this test runner; it never stops an already
running manual server.

The planned work sequence and acceptance criteria are in
[WORKPACKAGE_OBSIDIAN_CLI_TESTS.md](WORKPACKAGE_OBSIDIAN_CLI_TESTS.md).

The Obsidian CLI command reference, including `reload`, `command`, DOM,
console, error, and screenshot developer commands, is the official
[Obsidian CLI documentation](https://obsidian.md/help/cli).
