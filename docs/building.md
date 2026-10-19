# Building the distributable forms

The repository has four carriers for one server: development (Vite + the hub's
own server), the built web form, a command-line binary, and a desktop app. All
of them run `apps/web/server.ts`; nothing re-implements a route.

## Version

The root `package.json` `version` is the release version. Raise it by hand and
mirror the same number in `apps/desktop/package.json`; the test in
`apps/desktop/__test__/version.test.ts` fails when the two drift.
`apps/web/server.ts` imports the root manifest, so the About row, the CLI binary
and the desktop bundle all carry it at build time.
`apps/desktop/electron-builder.config.mjs` copies it into the packaged manifest
as `extraMetadata.version`, which is what `app.getVersion()` and the update feed
compare. `apps/web/package.json`'s version is not read.

Merging to main does not bump the version or create a tag. To release:

1. Change both `version` fields to the release version.
2. Commit and push.
3. Push a tag named `v<version>` (`v1.2.0`). That push runs the release
   workflow.

A version with a prerelease suffix (`1.2.0-beta.1`, tag `v1.2.0-beta.1`) is a
test release: it becomes a GitHub pre-release and the stable desktop updater
does not offer it. A major release is just a higher major number (`v2.0.0`).

The release workflow rejects a tag that is not `v` + the root version before
building anything.

## Command-line binary

Built with Bun's compiler, which embeds both the server and `apps/web/dist`:

```bash
pnpm build:cli                              # every target
pnpm --filter web build:cli                 # same, without rebuilding the page
pnpm --filter web build:cli bun-linux-x64   # one target
```

Output lands in `apps/web/release/cli/`:

| Target | File |
|---|---|
| `bun-windows-x64` | `context-hub-windows-x64.exe` |
| `bun-linux-x64` | `context-hub-linux-x64` |
| `bun-linux-arm64` | `context-hub-linux-arm64` |
| `bun-darwin-arm64` | `context-hub-darwin-arm64` |
| `bun-darwin-x64` | `context-hub-darwin-x64` |

Cross compilation needs no target machine; Bun fetches the runtime for each
target on first use. `bun` must be on PATH. The resulting file is 60–90 MB
depending on the platform.

Without `--static`, a compiled binary serves the page embedded beside it. A
`node server.ts` run does not fall back to `dist/`, so development keeps
answering on its routes only. `--port 0` makes the OS choose a port, which is
what the desktop app uses.

The version shown in About is imported from the root `package.json` at build
time; there is no manifest file to ship next to the binary.

## Desktop app

`apps/desktop` is an Electron carrier. `build.ts` produces three bundles:

- `dist/main.cjs` — the Electron main process (CJS).
- `dist/preload.cjs` — the sandboxed preload that exposes `window.contextHub`
  (CJS; a sandboxed preload cannot load an ES module).
- `dist/server.mjs` — `apps/web/server.ts` bundled as ESM, started with
  `utilityProcess.fork`.

The main process chooses `--port 0`, reads the origin from the server's stdout,
and only then creates the window. Closing the window hides it to the tray
instead of stopping the hub; the tray menu offers Open Context Hub, updates
when configured, and Quit. `before-quit` asks the server to close and waits for
it before the process exits. A second launch focuses the existing window
instead of starting a second server.

The server's working directory is the person's home, not the install directory:
without that, a shortcut could make an unrelated folder look like the workspace.

`electron-updater` is a production dependency. The main bundle leaves it
external and electron-builder copies it into `app.asar/node_modules`, which is
also why packaging does not download Electron: `electronDist` points at the
installed `electron` package's `dist`.

### Development

```bash
pnpm --filter @context-hub/desktop dev
```

This watches all three bundles, rebuilds on change, and restarts Electron after
a successful rebuild. The application menu adds Restart App and Toggle DevTools
while the watcher runs (Reload Page is always available). Stopping the watcher
also stops the Electron process it started.

To use Vite's HMR for the page, run `pnpm dev` in another terminal and start
the desktop with:

```bash
CONTEXT_HUB_DEV_URL=http://127.0.0.1:5271 pnpm --filter @context-hub/desktop exec electron .
```

`CONTEXT_HUB_DEV_URL` skips the server entirely; `/hub` requests go through
Vite's existing proxy. Main-process and server changes still need the watcher
or a rebuild.

Crash notes land in `app.getPath("logs")` — on Windows
`%APPDATA%\@context-hub\desktop\logs` — as `crash-<UTC>-<source>.log`. They
record the version, platform, error stack, and the last 64 KiB of the server's
output. Only the ten newest `crash-*.log` files are kept. The error dialog shows
the path and the last 2 KiB of the server's stderr.

### Packaging

```bash
pnpm --filter @context-hub/desktop package:win
pnpm --filter @context-hub/desktop package:mac
pnpm --filter @context-hub/desktop package:linux
```

Each command builds the page, the bundles, then runs electron-builder with
`electron-builder.config.mjs`. Output lands in `apps/desktop/release/`:

- Windows: an NSIS installer (`Context-Hub-<version>-win-x64.exe`).
- macOS: a `.dmg` and the `.zip` payload electron-updater needs.
- Linux: an `.AppImage`.

The artifact name has no spaces because `latest*.yml` points at the exact file
name that the release job uploads.

Inside the packaged app, `dist/main.cjs` and `node_modules` are in `app.asar`;
`server.mjs` and the built page are copied to `resources/` so the utility
process can fork the server without asar resolution.

Packaging uses the installed Electron distribution instead of downloading one.
On Windows, running the unpacked app can keep its `app.asar` locked for a while
after the process exits. If a later package build reports `EBUSY`, build into a
different output directory or restart.

