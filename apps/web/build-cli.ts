/**
 * Build the hub as one standalone executable per platform.
 *
 * `--asset dist` embeds the built page beside the entry inside Bun's virtual
 * filesystem, which `server.ts` serves when no `--static` is given. Cross
 * compilation needs no target machine: the runtime for each target is fetched
 * on first use.
 *
 * Usage: node build-cli.ts [target ...]
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const output = path.join(here, "release", "cli")

const TARGETS = [
  { target: "bun-windows-x64", name: "context-hub-windows-x64.exe" },
  { target: "bun-linux-x64", name: "context-hub-linux-x64" },
  { target: "bun-linux-arm64", name: "context-hub-linux-arm64" },
  { target: "bun-darwin-arm64", name: "context-hub-darwin-arm64" },
  { target: "bun-darwin-x64", name: "context-hub-darwin-x64" },
] as const

const known = new Set<string>(TARGETS.map((one) => one.target))
const requested = process.argv.slice(2)
for (const one of requested) {
  if (!known.has(one)) {
    console.error(`unknown target ${one}`)
    console.error(`known: ${[...known].join(" ")}`)
    process.exit(2)
  }
}

if (!existsSync(path.join(here, "dist", "index.html"))) {
  console.error("the built page is missing; run `pnpm --filter web build` first")
  process.exit(1)
}

const chosen =
  requested.length === 0 ? TARGETS : TARGETS.filter((one) => requested.includes(one.target))
mkdirSync(output, { recursive: true })

for (const one of chosen) {
  const outfile = path.join(output, one.name)
  const result = spawnSync(
    "bun",
    [
      "build",
      "--compile",
      `--target=${one.target}`,
      "--asset=dist",
      `--outfile=${path.relative(here, outfile)}`,
      "server.ts",
    ],
    /* A global bun install is a `.cmd` on Windows, which spawn cannot start
       without a shell; every argument here is a fixed token with no spaces. */
    { cwd: here, stdio: "inherit", shell: true }
  )
  if (result.error !== undefined) {
    console.error("bun 1.4.2 or newer must be on PATH to build the binary")
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
  console.log(`${one.name}  ${(statSync(outfile).size / (1024 * 1024)).toFixed(1)} MB`)
}
