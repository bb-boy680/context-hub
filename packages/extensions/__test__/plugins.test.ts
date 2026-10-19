/**
 * Behaviour of the plugin space on disk and the loader that reads it: which
 * directories count as plugins, what a loaded one carries, what its entry module
 * is handed, and which ones are refused with a reason instead of throwing.
 *
 * The home is temporary, so a case may write freely. Every case that needs the
 * space built a particular way builds it in `beforeAll`; the ones that mutate it
 * run in file order, as they did when this was a script.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  assertPluginId,
  EXTENSION_DIR,
  EXTENSION_RECORDS,
  EXTENSION_ROUTE,
  LEGACY_EXTENSION_DIR,
} from "@context-hub/core/plugins"
import { createFsPluginStore } from "@context-hub/core/host/plugins"
import { discoverPlugins } from "../src/plugin.ts"

/**
 * The key the fixture plugin writes its scope under. Namespaced because a test
 * file no longer has the process to itself: globalThis is shared with whatever
 * else a worker is running.
 */
const SCOPE_KEY = "__contextHubPluginScope"

/** Write one plugin directory carrying a manifest and an entry module. */
async function writePlugin(
  root: string,
  id: string,
  manifest: string,
  entry?: string,
  packageDocument: Record<string, unknown> = {
    type: "module",
    version: "1.0.0",
    main: "index.js",
  }
): Promise<void> {
  const dir = path.join(root, id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "plugin.yaml"), manifest, "utf8")
  /* A plugin directory is an npm-style package, so Node reads its entry as ESM. */
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify(packageDocument), "utf8")
  if (entry !== undefined) await fs.writeFile(path.join(dir, "index.js"), entry, "utf8")
}

const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-plugins-"))
const extensions = path.join(home, EXTENSION_DIR)
/* The space used to be `<home>/plugins`, which agent plugin packs now own, so a
   home from before the move is written here: two extension directories, one
   pack that must stay put, and a records file. */
const legacy = path.join(home, LEGACY_EXTENSION_DIR)

let store: ReturnType<typeof createFsPluginStore>

