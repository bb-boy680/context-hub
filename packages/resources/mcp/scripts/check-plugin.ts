/**
 * Behaviour check for the case this design exists for: a client extension that
 * lives in a directory and imports nothing — the shape a plugin downloaded from
 * GitHub has.
 *
 * The example under `packages/extensions/examples/acme-mcp` is copied into a
 * throwaway plugin space byte for byte, discovered by the real loader, run by a
 * real kernel beside this module, and then made to read, install into and
 * uninstall from a real file. What it proves is what a plugin author cares
 * about: with no imports, it still has the editors, still reads its client's
 * file, and still reports its own message keys.
 *
 * Run from the package: `node scripts/check-plugin.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { createFsPluginStore } from "@context-hub/core/host/plugins"
import { createFsPlaceFiles } from "@context-hub/core/host/place-files"
import { EXTENSION_DIR, EXTENSION_ROUTE } from "@context-hub/core/plugins"
import { createHubKernel, discoverPlugins } from "@context-hub/extensions"
import type { ExtensionIcon, HubKernel } from "@context-hub/extensions"
import { readJsonObject, type McpIo } from "../src/contract.ts"

import { placesOf } from "../src/catalog.ts"
import { mcpExtensionWith } from "../src/extension.ts"

/** The module's own definition; the page is a stub, since nothing renders here. */
const mcpModule = mcpExtensionWith(() => null)

let failures = 0
let checked = 0

