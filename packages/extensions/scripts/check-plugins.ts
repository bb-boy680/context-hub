/**
 * Behaviour check for the plugin space and the loader that reads it. It builds
 * a temporary hub home with one loadable plugin and three that must be refused,
 * then asserts what the kernel would see: which plugins load, what their
 * definitions carry, that the entry module receives React and the icon table,
 * and that a refusal names its reason instead of throwing.
 *
 * Run from the package: `node scripts/check-plugins.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { assertPluginId, EXTENSION_DIR, EXTENSION_RECORDS, EXTENSION_ROUTE, LEGACY_EXTENSION_DIR } from "@workspace/core/plugins"
import { createFsPluginStore } from "@workspace/core/host/plugins"
import { discoverPlugins } from "../src/plugin.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

/** Write one plugin directory carrying a manifest and an entry module. */
async function writePlugin(
  root: string,
  id: string,
  manifest: string,
  entry?: string
): Promise<void> {
  const dir = path.join(root, id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "plugin.json"), manifest, "utf8")
  /* A plugin directory is an npm-style package, so Node reads its entry as ESM. */
  await fs.writeFile(path.join(dir, "package.json"), `{ "type": "module" }\n`, "utf8")
  if (entry !== undefined) await fs.writeFile(path.join(dir, "index.js"), entry, "utf8")
}

const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-plugins-"))
console.log(`home: ${home}`)

const extensions = path.join(home, EXTENSION_DIR)
/* The space used to be `<home>/plugins`, which agent plugin packs now own, so a
   home from before the move is written here: two extension directories, one
   pack that must stay put, and a records file. */
const legacy = path.join(home, LEGACY_EXTENSION_DIR)
await writePlugin(
  legacy,
  "acme.legacy",
  JSON.stringify({ id: "acme.legacy", name: "Legacy", version: "0.9.0", apiVersion: "^0.1" }),
  "export function activate() {}\n"
)
await writePlugin(legacy, "acme.pack", JSON.stringify({ name: "acme.pack", version: "1.0.0" }))
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
  JSON.stringify({
    id: "acme.hello",
    name: "Hello",
    version: "1.0.0",
    apiVersion: "^0.1",
    description: "Adds a page.",
    icon: "sparkles",
    permissions: ["storage.self"],
  }),
  `export function activate(scope) {
     globalThis.__scope = { react: typeof scope.react?.createElement === "function", icons: typeof scope.icons?.sparkles, icon: typeof scope.icon("server"), ui: scope.ui !== undefined }
     scope.contribute("nav", { path: "/hello", labelKey: "nav.hello", icon: scope.icon("sparkles"), group: "assets", order: 25 })
   }\n`
)
await writePlugin(
  extensions,
  "acme.mismatch",
  JSON.stringify({ id: "acme.other", name: "Mismatch", version: "1.0.0", apiVersion: "^0.1" }),
  "export function activate() {}\n"
)
await writePlugin(
  extensions,
  "acme.future",
  JSON.stringify({ id: "acme.future", name: "Future", version: "1.0.0", apiVersion: "^9.9" })
)
await writePlugin(
  extensions,
  "acme.empty",
  JSON.stringify({ id: "acme.empty", name: "Empty", version: "1.0.0", apiVersion: "^0.1" }),
  "export const nothing = true\n"
)
/* A directory with no manifest at all is not a plugin. */
await fs.mkdir(path.join(extensions, "acme.notes"), { recursive: true })

const store = createFsPluginStore(home)
const ids = await store.list()
check(
  "only directories with a manifest are plugins",
  ids.join(",") === "acme.empty,acme.future,acme.hello,acme.legacy,acme.mismatch",
  ids
)

/* The first read moved the old space across, and left the agent plugin pack. */
check(
  "an extension directory moved to `<home>/extensions`",
  (await fs.stat(path.join(extensions, "acme.legacy")).catch(() => null)) !== null
)
check(
  "a directory that is not an extension stayed under `<home>/plugins`",
  (await fs.stat(path.join(legacy, "acme.pack")).catch(() => null)) !== null
)
check(
  "the old directory keeps nothing else",
  (await fs.readdir(legacy)).join(",") === "acme.pack",
  await fs.readdir(legacy)
)
check(
  "the old records file moved with the extensions",
  (await store.records())["acme.legacy"]?.version === "0.9.0"
)

const found = await discoverPlugins({
  source: store,
  /* The loader builds a route; this check reads the same file the route would serve. */
  importModule: (url) =>
    import(
      pathToFileURL(
        path.join(extensions, decodeURIComponent(url.slice(EXTENSION_ROUTE.length + 1)))
      ).href
    ) as Promise<unknown>,
})
const byId = new Map(found.map((plugin) => [plugin.id, plugin]))

