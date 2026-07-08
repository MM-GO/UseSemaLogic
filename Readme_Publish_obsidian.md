
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
