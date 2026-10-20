# Extensions

An extension is one directory under `<hub-home>/extensions/<id>` holding
`plugin.yaml`, `package.json`, and the files they name. The kernel reads the
directory at startup, imports the entry module, and lets it register
contributions for as long as it is enabled.

A marketplace package is the same directory before it is installed: the hub
clones the repository's default branch, copies the one directory the index
names, verifies both declarations, and moves it into place.

## Package layout

```text
<id>/
  plugin.yaml      identity, Context Hub version range, presentation, permissions, services
  package.json     project metadata; version and `main` (the entry module)
  lib/index.js     the built entry module; exports apply(scope)
  src/             the source it was built from
  assets/          pictures the manifest or the plugin itself points at
  ...              anything else the extension reads at runtime
```

`package.json` is the only source of the version and the entry:

- `version` is required for a market package; a directory installed by hand may
  omit it and loads as `0.0.0`.
- `main` is the entry module; missing means `index.js`.
- `plugin.yaml` must not declare `version` or `entry`; the loader refuses a
  manifest that does.

The marketplace repository's main branch carries `lib/` and `marketplace.json`,
produced by its build workflow. A source branch does not commit either; the
installer clones the default branch and imports the entry directly, so the
bot-built copy on main is what an install reads. There is no npm publish step
that could carry the build output.

## `plugin.yaml`

```yaml
id: skills.sh
name:
  en: skills.sh
  zh-cn: skills.sh
engines:
  contextHub: ">=0.0.1 <0.7.0"
description:
  en: Search the public skills.sh catalog and install a result into this hub.
  zh-cn: 搜索公开的 skills.sh 技能目录，并把结果安装到本 hub。
icon: assets/icon.svg            # lucide name, or a relative image path
category: source                 # optional
permissions: [network]           # optional
inject: [skillRegistries]        # optional
```

Rules:

- `id` must equal the directory name and match
  `^[a-z0-9][A-Za-z0-9-]*(\.[a-z0-9][A-Za-z0-9-]*)*$`.
- `engines.contextHub` is required and is an npm semver range naming the
  Context Hub **application** versions the plugin supports, e.g.
  `">=0.1.0 <0.7.0"`, `"^0.2"`, or `"0.1 || >=0.3 <0.7"`. The hub compares
  this range with the version in the repository root's `package.json`.
  Prereleases are included, so `">=0.0.0"` accepts a running
  `0.0.1-beta.5`; the parser refuses a range `semver.validRange` cannot read.
  There is no `apiVersion` field any more.
- `name` and `description` are a string or a `{ "<locale>": "text" }` table.
  A table must include `en`; locale ids are lowercase. The UI resolves the
  active locale, then its language, then `en`.
- `icon` is either a name in `PLUGIN_ICONS` (e.g. `sparkles`) or a path inside
  the plugin directory (e.g. `assets/icon.svg`). The installed extension serves
  the image at `/hub/extensions/<id>/<path>`.
- `inject` lists every service the extension reads from its context. Cordis
  refuses property access to a service that is not listed, so a missing name
  fails at activation with `without inject`.
- `permissions` is display-only. It is not enforced.
- An installed package cannot set `locked`.
- Unknown fields are ignored; `version` and `entry` are not unknown — they are
  refused with a message naming `package.json`.

The entry module exports `apply(scope)`. It must not import any package except
`react`, `react-dom`, `react/jsx-runtime` and `react/jsx-dev-runtime`, which
the page maps to its own React instance. Icons and the UI kit arrive on
`scope`, and everything else is a kernel service read through the context.

## Standard `import React`

A plugin built as a normal React project may import `react` by name. The page
declares an import map that points those names at shims served by the host:

```html
<script type="importmap">
  {
    "imports": {
      "react": "/hub/extensions/_runtime/react.js",
      "react/jsx-runtime": "/hub/extensions/_runtime/jsx-runtime.js",
      "react/jsx-dev-runtime": "/hub/extensions/_runtime/jsx-dev-runtime.js",
      "react-dom": "/hub/extensions/_runtime/react-dom.js"
    }
  }
</script>
```