beforeAll(async () => {
  await writePlugin(
    legacy,
    "acme.legacy",
    'id: acme.legacy\nname: Legacy\nengines:\n  contextHub: ">=0.0.1 <0.7.0"\n',
    "export function apply() {}\n"
  )
  /* An agent pack carries `plugin.json`, not `plugin.yaml`; it must stay put. */
  await fs.mkdir(path.join(legacy, "acme.pack"), { recursive: true })
  await fs.writeFile(
    path.join(legacy, "acme.pack", "plugin.json"),
    JSON.stringify({ name: "acme.pack", version: "1.0.0" }),
    "utf8"
  )
  await fs.writeFile(
    path.join(legacy, EXTENSION_RECORDS),
    JSON.stringify({
      "acme.legacy": { version: "0.9.0", source: "local", installedAt: "2026-01-01T00:00:00.000Z" },
    }),
    "utf8"
  )

  await writePlugin(
    extensions,
    "acme.hello",
    [
      "id: acme.hello",
      "name: Hello",
      'engines:\n  contextHub: ">=0.0.1 <0.7.0"',
      "description: Adds a page.",
      "icon: sparkles",
      "permissions: [storage.self]",
    ].join("\n") + "\n",
    `export function apply(ctx) {
       globalThis["${SCOPE_KEY}"] = { react: typeof ctx.react?.createElement === "function", icons: typeof ctx.icons?.sparkles, icon: typeof ctx.icon("server"), ui: ctx.ui !== undefined }
       ctx.nav.register({ path: "/hello", labelKey: "nav.hello", icon: ctx.icon("sparkles"), group: "assets", order: 25 })
     }\n`
  )
  await writePlugin(
    extensions,
    "acme.mismatch",
    'id: acme.other\nname: Mismatch\nengines:\n  contextHub: ">=0.0.1 <0.7.0"\n',
    "export function apply() {}\n"
  )
  await writePlugin(
    extensions,
    "acme.future",
    'id: acme.future\nname: Future\nengines:\n  contextHub: ">=9.9.0"\n'
  )
  await writePlugin(
    extensions,
    "acme.empty",
    'id: acme.empty\nname: Empty\nengines:\n  contextHub: ">=0.0.1 <0.7.0"\n',
    "export const nothing = true\n"
  )
  /* A plugin with no package.json keeps loading with the 0.0.0 / index.js fallback. */
  await writePlugin(
    extensions,
    "acme.bare",
    'id: acme.bare\nname: Bare\nengines:\n  contextHub: ">=0.0.1 <0.7.0"\n',
    "export function apply() {}\n",
    {}
  )
  await fs.rm(path.join(extensions, "acme.bare", "package.json"))
  /* A packed plugin: version and entry come from package.json, and its icon is
     a file served from the extension space. */
  await writePlugin(
    extensions,
    "acme.packed",
    [
      "id: acme.packed",
      "name:",
      "  en: Packed",
      '  "zh-cn": 打包',
      'engines:\n  contextHub: ">=0.0.1 <0.7.0"',
      "description:",
      "  en: A packed plugin.",
      '  "zh-cn": 一个打包插件。',
      "icon: assets/icon.svg",
    ].join("\n") + "\n",
    undefined,
    { type: "module", version: "2.0.0", main: "lib/index.js" }
  )
  await fs.mkdir(path.join(extensions, "acme.packed", "lib"), { recursive: true })
  await fs.writeFile(
    path.join(extensions, "acme.packed", "lib", "index.js"),
    "export function apply() {}\n",
    "utf8"
  )
  /* A directory with no manifest at all is not a plugin. */
  await fs.mkdir(path.join(extensions, "acme.notes"), { recursive: true })

  /* Built after the space exists: the store migrates the old directory as it is
     constructed, so one made before these fixtures would move nothing. */
  store = createFsPluginStore(home)
})

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

describe("the plugin space", () => {
  /* The first read moves the old space across, and leaves the agent plugin pack. */
  let ids: string[]

  beforeAll(async () => {
    ids = await store.list()
  })

  it("counts only directories with a manifest as plugins", () => {
    expect(ids).toEqual([
      "acme.bare",
      "acme.empty",
      "acme.future",
      "acme.hello",
      "acme.legacy",
      "acme.mismatch",
      "acme.packed",
    ])
  })

  it("moved an extension directory to `<home>/extensions`", async () => {
    expect(await fs.stat(path.join(extensions, "acme.legacy")).catch(() => null)).not.toBeNull()
  })

  it("left a directory that is not an extension under `<home>/plugins`", async () => {
    expect(await fs.stat(path.join(legacy, "acme.pack")).catch(() => null)).not.toBeNull()
  })

  it("left nothing else in the old directory", async () => {
    expect(await fs.readdir(legacy)).toEqual(["acme.pack"])
  })

  it("moved the records file with the extensions", async () => {
    expect((await store.records())["acme.legacy"]?.version).toBe("0.9.0")
  })
})