function check(what: string, ok: boolean, detail?: unknown) {
  checked += 1
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

/** The message one call refused with, or null when it did not refuse. */
async function refusalOf(call: () => Promise<unknown>): Promise<string | null> {
  try {
    await call()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return null
}

/** Whether a plugin's manifest asks to be on before anyone installs it. */
function kernelEnabled(definition: { manifest: { defaultEnabled?: boolean } } | undefined): boolean {
  return definition?.manifest.defaultEnabled === true
}

/** The mark an extension declares, as the page reads it out of the catalog. */
function iconFrom(kernel: HubKernel) {
  return (id: string): ExtensionIcon =>
    kernel.ctx.extensions.snapshot().entries.find((entry) => entry.manifest.id === id)?.manifest
      .icon ?? (() => null)
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
/* Three levels up: this file sits at packages/resources/mcp/scripts. */
const EXAMPLE = path.resolve(HERE, "../../../extensions/examples/acme-mcp")

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(tmpdir(), "hub-plugin-mcp-"))
  const home = path.join(root, "hub")
  const workspace = path.join(root, "project")
  const userHome = path.join(root, "person")
  const files = path.join(workspace, ".acme", "mcp.json")
  for (const dir of [home, workspace, userHome]) await fs.mkdir(dir, { recursive: true })

  /* The extension space as a download leaves it: a directory of files. The only
     thing this check adds is the npm shim Node needs to import ESM from a
     folder; the browser reads the entry over the hub's own route. */
  const installed = path.join(home, EXTENSION_DIR, "acme.mcp")
  await fs.cp(EXAMPLE, installed, { recursive: true })
  await fs.writeFile(
    path.join(installed, "package.json"),
    `{ "type": "module" }\n`,
    "utf8"
  )

  const store = createFsPluginStore(home)
  const found = await discoverPlugins({
    source: store,
    importModule: (url) =>
      import(
        pathToFileURL(
          path.join(home, EXTENSION_DIR, decodeURIComponent(url.slice(EXTENSION_ROUTE.length + 1)))
        ).href
      ) as Promise<unknown>,
  })
  const definition = found[0]?.definition

  console.log("the downloaded folder")

  check("the plugin loads", definition !== undefined, found[0]?.problem)
  check("its manifest reaches the catalog", definition?.manifest.name === "Acme Code")
  check(
    "it declares no import it cannot make",
    !/^\s*(import|export\s[^;]*\bfrom)\s/m.test(await fs.readFile(path.join(installed, "index.js"), "utf8"))
  )
  check("it is not switched on by a download alone", kernelEnabled(definition) === false)

  const problems: string[] = []
  const kernel = await createHubKernel({
    host: {
      form: "Test",
      capabilities: { code: true, filesystem: true, network: false },
      storage: { read: () => null, write: () => undefined },
      net: null,
      files: createFsPlaceFiles({ home, folder: workspace, userHome }),
      log: (level, message) => {
        if (level === "error") problems.push(message)
      },
    },
    extensions: [mcpModule, definition!],
  })
  await kernel.start()
  await kernel.ctx.extensions.enable("acme.mcp")

  const service = kernel.ctx.get("mcp")
  const registry = service?.registry
  const provider = registry?.providers().find((candidate) => candidate.id === "acme.mcp")

  console.log("what it registers")

  check("the module published its service", service !== undefined)
  check("the plugin registered a provider", provider !== undefined, registry?.providers().map((p) => p.id))
  check("its place is described", provider?.places[0]?.id === "acme")
  check("the place is a file in the workspace", provider?.places[0]?.file === ".acme/mcp.json")
  check(
    "its place draws the icon its own manifest declares",
    placesOf(registry?.providers() ?? [], iconFrom(kernel))[0]?.place.icon ===
      kernel.ctx.extensions.snapshot().entries.find((entry) => entry.manifest.id === "acme.mcp")
        ?.manifest.icon
  )
  check("it offers no switch, because its client has none", provider?.setEnabled === undefined)
  check("and its place says so", provider?.places[0]?.switchable === false)
  check("enabling it reported no failure", problems.length === 0, problems)

  console.log("what it can reach without importing")

  check("the toolkit travels with the service", typeof service?.tools?.editJson === "function")
  check(
    "so do the TOML reader and editor",
    typeof service?.tools?.setTomlEntry === "function" && typeof service?.tools?.parseToml === "function"
  )
  check("and the failure the plugin throws with", typeof service?.tools?.McpError === "function")

  console.log("reading, writing, and taking back out")

  const io: McpIo = { files: createFsPlaceFiles({ home, folder: workspace, userHome }), log: () => undefined }
  check("a file that is not there reads as nothing", (await provider!.read(io, "acme")).length === 0)

  await provider!.install(io, "acme", "context7", {
    transport: "http",
    url: "https://mcp.context7.com/mcp",
    headers: { Authorization: "Bearer k" },
  })
  const written = await fs.readFile(files, "utf8")
  check("the entry lands under the key its client reads", written.includes('"mcpServers"'), written)
  check("with the declaration it was given", written.includes("https://mcp.context7.com/mcp"))
  check("and the headers beside it", written.includes("Bearer k"))

  const entries = await provider!.read(io, "acme")
  check("it reads back", entries.length === 1 && entries[0]?.name === "context7", entries)
  check("as a remote declaration", entries[0]?.declaration?.transport === "http")
  check("which that client connects", entries[0]?.enabled === true)

  await fs.writeFile(files, `{\n  // a person's own note\n  "mcpServers": {}\n}\n`, "utf8")
  await provider!.install(io, "acme", "second", { transport: "stdio", command: "npx", args: ["-y", "@x/second"], env: {} })
  const kept = await fs.readFile(files, "utf8")
  check("a write into a file a person edited keeps the comment", kept.includes("// a person's own note"), kept)

  await provider!.uninstall(io, "acme", "second")
  check(
    "taking it out leaves the file as it was",
    (await fs.readFile(files, "utf8")) === `{\n  // a person's own note\n  "mcpServers": {}\n}\n`,
    await fs.readFile(files, "utf8")
  )

  /* The other side of the same rule: a project that had no file gets one, and
     it keeps an empty box when the last server leaves — the hub cannot tell
     later that it created that file, and guessing would delete a person's. */
  await fs.rm(files, { force: true })
  await provider!.install(io, "acme", "only", { transport: "stdio", command: "npx", args: [], env: {} })
  check("installing into a project with no file writes one", (await fs.readFile(files, "utf8")).includes("only"))
  await provider!.uninstall(io, "acme", "only")
  check(
    "and the file it wrote keeps an empty box, not a husk of its own making",
    JSON.stringify(readJsonObject(await fs.readFile(files, "utf8"))) === '{"mcpServers":{}}',
    await fs.readFile(files, "utf8")
  )

  const lines = await provider!.locate?.(io, "acme", "second")
  check("a name that is not there has no lines", lines === null || lines === undefined)

  console.log("the words it reports in")

  await fs.writeFile(files, "not json at all\n", "utf8")
  const broken = await refusalOf(() => provider!.read(io, "acme"))
  check("its own key reaches the caller", (broken ?? "").includes("acme.error.read"), broken)
  const wrongPlace = await refusalOf(() => provider!.read(io, "someone-else"))
  check("naming another place is refused with its key", (wrongPlace ?? "").includes("acme.error.unknownPlace"), wrongPlace)
  const language = await kernel.ctx.i18n.t("acme.error.read")
  check("and a pack translates it", language !== "acme.error.read", language)

  await fs.rm(root, { recursive: true, force: true })

  console.log(`\n${checked - failures}/${checked} checks passed`)
  if (failures > 0) process.exitCode = 1
}

await main()
