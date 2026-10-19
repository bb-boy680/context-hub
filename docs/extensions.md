# Extensions

An extension is one directory under `<hub-home>/extensions/<id>` holding
`plugin.json` and the files it names. The kernel reads the directory at startup,
imports its entry module, and lets it register contributions for as long as it
is enabled.

## Package layout

```text
<id>/
  package.json     project metadata; `main` names the built entry
  plugin.json      identity, API version, entry module
  lib/index.js     the built entry module; exports apply(scope)
  src/             the source it was built from
  ...              anything else the extension reads at runtime
```

A plugin may also be a plain directory with no `package.json`, as older
extensions are; the entry then lives wherever `plugin.json` says.

A plugin project declares its built entry in `package.json`'s `main` (normally
`lib/index.js`) and repeats the same path in `plugin.json`'s `entry`. The
installer refuses a package whose two declarations disagree. `lib/` is
committed because the installer clones the repository and imports the entry
directly; there is no npm publish step that could carry the build output.

`plugin.json`:

```json
{
  "id": "demo.counter",
  "name": "Demo Counter",
  "version": "1.0.0",
  "apiVersion": "^0.1",
  "description": "Adds a counter to the header.",
  "icon": "sparkles",
  "entry": "lib/index.js",
  "category": "integration",
  "permissions": ["storage.self"],
  "inject": ["header"]
}
```

- `id` must equal the directory name and match
  `^[a-z0-9][A-Za-z0-9-]*(\.[a-z0-9][A-Za-z0-9-]*)*$`.
- `apiVersion` is checked for equality against `EXTENSION_API_VERSION` (`0.1`).
- `inject` lists every service the extension reads from its context. Cordis
  refuses property access to a service that is not listed, so a missing name
  fails at activation with `without inject`.
- `permissions` is display-only. It is not enforced.
- An installed package cannot set `locked`.
- `entry` names the runtime file. When the directory has a `package.json` with
  a `main` field, `entry` must equal it.

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

## Market index

The host reads one JSON index and installs one plugin directory at a time,
versioned by the plugin's `package.json`.

```json
{
  "format": 1,
  "title": { "en": "Context Hub Extensions", "zh-cn": "Context Hub 扩展" },
  "plugins": [
    {
      "id": "demo.counter",
      "title": { "en": "Demo Counter", "zh-cn": "演示计数器" },
      "description": { "en": "Adds a counter to the header.", "zh-cn": "在标题栏里加一个计数器。" },
      "icon": "data:image/svg+xml;base64,…",
      "author": "Context Hub",
      "category": "integration",
      "permissions": ["storage.self"],
      "versions": [
        {
          "version": "1.0.0",
          "apiVersion": "^0.1",
          "source": {
            "type": "git",
            "url": "https://github.com/you/context-hub-extensions",
            "path": "plugins/demo.counter"
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
- `apiVersion` is the range the plugin's manifest declares; it must be
  compatible with this kernel.
- The installer clones the repository's default branch. The version in the
  index must equal the `version` in both `plugin.json` and `package.json`; a
  mismatch aborts before anything moves into place.
- There is no content hash: the market trusts the repository's default branch.
- `versions[0]` is the recommended version. The kernel does not parse SemVer;
  "update available" means the installed version string differs from the first
  listed one.
- The index and the plugins live in the same repository; the default branch must
  contain the plugin's path.

### Local development source

The source box accepts an absolute directory or a `.json` file path as well as
an HTTPS URL. Given a directory, the host reads `marketplace.json` from it. An
index read from disk may name the checkout itself as `source.url`, so `git
clone` runs against the local repository and the whole install path is
exercised without a network.

The example repository at `D:\work-space\context-hub-extensions` is configured
this way. It is a pnpm workspace: after changing a plugin, run
`pnpm install && pnpm build`, raise the version in `package.json` and
`plugin.json` together, and update the index. Replace its `source.url` with the
published HTTPS URL before distributing the index.

## Installing

Market entries are listed in the page's own categories, beside installed
extensions, and use the same detail dialog and the same action button.

- Files land in `<hub-home>/extensions/<id>`. The header index is
  `<hub-home>/extensions/index.json`.
- Installing writes the files, imports the entry module, registers it in the
  running kernel and enables it. It takes effect immediately; there is no page
  reload.
- Uninstalling is the kernel's own disable action: the extension is switched
  off and its contributions are withdrawn, but its files stay in
  `<hub-home>/extensions/<id>`. Reinstalling from the same row enables it
  again.
- A first install writes `true` for the id into `<hub-home>/state/extensions.json`;
  an update keeps the value the user chose; removing deletes the key.
- A failed clone, a manifest whose id or version disagrees with the index, a
  permission list that differs from the manifest, a `package.json` `main` that
  disagrees with `plugin.json`'s `entry`, a version that disagrees across the
  index, `package.json` and `plugin.json`, or a missing entry file all abort
  before anything moves into place. The previous version stays installed.
- Directories beginning with `.staging-` or `.old-` are never read as
  extensions. A failed replacement leaves the old copy at `<id>.old-<uuid>` and
  reports that path.

## Trust

A market is trusted, first-party content. The host checks that the index,
`package.json` and `plugin.json` agree on the version, but it does not sign or
sandbox plugin code, and
`permissions` is display-only. A plugin runs in the page and reaches every host
route the page can reach. Only configure indexes you control.

## Try it

The example repository is installed from its local path:

1. Build the page: `pnpm --filter web build`.
2. Open **Extensions**, find the market source field beside the search box, and
   enter `D:\work-space\context-hub-extensions`.
3. **Demo Other** appears in the **Integrations** category. Open it, choose
   **Install** in the dialog's footer, and it is registered without a reload.
   The same button now reads **Uninstall**; it disables the extension and leaves
   its files in place.

The automated version of this flow is
`apps/web/__test__/e2e-server.ts` plus `apps/web/__test__/e2e-probe.ts`; see the
header comment in each file for the command.
