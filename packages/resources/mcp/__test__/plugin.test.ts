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
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createFsPlaceFiles } from "@context-hub/core/host/place-files"
import { createFsPluginStore } from "@context-hub/core/host/plugins"
import { EXTENSION_DIR, EXTENSION_ROUTE } from "@context-hub/core/plugins"
import { createHubKernel, discoverPlugins } from "@context-hub/extensions"
import type { ExtensionIcon, HubKernel } from "@context-hub/extensions"

import { placesOf } from "../src/catalog.ts"
import { readJsonObject } from "../src/contract.ts"
import type { McpIo, McpProvider } from "../src/contract.ts"
import { mcpModuleWith } from "../src/extension.ts"
import type { McpService } from "../src/provider.ts"

/** The module's own definition; the page is a stub, since nothing renders here. */
const mcpModule = mcpModuleWith(() => null)

const HERE = path.dirname(fileURLToPath(import.meta.url))
/* Three levels up: this file sits under packages/resources/mcp, as the script it
   came from did under `scripts`. */
const EXAMPLE = path.resolve(HERE, "../../../extensions/examples/acme-mcp")

/** Whether a plugin's manifest asks to be on before anyone installs it. */
function kernelEnabled(
  definition: { manifest: { defaultEnabled?: boolean } } | undefined
): boolean {
  return definition?.manifest.defaultEnabled === true
}

/** The mark an extension declares, as the page reads it out of the catalog. */
function iconFrom(kernel: HubKernel) {
  return (id: string): ExtensionIcon =>
    kernel.ctx.extensions.snapshot().entries.find((entry) => entry.manifest.id === id)?.manifest
      .icon ?? (() => null)
}