check("every plugin is reported", found.length === 5, found.length)
check("a valid plugin loads", byId.get("acme.hello")?.definition !== undefined, byId.get("acme.hello"))
check(
  "the migrated extension loads too",
  byId.get("acme.legacy")?.definition !== undefined,
  byId.get("acme.legacy")
)
check(
  "the manifest reaches the kernel definition",
  byId.get("acme.hello")?.definition?.manifest.name === "Hello" &&
    byId.get("acme.hello")?.definition?.manifest.version === "1.0.0",
  byId.get("acme.hello")?.definition?.manifest
)
check(
  "the icon name resolves to a component",
  byId.get("acme.hello")?.definition?.manifest.icon != null
)
check(
  "an id that disagrees with its directory is refused",
  (byId.get("acme.mismatch")?.problem ?? "").includes("does not match"),
  byId.get("acme.mismatch")?.problem
)
check(
  "an incompatible apiVersion is refused before its code runs",
  (byId.get("acme.future")?.problem ?? "").includes("not compatible"),
  byId.get("acme.future")?.problem
)
check(
  "an entry module without activate is refused",
  (byId.get("acme.empty")?.problem ?? "").includes("activate"),
  byId.get("acme.empty")?.problem
)

/* Activating the loaded plugin is what the kernel does when it is enabled. */
const contributions: [string, unknown][] = []
byId.get("acme.hello")?.definition?.activate?.({
  ctx: { get: () => ({ Button: "kit" }) },
  host: { form: "Test" },
  contribute: (point, value) => contributions.push([point, value]),
} as never)
const scope = (globalThis as { __scope?: Record<string, unknown> }).__scope
check("the entry module receives React", scope?.react === true, scope)
check("the entry module receives the icon table", scope?.icons === "object", scope)
check("icon names resolve on the scope", scope?.icon === "object", scope)
check("the form's UI kit arrives as hub.ui", scope?.ui === true, scope)
check(
  "its contribution arrives with a real icon component",
  contributions.length === 1 &&
    contributions[0]?.[0] === "nav" &&
    (contributions[0]?.[1] as { icon?: unknown }).icon != null,
  contributions
)
delete (globalThis as { __scope?: unknown }).__scope

/* Ids become directory names, so separators and reserved names are refused. */
const refused = ["", "..", "a/b", "a\\b", "con", "with space", ".hidden", "Hub", "a".repeat(97)]
for (const id of refused) {
  let message = ""
  try {
    assertPluginId(id)
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
  }
  check(`a directory-unsafe id is refused: ${JSON.stringify(id.slice(0, 12))}`, message !== "", message)
}
check("a dotted id with a capitalised segment is allowed", assertPluginId("hub.locale.zh-CN") === "hub.locale.zh-CN")
check("a kebab-case segment is allowed", assertPluginId("acme.hello-world") === "acme.hello-world")

/* Reads stay inside the plugin directory. */
let escaped = ""
try {
  await store.read("acme.hello", "../../index.json")
} catch (error) {
  escaped = error instanceof Error ? error.message : String(error)
}
check("a read cannot leave the plugin directory", escaped.includes("escapes"), escaped)

let outside = ""
try {
  await store.write("acme.hello", "../../escaped.txt", "nope")
} catch (error) {
  outside = error instanceof Error ? error.message : String(error)
}
check("a write cannot leave the plugin directory", outside.includes("escapes"), outside)
check(
  "nothing landed outside the plugin directory",
  (await fs.stat(path.join(home, "escaped.txt")).catch(() => null)) === null
)

/* Install records say where a plugin came from; removing it forgets both. */
await store.setRecord("acme.hello", {
  version: "1.0.0",
  source: "https://plugins.example.com/acme.hello-1.0.0.tgz",
  installedAt: "2026-10-08T00:00:00.000Z",
})
check("a record round-trips", (await store.records())["acme.hello"]?.version === "1.0.0")
await fs.writeFile(path.join(extensions, EXTENSION_RECORDS), "{not json", "utf8")
check("an unreadable records file reads as none", Object.keys(await store.records()).length === 0)
await store.setRecord("acme.hello", { version: "1.0.1", source: "local", installedAt: "2026-10-08T00:00:00.000Z" })
check("the records file is rewritten whole", (await store.records())["acme.hello"]?.version === "1.0.1")

await store.remove("acme.hello")
check("remove deletes the directory", (await fs.stat(path.join(extensions, "acme.hello")).catch(() => null)) === null)
check("remove forgets the record", (await store.records())["acme.hello"] === undefined)
check(
  "the other plugins stay",
  (await store.list()).join(",") === "acme.empty,acme.future,acme.legacy,acme.mismatch"
)

/* A home with the old directory but nothing in it — the shape a machine holds
   when the space was never used — is handed over empty to the plugin library. */
const fresh = await fs.mkdtemp(path.join(tmpdir(), "context-hub-extensions-"))
await fs.mkdir(path.join(fresh, LEGACY_EXTENSION_DIR), { recursive: true })
const freshStore = createFsPluginStore(fresh)
check("an unused old directory lists as none", (await freshStore.list()).join(",") === "")
check(
  "an unused old directory is replaced by the new one",
  (await fs.stat(path.join(fresh, EXTENSION_DIR)).catch(() => null)) !== null &&
    (await fs.stat(path.join(fresh, LEGACY_EXTENSION_DIR)).catch(() => null)) === null
)
await fs.rm(fresh, { recursive: true, force: true })

await fs.rm(home, { recursive: true, force: true })
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