The kernel publishes its only React instance on `globalThis` before any plugin
is imported; the shims read it. A plugin must therefore bundle with those four
names external:

```sh
esbuild src/index.tsx --bundle --format=esm --outfile=lib/index.js \
  --external:react --external:react-dom \
  --external:react/jsx-runtime --external:react/jsx-dev-runtime
```

Run it from the plugin directory, or set `absWorkingDir` to that directory
with the JS API: esbuild's path banner otherwise follows the cwd and changes
the built bytes.

The export lists in `packages/core/src/host/extension-runtime.ts` are checked
against the installed React package by
`apps/web/__test__/extension-runtime.test.ts`. A React upgrade that adds an
export fails that test rather than the first plugin that uses it.

Do not import any other package. UI components come from `scope.ui`; icons from
`scope.icons` and `scope.icon(name)`.

## Prompt providers

An agent extension that takes prompts declares where and how it takes them by
registering a provider into the `prompts` service:

```yaml
inject: [prompts]
```

```ts
ctx.prompts.register({
  id: "hub.target.example",
  places: [
    {
      id: "example-global",
      agent: "hub.target.example",
      labelKey: "example.tab",
      icon,
      scope: "global",
      order: 20,
      where: "~/.example",
      forms: [
        { id: "commands", labelKey: "prompts.menu.commands" },
        {
          id: "instructions",
          labelKey: "example.menu.instructions",
          options: [{ id: "memory", labelKey: "example.menu.memory" }],
        },
      ],
    },
  ],
  async held(io, place, prompt) {
    return { commands: await exists(io.files, place, prompt) }
  },
  async install(io, place, prompt, form, option) {
    /* Write the file this action names. */
  },
  async remove(io, place, prompt, form, option) {
    /* Return false when there was nothing to take back. */
  },
})
```

The page draws only the forms a place declares; it has no fixed list of
actions. `held` answers what one place already holds: a form without options is
held under its own id (`commands`), a form with options under
`<form>:<option>` (`instructions:memory`). `install` and `remove` receive the
same ids, and `remove` returns whether anything was there.

`io.files` is the `PlaceFiles` port — whole-file `read` / `write` / `remove`
under the workspace and machine-wide roots. `io.workspace()` is the workspace
path, or null. The provider owns its paths: nothing in the hub knows an
agent's directories.

`ctx.prompts.tools` carries the rules a provider cannot import:

| Function | Use |
| --- | --- |
| `slugOf(name)` | A prompt's display name as a safe file name. |
| `describeBody(body)` | The first meaningful line, for a description a prompt did not give. |
| `commandFile({ name, description, body, frontmatter })` | The text of a generated command, rule or agents file. |
| `withSection(existing, { slug, title, body })` | Add or replace a marked section in an instruction file. |
| `withoutSection(existing, slug)` | Take that section out; `null` when it was never there. |
| `PromptError(key, params?, detail?)` | A failure the page shows as its own localized sentence. |

A thrown `PromptError` keeps its key and params; the page resolves them against
the extension's locale. Any other throw is logged and shown as a generic
localized failure. A provider should name unknown places, unknown forms, and a
file it refuses to overwrite.

Registration is tied to the plugin's lifetime and rejects duplicate place ids.
A provider written for the old contract — `places` with `commandDir`,
`ruleDir`, `agentDir` and `documents`, and no methods — is wrapped by a legacy
adapter and keeps working. The adapter is transitional and is removed when the
hub's `engines` upper bound (0.7.0) no longer admits such a version.

## Market index

The host reads one JSON index and installs one plugin directory at a time. The
index is generated on main by the marketplace repository's build workflow,
never edited by hand:

```json
{
  "format": 1,
  "title": { "en": "Context Hub Extensions", "zh-cn": "Context Hub 扩展" },
  "plugins": [
    {
      "id": "skills.sh",
      "title": { "en": "skills.sh", "zh-cn": "skills.sh" },
      "description": { "en": "Search the public skills.sh catalog and install a result into this hub.", "zh-cn": "搜索公开的 skills.sh 技能目录，并把结果安装到本 hub。" },
      "icon": "data:image/svg+xml;base64,…",
      "author": "Context Hub",
      "category": "source",
      "permissions": ["network"],
      "versions": [
        {
          "version": "0.1.0",
          "engines": { "contextHub": ">=0.0.1 <0.7.0" },
          "source": {
            "type": "git",
            "url": "https://github.com/you/context-hub-extensions",
            "path": "plugins/skills.sh"
          }
        }
      ]
    }
  ]
}
```