If GitHub is unreachable while installing dependencies, Electron's postinstall
honours mirrors:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_CUSTOM_DIR='{{ version }}' node install.js
```

### Signing and notarization

The macOS job reads these repository secrets when they exist:

| Secret | Use |
|---|---|
| `CSC_LINK` | Developer ID certificate (base64 or path) |
| `CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Notarization account |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Apple Developer team |

`electron-builder.config.mjs` enables notarization only when all four Apple
values and `CSC_LINK` are present; otherwise the build stays unsigned and CI
does not fail. Signing does not change the update feed. Without a signature,
macOS cannot install an in-place update reliably, so treat unsigned macOS
builds as manual-install only.

## Updates

The packaged app checks the GitHub Releases feed described by
`resources/app-update.yml`. It checks once shortly after startup and every four
hours, and the File menu (View on macOS) and tray offer Check for Updates.

An automatic check never opens a dialog: the sidebar shows an update action
beside the version. Clicking it downloads silently and, when the download
finishes, stops the hub server and calls `quitAndInstall` — no second
confirmation. The menu's Check for Updates keeps the explicit flow: it asks
before downloading, reports progress on the taskbar/Dock, and asks again before
installing. Closing the app normally never installs an update.

The feed files are generated by electron-builder:

- `latest.yml` for the NSIS installer;
- `latest-mac.yml` for the ZIP payload;
- `latest-linux.yml` for the AppImage.

The release workflow uploads them with the installers and their `.blockmap`
files. `electron-updater` verifies the SHA-512 recorded in the feed.

To publish a stable release:

1. Raise the root `package.json` version and the mirrored
   `apps/desktop/package.json` version (the test enforces the match).
2. Commit and push.
3. Push a tag named `v<version>`. The `version` job rejects a tag that does not
   match; the `checks` job runs lint, typecheck, tests and the build; the
   desktop jobs build on their own runners; the `publish` job attaches every
   artifact to the GitHub Release.

For a test release, use a prerelease version in both manifests and the tag
(`1.2.0-beta.1` / `v1.2.0-beta.1`). The Release is marked as a GitHub
pre-release, so `electron-updater` keeps offering only stable releases.

Real download and installation are not verified on a development machine: that
needs an installed older NSIS build and a published newer release. The
`win-unpacked` directory is not an installed app and cannot stand in for that
test. macOS updates also need a signed and notarized build. Linux AppImage
updates only work when the AppImage runtime sets `APPIMAGE`, which the local
build does not.

## Pull requests

`.github/workflows/ci.yml` runs on every pull request into `main`, in one job
with one dependency install:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`build` runs only after lint, typecheck and tests pass. A newer push to the
same pull request cancels the previous run.

A failing check does not block the Merge button by itself. Enable branch
protection and require the `checks` job:

```text
Settings → Branches → Branch protection rules → main
→ Require status checks to pass before merging
→ checks
```

## Release

`.github/workflows/release.yml` runs on a `v*` tag or by manual dispatch.
Merging to main does not trigger it.

- `version` checks that the tag is `v` + the root `package.json` version and
  reports whether the version is a prerelease.
- `checks` runs `pnpm lint`, `typecheck`, `test` and `build`; nothing is
  packaged if any of them fails.
- one Linux runner cross-compiles the five CLI binaries and smoke-tests the
  Linux x64 one (page, `/hub/about`, root version);
- Windows, macOS and Ubuntu runners each build their desktop installer,
  `latest*.yml` and `.blockmap`;
- on a tag, the `publish` job creates or updates the GitHub Release and uploads
  every artifact. A prerelease version creates the Release with
  `--prerelease`.

A manual dispatch stops after the artifacts; it does not publish.

The repository settings must allow workflow writes: `Settings → Actions →
General → Workflow permissions` set to Read and write, and any tag protection
must let Actions publish the Release.

## Known limits

- Installers are unsigned unless the macOS secrets above are configured.
  Windows SmartScreen and macOS Gatekeeper will warn.
- Real auto-update download/install, signing, notarization, and the release
  workflow have not been exercised from this checkout; the first tag push is
  the verification. The packaged app was verified to load `electron-updater`,
  show the update menu, and write crash logs.
- The tag is pushed before the build. If a CLI or desktop job fails, the tag
  exists without a Release; re-run the failed jobs for the same tag rather than
  deleting or moving it.
- Pull request checks only block a merge after branch protection requires the
  `checks` job.
- A prerelease version is published as a GitHub pre-release and never becomes
  the latest release. Installing a test build by hand and later switching to a
  higher stable version upgrades normally.
- In a private repository, Release assets are visible only to collaborators,
  and the desktop app's anonymous `electron-updater` check cannot reach them.
- `macos-latest` is arm64, so the workflow produces an arm64 `.dmg` only. Intel
  Macs need an x64 matrix entry.
- The Linux `.AppImage` is built but not run in CI. Ubuntu 24.04's AppArmor
  restriction on unprivileged user namespaces can stop Electron from starting;
  provide `--no-sandbox` or an AppArmor profile if that happens.
- On Linux the tray icon depends on the desktop's StatusNotifier/AppIndicator
  support. On a desktop that shows no tray, closing the window still hides it
  and the hub keeps running; end the process from the desktop's process monitor
  if the tray is unreachable.
- "Install a skill from a package" runs the `skills` CLI through `npx`. A
  compiled binary and Electron are not Node, so they fall back to the `npx` on
  PATH; Node.js must be installed for that feature. Without it, the hub reports
  that npx is missing.
- The server listens on loopback without authentication, as in every other
  form.
