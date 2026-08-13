# Obsidian SemaLogic PlugIn

It is possible to use SemaLogic (<https://semalogic.de>) in Obsidian (<https://obsidian.md>).

SemaLogic is a symbolic AI, that can be adapted to natural language in order to represent logical relationships unambiguously in a coherent language that is both computer and user understandable. The three forms of SemaLogic (natural language, technical language and practical representation) can be converted into each other at any time without loss of logical relationships in the understanding of the respective user.

**Note:** The SemaLogic-Obsidian API is still in early alpha and is subject to change at any time!

Currently the plugin is in development status and for testing SemaLogic to show technical language, graphical pictures in realtime and e.g. part of the SVGs in pdf directly.

## Releases and publish status

Current version: **2.4.0** (see [docs/changelog.md](docs/changelog.md) for the change history).

A release is published by pushing a Git tag (`npm run release <version>`, details in
[Readme_Publish_obsidian.md](Readme_Publish_obsidian.md)). Where to check the state of a publish:

| Stage | Where to look |
| --- | --- |
| CI build + GitHub release (queued / running / success) | <https://github.com/MM-GO/UseSemaLogic/actions> — or `gh run list` |
| Published release with `main.js`, `manifest.json`, `styles.css` | <https://github.com/MM-GO/UseSemaLogic/releases> |
| Update visible to users | Obsidian → Settings → Community plugins → *Check for updates* |
| Catalogue entry | <https://obsidian.md/plugins?search=SemaLogic> (list data is refreshed periodically, so it may lag) |

There is **no review queue for updates**: the plugin is already listed, so Obsidian reads each new
version straight from the GitHub release. A review queue only applies to the *initial* listing of a
plugin, via a pull request against <https://github.com/obsidianmd/obsidian-releases> — that step was
completed with version 2.0 and is not needed again.

## First use cases for pdf-display

First SemaLogic Commands which are available are

1. Show technical language in seperate view (through a dice on left side controls)
2. Preview-HTML-Commands by using "SemaLogic()" e.g.

- Show Help
- Show Version
- Set Dialect with template

3. Hand over the results of SemaLogic to an asp-specified-SemaLogic-service for solving (special opportunity for developer friend)

## How to use

After installation there shoud be a first profile for connecting the SemaLogic service in the web on service.semalogic.ddns.net with default settings. Later it could be possible that there is a SemaLogic-Service running on localhost or private network, so there are more than one profile settings.

We are building an overview documentation to use the SemaLogic formal and technical language. Then it will be linked here, published on SemaLogic.de and then you are able to create to own SemaLogic realtime notes.

To test using SemaLogic - open a new notes and write following :

Note 1 - Example technical language:

OR-Rule 1|2 { Choice A, Choice B}
Choice A [AND-Rule D,E]
AND-Rule D[Choice A,F]

and see what happens in the SemaLogicView

## Local Obsidian integration tests

The plugin contains a local Obsidian CLI integration suite. It requires a
dedicated test vault, a running Obsidian desktop application with its CLI
enabled, Node.js 18 or newer, and a local SemaLogic service at
`http://127.0.0.1:28000`. The runner is implemented in Node.js and works on
Windows, Linux, and macOS; PowerShell is not required.

Start the SemaLogic service manually from its repository when desired:

```powershell
cd D:\Neuorga\Programmierung\SL_mit_knowledge\VibeCodings\SemaLogic
go run server.go
```

Two service lifecycle variants are available:

```powershell
# Use an already running service and leave it running after the test.
npm.cmd run test:obsidian:integration:keep-server

# Start the local service when needed and stop the test-started process tree
# after the test run.
npm.cmd run test:obsidian:integration:stop-server
```

The default `npm.cmd run test:obsidian:integration` uses the second variant.
An already manually started service is never stopped by either command. Test
reports, request traces, screenshots and the interaction protocol are written
to `tests/obsidian/artifacts/<timestamp>/`.

For local paths and the service command copy
`tests/obsidian/.env.example` to `tests/obsidian/.env` and adjust it. Further
test details are in [docs/TESTING.md](docs/TESTING.md).

Note 2 - Example:

Formalsprachliche Definition einer Und-Regel inkl. notwendiger SymToken - Configuration (for German Language)

Das Studium besteht aus der Abschlussarbeit, den Pflichtkursen und den Wahlmodulen.

Aus den Wahlmodulen können 2 bis 3 Alternativen der Module Geschichte 19tes Jh., moderne Geschichte, römische Geschichte oder griechische Geschichte gewählt werden.

SymTokenAndOpen≡ besteht aus
SymTokenSpace≡Das
SymTokenSpace≡der
SymTokenElement≡,
SymTokenSpace≡den
SymTokenEoS≡.
SymTokenElement≡ und

SymTokenOrOpen≡ Alternativen
SymTokenOrClose≡gewählt werden
SymTokenSpace≡Aus
SymTokenSpace≡können
SymTokenInterval≡ bis
SymTokenSpace≡der Module
SymTokenElement≡ oder
