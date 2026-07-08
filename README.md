# Obsidian SemaLogic PlugIn

It is possible to use SemaLogic (<https://semalogic.de>) in Obsidian (<https://obsidian.md>).

SemaLogic is a symbolic AI, that can be adapted to natural language in order to represent logical relationships unambiguously in a coherent language that is both computer and user understandable. The three forms of SemaLogic (natural language, technical language and practical representation) can be converted into each other at any time without loss of logical relationships in the understanding of the respective user.

**Note:** The SemaLogic-Obsidian API is still in early alpha and is subject to change at any time!

Currently the plugin is in development status and for testing SemaLogic to show technical language, graphical pictures in realtime and e.g. part of the SVGs in pdf directly.

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

## Releasing a new version

Publishing a new version to Obsidian is driven entirely by pushing a Git tag.
Pushing a tag triggers the workflow [.github/workflows/release.yml](.github/workflows/release.yml),
which builds the plugin in CI (`npm run build`) and publishes a GitHub release
containing `main.js`, `manifest.json` and `styles.css` as assets. Obsidian then
offers the new version as an update.

Tag convention: the plain version number **without** a `v` prefix (e.g. `2.3.4`).

### One command (recommended)

```bash
# Publish a new version (bumps package.json, manifest.json, versions.json,
# commits, tags and pushes; CI builds and publishes the release):
npm run release 2.3.5

# Publish using the version already set in package.json:
npm run release

# See what would happen without changing/pushing anything:
npm run release -- --dry-run 2.3.5
```

The script ([scripts/publish.mjs](scripts/publish.mjs)):

1. Sets the target version in `package.json`, `manifest.json` and `versions.json`
   (using `minAppVersion` from `manifest.json`).
2. Commits the changed version files as `Release <version>`.
3. Creates the Git tag `<version>` and pushes the branch + tag.
4. Aborts if the tag already exists.

Then watch the build and the resulting release:

- Actions:  <https://github.com/MM-GO/UseSemaLogic/actions>
- Releases: <https://github.com/MM-GO/UseSemaLogic/releases>

### Manual steps (equivalent)

If you prefer to do it by hand:

```bash
# 1. Bump the version everywhere (updates manifest.json + versions.json):
npm version 2.3.5 --no-git-tag-version
node version-bump.mjs

# 2. Commit the version files:
git add package.json manifest.json versions.json
git commit -m "Release 2.3.5"

# 3. Tag (no "v" prefix!) and push -> CI builds and publishes the release:
git tag -a 2.3.5 -m "Release 2.3.5"
git push origin main
git push origin 2.3.5
```

> Note: do **not** use `npm version` on its own to create the tag — it produces a
> `v`-prefixed tag (`v2.3.5`), which does not match the release convention.
