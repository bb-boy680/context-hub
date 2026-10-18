/**
 * Bundle the Electron main process, its preload and the hub server.
 *
 * The main process is CJS because that is Electron's most predictable entry.
 * The preload must also be CJS: a sandboxed preload cannot load ES modules.
 * The server keeps its top-level await and is emitted as ESM, which
 * `utilityProcess.fork` loads. Everything except Electron itself is bundled, so
 * the packaged app needs no `node_modules`.
 */
import { build } from "esbuild"
import type { BuildOptions } from "esbuild"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

export const serverBuildOptions: BuildOptions = {
  absWorkingDir: here,
  entryPoints: ["../web/server.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  /* Some bundled dependencies (the MCP SDK reaches into cross-spawn) are CJS
     and call `require` at runtime. ESM has none, so give them one. */
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
}

export const mainBuildOptions: BuildOptions = {
  absWorkingDir: here,
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  external: ["electron", "electron-updater"],
  logLevel: "info",
}

export const preloadBuildOptions: BuildOptions = {
  absWorkingDir: here,
  entryPoints: ["src/preload.ts"],
  outfile: "dist/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  external: ["electron"],
  logLevel: "info",
}

/** Build all three bundles once; the development watcher reuses these options. */
export async function buildBundles(): Promise<void> {
  await build(serverBuildOptions)
  await build(mainBuildOptions)
  await build(preloadBuildOptions)
}
