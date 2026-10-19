/**
 * Packaging configuration.
 *
 * The release version lives in the repository root manifest; `extraMetadata`
 * copies it into the packaged `package.json`, so the installer, `app.getVersion()`
 * and the update feed all name the same release.
 */
import { readFileSync } from "node:fs"

const root = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"))

/* Notarization needs both a signing identity and Apple credentials. Without
   them the build stays unsigned instead of failing every CI run. */
const notarize =
  Boolean(process.env.CSC_LINK) &&
  Boolean(process.env.APPLE_ID) &&
  Boolean(process.env.APPLE_APP_SPECIFIC_PASSWORD) &&
  Boolean(process.env.APPLE_TEAM_ID)

export default {
  appId: "com.contexthub.desktop",
  productName: "Context Hub",
  /* No spaces: `latest*.yml` points at this exact name, and the release job
     uploads the file by its basename. A space here would desynchronize them. */
  artifactName: "Context-Hub-${version}-${os}-${arch}.${ext}",
  directories: {
    output: "release",
  },
  files: ["dist/main.cjs", "dist/preload.cjs", "assets/*.png"],
  extraResources: [
    { from: "dist/server.mjs", to: "server.mjs" },
    { from: "../web/dist", to: "web" },
  ],
  extraMetadata: {
    version: typeof root.version === "string" ? root.version : "0.0.0",
  },
  publish: [{ provider: "github", owner: "bb-boy680", repo: "context-hub" }],
  win: {
    target: ["nsis"],
  },
  mac: {
    target: ["dmg", "zip"],
    category: "public.app-category.developer-tools",
    /* The workflow defines CSC_LINK even when the secret is empty, and
       importCertificate resolves an empty path to the project directory. Only
       enable signing/notarization when all credentials are present; otherwise
       identity: null skips certificate import entirely. */
    ...(notarize ? { notarize: true } : { identity: null }),
  },
  linux: {
    target: ["AppImage"],
    category: "Development",
    /* The package name is @context-hub/desktop, and AppImage rejects @ and / in
       the executable name. */
    executableName: "context-hub",
  },
}