describe("discovery", () => {
  let byId: Map<string, Awaited<ReturnType<typeof discoverPlugins>>[number]>

  beforeAll(async () => {
    const found = await discoverPlugins({
      source: store,
      hubVersion: "0.5.0",
      /* The loader builds a route; this reads the same file the route would serve. */
      importModule: (url) =>
        import(
          pathToFileURL(
            path.join(extensions, decodeURIComponent(url.slice(EXTENSION_ROUTE.length + 1)))
          ).href
        ) as Promise<unknown>,
    })
    byId = new Map(found.map((plugin) => [plugin.id, plugin]))
  })

  it("reports every plugin", () => {
    expect(byId.size).toBe(7)
  })

  it("loads a valid plugin", () => {
    expect(byId.get("acme.hello")?.problem).toBeUndefined()
  })

  it("loads the migrated extension too", () => {
    expect(byId.get("acme.legacy")?.problem).toBeUndefined()
  })

  it("carries the manifest to the kernel definition", () => {
    expect(byId.get("acme.hello")?.module?.manifest).toMatchObject({
      name: "Hello",
      version: "1.0.0",
    })
  })

  it("falls back to 0.0.0 and index.js when package.json is absent", () => {
    expect(byId.get("acme.bare")?.module?.manifest.version).toBe("0.0.0")
  })

  it("reads the version and entry from package.json", () => {
    expect(byId.get("acme.packed")?.module?.manifest.version).toBe("2.0.0")
    expect(byId.get("acme.packed")?.problem).toBeUndefined()
  })

  it("keeps a localized name and description for the UI", () => {
    expect(byId.get("acme.packed")?.module?.manifest.name).toEqual({
      en: "Packed",
      "zh-cn": "打包",
    })
    expect(byId.get("acme.packed")?.module?.manifest.description).toEqual({
      en: "A packed plugin.",
      "zh-cn": "一个打包插件。",
    })
  })

  it("draws a relative image icon from the extension space", () => {
    const icon = byId.get("acme.packed")?.module?.manifest.icon as unknown as (props: {
      className?: string
    }) => { type?: unknown; props?: { src?: string; className?: string } }
    const element = icon({ className: "size-5" })
    expect(element.type).toBe("img")
    expect(element.props?.src).toBe("/hub/extensions/acme.packed/assets/icon.svg")
    expect(element.props?.className).toBe("size-5")
  })

  it("resolves the icon name to a component", () => {
    expect(byId.get("acme.hello")?.module?.manifest.icon).toBeDefined()
  })

  it("refuses an id that disagrees with its directory", () => {
    expect(byId.get("acme.mismatch")?.problem).toContain("does not match")
  })

  it("keeps an incompatible plugin's row without importing its code", () => {
    const future = byId.get("acme.future")
    expect(future?.problem).toBeUndefined()
    expect(future?.module?.manifest.engines).toEqual({ contextHub: ">=9.9.0" })
    /* No entry file exists for this fixture, so a successful read proves no import. */
    expect(future?.module?.apply).toBeUndefined()
    expect(future?.module?.stored).toBe(true)
  })

  it("refuses an entry module with no apply", () => {
    expect(byId.get("acme.empty")?.problem).toContain("apply")
  })

  /* Applying the loaded plugin is what the kernel does when it is enabled: a
     plugin's own context, plus what a directory that imports nothing still needs.
     The points and `hub.ui` are stand-ins here, because this is about what
     `discoverPlugins` hands over, not about a kernel. */
  describe("a loaded plugin, applied", () => {
    const contributions: [string, unknown][] = []
    let scope: Record<string, unknown> | undefined

    beforeAll(() => {
      const nav = { register: (value: unknown) => contributions.push(["nav", value]) }
      ;(globalThis as Record<string, unknown>)[SCOPE_KEY] = undefined
      byId.get("acme.hello")?.module?.apply?.({
        get: (name: string) => (name === "hub.ui" ? { Button: "kit" } : undefined),
        nav,
        react: { createElement: () => null },
        icons: { sparkles: () => null },
        icon: () => () => null,
        ui: { Button: "kit" },
      } as never)
      scope = (globalThis as Record<string, unknown>)[SCOPE_KEY] as Record<string, unknown>
      delete (globalThis as Record<string, unknown>)[SCOPE_KEY]
    })

    it("receives what it cannot import", () => {
      expect(scope?.react, "React").toBe(true)
      expect(scope?.icons, "the icon table").toBe("object")
      expect(scope?.icon, "icon names resolve on the context").toBe("object")
      expect(scope?.ui, "the form's UI kit as hub.ui").toBe(true)
    })

    it("contributes with a real icon component", () => {
      expect(contributions).toHaveLength(1)
      expect(contributions[0]?.[0]).toBe("nav")
      expect((contributions[0]?.[1] as { icon?: unknown }).icon).toBeDefined()
    })
  })
})