let root: string
let files: string
let installed: string
let definition: Awaited<ReturnType<typeof discoverPlugins>>[number]["module"]
let kernel: HubKernel
let service: McpService | undefined
let provider: McpProvider | undefined
let io: McpIo
/** Every error the kernel logged; enabling the plugin must report none. */
let problems: string[]

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), "hub-plugin-mcp-"))
  const home = path.join(root, "hub")
  const workspace = path.join(root, "project")
  const userHome = path.join(root, "person")
  files = path.join(workspace, ".acme", "mcp.json")
  for (const dir of [home, workspace, userHome]) await fs.mkdir(dir, { recursive: true })

  /* The extension space as a download leaves it: a directory of files. The
     example ships its own package.json, which also tells Node to read the
     entry as ESM; the browser reads it over the hub's own route. */
  installed = path.join(home, EXTENSION_DIR, "acme.mcp")
  await fs.cp(EXAMPLE, installed, { recursive: true })

  const store = createFsPluginStore(home)
  const found = await discoverPlugins({
    source: store,
    hubVersion: "0.5.0",
    importModule: (url) =>
      import(
        pathToFileURL(
          path.join(home, EXTENSION_DIR, decodeURIComponent(url.slice(EXTENSION_ROUTE.length + 1)))
        ).href
      ) as Promise<unknown>,
  })
  definition = found[0]?.module

  problems = []
  kernel = await createHubKernel({
    host: {
      form: "Test",
      version: "0.5.0",
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

  service = kernel.ctx.get("mcp")
  provider = service?.providers().find((candidate) => candidate.id === "acme.mcp")
  io = { files: createFsPlaceFiles({ home, folder: workspace, userHome }), log: () => undefined }
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe("the downloaded folder", () => {
  it("loads, and its manifest reaches the catalog", () => {
    expect(definition, "the plugin loads").toBeDefined()
    expect(definition?.manifest.name, "its manifest reaches the catalog").toBe("Acme Code")
    expect(definition?.manifest.version, "its version comes from package.json").toBe("1.0.0")
  })

  it("declares no import it cannot make", async () => {
    expect(
      await fs.readFile(path.join(installed, "index.js"), "utf8"),
      "it declares no import it cannot make"
    ).not.toMatch(/^\s*(import|export\s[^;]*\bfrom)\s/m)
  })

  it("is not switched on by a download alone", () => {
    expect(kernelEnabled(definition), "it is not switched on by a download alone").toBe(false)
  })
})

describe("what it registers", () => {
  it("publishes the module's service and a provider of its own", () => {
    expect(service, "the module published its service").toBeDefined()
    expect(provider, "the plugin registered a provider").toBeDefined()
  })

  it("describes its place as a file in the workspace", () => {
    expect(provider?.places[0]?.id, "its place is described").toBe("acme")
    expect(provider?.places[0]?.file, "the place is a file in the workspace").toBe(".acme/mcp.json")
  })

  it("draws the icon its own manifest declares", () => {
    expect(
      placesOf(service?.providers() ?? [], iconFrom(kernel))[0]?.place.icon,
      "its place draws the icon its own manifest declares"
    ).toBe(
      kernel.ctx.extensions.snapshot().entries.find((entry) => entry.manifest.id === "acme.mcp")
        ?.manifest.icon
    )
  })

  it("offers no switch, because its client has none", () => {
    expect(provider?.setEnabled, "it offers no switch, because its client has none").toBeUndefined()
    expect(provider?.places[0]?.switchable, "and its place says so").toBe(false)
  })

  it("reports no failure while it is enabled", () => {
    expect(problems, "enabling it reported no failure").toEqual([])
  })
})

describe("what it can reach without importing", () => {
  it("travels with the service: the editors, the TOML reader and the failure shape", () => {
    expect(typeof service?.tools?.editJson, "the toolkit travels with the service").toBe("function")
    expect(typeof service?.tools?.setTomlEntry, "so does the TOML editor").toBe("function")
    expect(typeof service?.tools?.parseToml, "and the TOML reader").toBe("function")
    expect(typeof service?.tools?.McpError, "and the failure the plugin throws with").toBe("function")
  })
})

describe("reading, writing, and taking back out", () => {
  it("reads a file that is not there as nothing", async () => {
    expect(
      await provider!.read(io, "acme"),
      "a file that is not there reads as nothing"
    ).toHaveLength(0)
  })

  it("installs the entry under the key its client reads, declaration and headers", async () => {
    await provider!.install(io, "acme", "context7", {
      transport: "http",
      url: "https://mcp.context7.com/mcp",
      headers: { Authorization: "Bearer k" },
    })
    const written = await fs.readFile(files, "utf8")
    expect(written, "the entry lands under the key its client reads").toContain('"mcpServers"')
    expect(written, "with the declaration it was given").toContain("https://mcp.context7.com/mcp")
    expect(written, "and the headers beside it").toContain("Bearer k")
  })

  it("reads it back as a remote declaration that client connects", async () => {
    const entries = await provider!.read(io, "acme")
    expect(entries, "it reads back").toHaveLength(1)
    expect(entries[0]?.name, "under the name it was given").toBe("context7")
    expect(entries[0]?.declaration?.transport, "as a remote declaration").toBe("http")
    expect(entries[0]?.enabled, "which that client connects").toBe(true)
  })

  it("keeps a comment a person wrote into the file", async () => {
    await fs.writeFile(files, `{\n  // a person's own note\n  "mcpServers": {}\n}\n`, "utf8")
    await provider!.install(io, "acme", "second", {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@x/second"],
      env: {},
    })
    expect(
      await fs.readFile(files, "utf8"),
      "a write into a file a person edited keeps the comment"
    ).toContain("// a person's own note")
  })

  it("takes the second server out, leaving the file as it was", async () => {
    await provider!.uninstall(io, "acme", "second")
    expect(await fs.readFile(files, "utf8"), "taking it out leaves the file as it was").toBe(
      `{\n  // a person's own note\n  "mcpServers": {}\n}\n`
    )
  })

  /* The other side of the same rule: a project that had no file gets one, and
     it keeps an empty box when the last server leaves — the hub cannot tell
     later that it created that file, and guessing would delete a person's. */
  it("writes a file for a project that had none, and leaves it an empty box", async () => {
    await fs.rm(files, { force: true })
    await provider!.install(io, "acme", "only", {
      transport: "stdio",
      command: "npx",
      args: [],
      env: {},
    })
    expect(
      await fs.readFile(files, "utf8"),
      "installing into a project with no file writes one"
    ).toContain("only")

    await provider!.uninstall(io, "acme", "only")
    expect(
      readJsonObject(await fs.readFile(files, "utf8")),
      "and the file it wrote keeps an empty box, not a husk of its own making"
    ).toEqual({ mcpServers: {} })
  })

  it("gives no lines for a name that is not there", async () => {
    const lines = await provider!.locate?.(io, "acme", "second")
    expect(lines ?? null, "a name that is not there has no lines").toBeNull()
  })
})

describe("the words it reports in", () => {
  it("reports its own key for a file it cannot read, and refuses another place by name", async () => {
    await fs.writeFile(files, "not json at all\n", "utf8")
    await expect(provider!.read(io, "acme"), "its own key reaches the caller").rejects.toThrow(
      /acme\.error\.read/
    )
    await expect(
      provider!.read(io, "someone-else"),
      "naming another place is refused with its key"
    ).rejects.toThrow(/acme\.error\.unknownPlace/)
  })

  it("has a pack translating that key", async () => {
    expect(await kernel.ctx.i18n.t("acme.error.read"), "and a pack translates it").not.toBe(
      "acme.error.read"
    )
  })
})