Rules:

- `format` is `1`. `title` and every plugin's `title` and `description` are
  strings or `{ "<locale>": "text" }` with an `en` entry; locale ids are
  lowercase.
- `icon` is an inline `data:image/...;base64,` URL (decoded ≤ 32 KiB), or an
  `https:` URL, or a path relative to the index URL. A local index cannot use a
  relative icon: the page cannot read a local file.
- `source.type` is `git`. For a remote index, `url` must be `https:` without
  credentials, query or fragment. For an index read from disk, `url` may also be
  an absolute local repository path.
- `engines.contextHub` on every version is the range the plugin's manifest
  declares. It is validated for syntax when the index is read, but an
  unsatisfied range does not reject the document: `compatibleVersion()` picks
  the first version the running hub satisfies, and `versions[0]` is only the
  newest listing for display. One future-facing version therefore cannot hide
  the rest of the market.
- Installing refuses a version whose `engines` this hub does not satisfy,
  before anything is cloned; after the clone the package's own `plugin.yaml`
  is checked again, so an index and a package that disagree install nothing.
- The installer clones the repository's default branch. The version in the
  index must equal the `version` in the plugin's `package.json`; a mismatch
  aborts before anything moves into place.
- There is no content hash: the market trusts the repository's default branch.
- `versions[0]` is the newest listed version, for display. The kernel does not
  order SemVer strings: "update available" means the first compatible version
  differs from the installed version string.
- The index and the plugins live in the same repository; the default branch must
  contain the plugin's path.
- A market plugin must declare an image `icon` in `plugin.yaml`; the generator
  inlines that file into the index. A lucide name only works for an installed
  extension, not for a market listing.
- When the host reads an index from disk, a version whose `source.path` exists
  inside that checkout is installed from the checkout, even when the index names
  the published repository. The Extensions page always uses the built-in remote
  index; this path is for tests and tools that call the host directly.
- The host normalizes a GitHub repository URL
  (`https://github.com/<owner>/<repo>`) to
  `https://raw.githubusercontent.com/<owner>/<repo>/main/marketplace.json`.
  The built-in source already uses the raw URL, so this only matters to callers
  that pass a repository address.

### Cached market metadata

A successful market read writes the validated index to
`<hub-home>/extensions/marketplace.json`. The file holds listings only — names,
descriptions, versions and sources — never plugin files. It is what the
Extensions page can draw from at startup; choosing Install is still the step
that clones the plugin directory.

### Built-in market source

The market source is built in: `OFFICIAL_MARKET_URL` points at the first-party
index. The Extensions page has no source box and no stored override. `startHub()`
reads the index once at startup — metadata only — and the page reads it again on
mount. No plugin code is downloaded until the user chooses Install; that call
clones the repository directory.

### Host-level local index

The host's reader still accepts an absolute directory or a `.json` file when
called directly; tests and tools use this. A version whose `source.path` exists
inside that checkout is installed by copying the checkout's working tree —
uncommitted edits included. The Extensions page always uses the built-in URL, so
this is not reachable from the UI.

## Installing

Market entries are listed in the page's own categories, beside installed
extensions, and use the same detail dialog and the same action button.

- Files land in `<hub-home>/extensions/<id>`. The header index is
  `<hub-home>/extensions/index.json`.
- Installing writes the files, imports the entry module, replaces the module
  behind that id in the running kernel and enables it. It takes effect
  immediately; there is no page reload.
- An installed plugin whose first compatible market version differs from the
  installed one shows **Update available**. Update installs that version,
  replaces the directory, loads the new entry and swaps the running module
  without a reload; the user's enablement choice is kept. A listing whose only
  versions are incompatible shows **Incompatible** and offers no install.