/* Ids become directory names, so separators and reserved names are refused. */
const UNSAFE_IDS = ["", "..", "a/b", "a\\b", "con", "with space", ".hidden", "_runtime", "Hub", "a".repeat(97)]

describe("plugin ids", () => {
  it.each(UNSAFE_IDS)("refuses %j", (id) => {
    expect(() => assertPluginId(id)).toThrow()
  })

  it("allows a dotted id with a capitalised segment", () => {
    expect(assertPluginId("hub.locale.zh-CN")).toBe("hub.locale.zh-CN")
  })

  it("allows a kebab-case segment", () => {
    expect(assertPluginId("acme.hello-world")).toBe("acme.hello-world")
  })
})

/* Reads stay inside the plugin directory. */
describe("a path that leaves the plugin directory", () => {
  it("refuses a read", async () => {
    await expect(store.read("acme.hello", "../../index.json")).rejects.toThrow(/escapes/)
  })

  it("refuses a write", async () => {
    await expect(store.write("acme.hello", "../../escaped.txt", "nope")).rejects.toThrow(
      /escapes/
    )
  })

  it("landed nothing outside", async () => {
    expect(await fs.stat(path.join(home, "escaped.txt")).catch(() => null)).toBeNull()
  })
})

describe("install records", () => {
  it("tell where a plugin came from", async () => {
    await store.setRecord("acme.hello", {
      version: "1.0.0",
      source: "https://plugins.example.com/acme.hello-1.0.0.tgz",
      installedAt: "2026-10-08T00:00:00.000Z",
    })
    expect((await store.records())["acme.hello"]?.version).toBe("1.0.0")
  })

  it("read as none when the file cannot be parsed", async () => {
    await fs.writeFile(path.join(extensions, EXTENSION_RECORDS), "{not json", "utf8")
    expect(await store.records()).toEqual({})
  })

  it("are rewritten whole", async () => {
    await store.setRecord("acme.hello", {
      version: "1.0.1",
      source: "local",
      installedAt: "2026-10-08T00:00:00.000Z",
    })
    expect((await store.records())["acme.hello"]?.version).toBe("1.0.1")
  })
})

/* Removing a plugin forgets both the directory and the record; the others stay. */
describe("removing a plugin", () => {
  beforeAll(async () => {
    await store.remove("acme.hello")
  })

  it("deletes the directory", async () => {
    expect(await fs.stat(path.join(extensions, "acme.hello")).catch(() => null)).toBeNull()
  })

  it("forgets the record", async () => {
    expect((await store.records())["acme.hello"]).toBeUndefined()
  })

  it("leaves the other plugins", async () => {
    expect(await store.list()).toEqual([
      "acme.bare",
      "acme.empty",
      "acme.future",
      "acme.legacy",
      "acme.mismatch",
      "acme.packed",
    ])
  })
})

/* A home with the old directory but nothing in it — the shape a machine holds
   when the space was never used — is handed over empty to the plugin library. */
describe("a home that never used the old directory", () => {
  let fresh: string

  beforeAll(async () => {
    fresh = await fs.mkdtemp(path.join(tmpdir(), "context-hub-extensions-"))
    await fs.mkdir(path.join(fresh, LEGACY_EXTENSION_DIR), { recursive: true })
  })

  afterAll(async () => {
    await fs.rm(fresh, { recursive: true, force: true })
  })

  it("lists nothing", async () => {
    expect(await createFsPluginStore(fresh).list()).toEqual([])
  })

  it("is replaced by the new one", async () => {
    await createFsPluginStore(fresh).list()
    expect(await fs.stat(path.join(fresh, EXTENSION_DIR)).catch(() => null)).not.toBeNull()
    expect(await fs.stat(path.join(fresh, LEGACY_EXTENSION_DIR)).catch(() => null)).toBeNull()
  })
})
