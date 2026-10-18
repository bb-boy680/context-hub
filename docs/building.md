# Building the distributable forms

The repository has four carriers for one server: development (Vite + the hub's
own server), the built web form, a command-line binary, and a desktop app. All
of them run `apps/web/server.ts`; nothing re-implements a route.

## Version

The root `package.json` `version` is the only release version anyone edits.
`apps/web/server.ts` imports that manifest, so the About row, the CLI binary and
the desktop bundle all carry it at build time. `apps/desktop/electron-builder.config.mjs`
copies it into the packaged manifest as `extraMetadata.version`, which is what
`app.getVersion()` and the update feed compare.

`apps/desktop/package.json` keeps a mirror of the same number for `electron .`
in development; `apps/desktop/__test__/version.test.ts` fails when it drifts.
`apps/web/package.json`'s version is no longer read.

A tag must be `v` + the root version. The release workflow checks this before
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

`apps/desktop` is an Electron carrier. `build.ts` produces two bundles:

- `dist/main.cjs` — the Electron main process (CJS).
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

This watches both bundles, rebuilds on change, and restarts Electron after a
successful rebuild. The application menu adds Restart App and Toggle DevTools
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

The flow is deliberate: an available release asks before downloading, the
download reports progress on the taskbar/Dock, and installation asks again.
Only after that confirmation does the main process stop the hub server and
call `quitAndInstall`. Closing the app normally never installs an update.

The feed files are generated by electron-builder:

- `latest.yml` for the NSIS installer;
- `latest-mac.yml` for the ZIP payload;
- `latest-linux.yml` for the AppImage.

The release workflow uploads them with the installers and their `.blockmap`
files. `electron-updater` verifies the SHA-512 recorded in the feed.

To publish:

1. Raise the root `package.json` version and the mirrored
   `apps/desktop/package.json` version (the test enforces the match).
2. Commit, then push a tag named `v<version>`.
3. The `version` job rejects a tag that does not match; the desktop jobs build
   on their own runners; the `publish` job attaches every artifact to the
   GitHub Release.

Real download and installation are not verified on a development machine: that
needs an installed older NSIS build and a published newer release. The
`win-unpacked` directory is not an installed app and cannot stand in for that
test. macOS updates also need a signed and notarized build. Linux AppImage
updates only work when the AppImage runtime sets `APPIMAGE`, which the local
build does not.

## Release

`.github/workflows/release.yml` runs on a `v*` tag or by manual dispatch:

- one Linux runner cross-compiles the five CLI binaries and smoke-tests the
  Linux x64 one (page, `/hub/about`, root version);
- Windows, macOS and Ubuntu runners each build their desktop installer,
  `latest*.yml` and `.blockmap`;
- on a tag, the `publish` job creates or updates the GitHub Release and uploads
  every artifact.

A manual dispatch stops after the artifacts; it does not publish.

## Known limits

- Installers are unsigned unless the macOS secrets above are configured.
  Windows SmartScreen and macOS Gatekeeper will warn.
- Real auto-update download/install, signing, notarization, and the CI workflow
  have not been run from this checkout. The packaged app was verified to load
  `electron-updater`, show the update menu, and write crash logs.
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