- An installed plugin this hub cannot run stays visible with its manifest row,
  but its entry module is never imported and it cannot be enabled.
- **Uninstall** on a stored package disables it first, then deletes
  `<hub-home>/extensions/<id>`, its `index.json` record and its key in
  `state/extensions.json`, and finally removes it from the running catalog.
  A failed deletion leaves the extension installed but disabled, so code is
  never running after its files are gone.
- A package compiled into the build has no directory to delete; its action is
  **Disable** / **Enable**, and it stays in the catalog.
- `state/extensions.json` holds one boolean per extension and nothing else:
  descriptions live in `plugin.yaml`, install source/version/time in
  `index.json`. Removing the key is how an uninstall forgets the user's choice.
- A first install writes `true` for the id into `<hub-home>/state/extensions.json`;
  an update keeps the value the user chose.
- A failed clone, a manifest whose id disagrees with the index, a missing or
  unusable `package.json`, a version that disagrees across the index and
  `package.json`, a permission list that differs from the manifest, an
  incompatible `engines` range, or a missing entry file all abort before
  anything moves into place. The previous version stays installed.
- Directories beginning with `.staging-` or `.old-` are never read as
  extensions. A failed replacement leaves the old copy at `<id>.old-<uuid>` and
  reports that path.

## Update settings

The settings page's **Extension updates** group controls when the hub reads the
market again:

- **Check for updates**: Manual (only the button), On startup (every page
  load), or Daily at a chosen local time.
- **Install updates automatically**: when on, a check installs every
  compatible update it finds; when off, it only refreshes the badges.

The values live in `<hub-home>/state/settings.json` under the plugin namespace
`hub.extensions`, alongside the skills and plugin-pack settings. The schedule
runs only while the hub page is open; closing it stops the timer. A daily run
missed while closed catches up once. Automatic updates replace the whole
extension directory — there is no content hash, so local edits inside that
directory are overwritten; the switch is off by default.

The Extensions page also has a **Check for updates** button beside the search
box. It forces a market re-read and, when automatic updates are on, installs
what it finds and reports the counts.

## Migration

This build reads `engines` and no longer reads `apiVersion`. An extension
installed from an earlier build has no `engines` in its `plugin.yaml`, so the
loader refuses it and the page does not list it; its files stay on disk.
Reinstall it from the updated market, or add
`engines: { contextHub: "<range>" }` to its `plugin.yaml` by hand.

The remote market must publish the new index before this hub is released: an
old index has no `engines` in its versions and is rejected as malformed. Merge
and rebuild the market repository first, then ship the hub.

## Breaking change: `plugin.json` is no longer read

This build reads `plugin.yaml` only. An extension installed from an earlier
build keeps its files on disk but no longer appears in the catalog; it is not
migrated automatically. Reinstall it from the market, or convert its
`plugin.json` to `plugin.yaml` and add `version` / `main` to `package.json`.

Agent plugin packs (the directories the Plugins page collects for Claude Code
and other clients) are a different format and still use their own
`plugin.json` files.

## Trust

A market is trusted, first-party content. The host checks that the index and
`package.json` agree on the version, but it does not sign or sandbox plugin
code, and `permissions` is display-only. A plugin runs in the page and reaches
every host route the page can reach. The built-in index is the only market the
page reads.

## Try it

1. Build the page: `pnpm --filter web build`.
2. Open **Extensions**. The built-in index lists **skills.sh** in **Sources**
   and **Claude Code** in **Agents**.
3. Open one and choose **Install** in the dialog's footer; its files are cloned
   from the first-party repository and the row updates without a reload. The
   same button now reads **Uninstall**; it disables the extension, deletes its
   files and its state key, and the market row returns. Installing **skills.sh**
   adds its search source to **Skills → Explore**; installing **Claude Code**
   adds the agent's sidebar row immediately.
4. Choose **Check for updates** beside the search box to re-read the market and
   refresh any **Update available** badges.

The automated version of this flow is
`apps/web/__test__/e2e-server.ts` plus `apps/web/__test__/e2e-probe.ts`; see the
header comment in each file for the command.
