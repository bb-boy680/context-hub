/**
 * Behaviour check for the disk-backed skill library. It runs the store against
 * a temporary hub home and asserts the catalog contract: the list is served
 * from `index.json`, writes keep it in step with the manifests, an external
 * manifest edit reaches the list through a refresh, and a media reference is
 * either a link the hub leaves alone or a file it stores and deletes with the
 * reference.
 *
 * Run from the package: `node scripts/check-store.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { createFsSkillStore } from "../src/host/skills-fs.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-"))
const root = path.join(home, "skills")
const files = path.join(home, "assets")
console.log(`home: ${home}`)

const store = await createFsSkillStore({ home })

/* An empty root reads as an empty catalog, and the catalog file is written. */
const empty = await store.list()
check("empty root lists nothing", empty.total === 0, empty)
check(
  "catalog file exists after first read",
  (await fs.stat(path.join(root, "index.json")).catch(() => null)) !== null
)

/* Create writes the manifest, the conventional folders, and the catalog row. */
const created = await store.create({
  name: "PDF Extract",
  description: "Extract tables from PDFs and scans",
  tags: ["Documents"],
})
check("create uses a slugged id", created.id === "pdf-extract", created.id)
check("create writes SKILL.md", created.body.length > 0)
check(
  "create makes the conventional folders",
  (
    await Promise.all(
      ["assets", "references", "scripts"].map(async (dir) => {
        const stat = await fs.stat(path.join(root, "pdf-extract", dir)).catch(() => null)
        return stat?.isDirectory() === true
      })
    )
  ).every(Boolean)
)

/* The list comes from the catalog file: the manifest alone does not feed it. */
const listed = await store.list()
check("list returns the created skill", listed.total === 1, listed.total)
check("list carries frontmatter fields", listed.items[0]?.tags[0] === "Documents")

/* Update rewrites the owned frontmatter and keeps hand-written keys. */
const manifest = path.join(root, "pdf-extract", "SKILL.md")
await fs.writeFile(
  manifest,
  `---\nname: pdf-extract\ndescription: Extract tables from PDFs and scans\ntags: [Documents]\nwhenToUse: spreadsheets\n---\n\n# PDF Extract\n\nBody text.\n`,
  "utf8"
)
await store.update("pdf-extract", { tags: ["Documents", "Data"] })
const rewritten = await fs.readFile(manifest, "utf8")
check("update keeps unknown frontmatter keys", rewritten.includes("whenToUse: spreadsheets"))
check("update writes the new tags", rewritten.includes("tags: [Documents, Data]"), rewritten.slice(0, 120))
check("update keeps the body", rewritten.includes("Body text."))

/* The catalog reports the change without a scan. */
const afterUpdate = await store.list()
check("list reflects the new tags", afterUpdate.items[0]?.tags.length === 2)
check("revision advances on every change", afterUpdate.revision > listed.revision)

/* An external edit is invisible until a refresh indexes it. */
const external = path.join(root, "hand-made")
await fs.mkdir(external, { recursive: true })
await fs.writeFile(
  path.join(external, "SKILL.md"),
  /* A byte-order mark is what Windows editors write; it must not hide the block. */
  `\uFEFF---\r\nname: Hand Made\r\ndescription: Added outside the app\r\ntags: [Docs]\r\n---\r\n\r\n# Hand Made\r\n`,
  "utf8"
)
const beforeRefresh = await store.list()
check("external skill is not listed before refresh", beforeRefresh.total === 1, beforeRefresh.total)
await store.refresh()
const afterRefresh = await store.list()
check("refresh indexes the external skill", afterRefresh.total === 2, afterRefresh.total)
check(
  "refresh reads its frontmatter",
  afterRefresh.items.some((item) => item.id === "hand-made" && item.name === "Hand Made")
)

/* Paging is stable and total counts the whole match set. */
const page = await store.list({ offset: 1, limit: 1, sort: "name" })
check("paging slices the rows", page.items.length === 1 && page.total === 2, page)
check("sort by name orders the first page", page.items[0]?.id === "pdf-extract", page.items[0]?.id)
check("a page reports the root it read", page.root.includes("skills"), page.root)
check(
  "tags() lists every category once, sorted",
  (await store.tags()).join(",") === "Data,Docs,Documents",
  await store.tags()
)

/* Filtering matches name or description, case-insensitively. */
const found = await store.list({ q: "EXTRACT" })
check("search matches name and description", found.total === 1, found.total)
const tagged = await store.list({ tag: "Docs" })
check("tag filter selects the right row", tagged.total === 1 && tagged.items[0]?.id === "hand-made")
check("tag filter excludes other rows", (await store.list({ tag: "Data" })).total === 1)
const off = await store.update("hand-made", { enabled: false })
check("update reports the new enabled state", off.enabled === false, off.enabled)
const enabledOnly = await store.list({ enabled: true })
check("enabled filter keeps the other rows", enabledOnly.total === 1 && enabledOnly.items[0]?.id === "pdf-extract", enabledOnly.total)
const disabledOnly = await store.list({ enabled: false })
check("enabled filter selects the switched-off row", disabledOnly.total === 1 && disabledOnly.items[0]?.id === "hand-made", disabledOnly.total)
await store.update("hand-made", { enabled: true })

/* The tab row labels every origin: counts describe the other filters, and the
   origin filter itself only narrows the rows. */
const counted = await store.list()
check("counts report the whole library", counted.counts.all === 2, counted.counts)
check(
  "counts land under their own origin",
  counted.counts.local === 2 && counted.counts.builtin === 0 && counted.counts.registry === 0,
  counted.counts
)
check("a source filter keeps its own rows", (await store.list({ source: "local" })).total === 2)
const noRegistry = await store.list({ source: "registry" })
check("a source filter drops other origins", noRegistry.total === 0 && noRegistry.items.length === 0)
check("counts ignore the origin filter", noRegistry.counts.all === 2, noRegistry.counts)
check("counts follow the tag filter", (await store.list({ tag: "Docs" })).counts.all === 1)

/* A reopened store reads the origin the catalog recorded and filters on it. */
const catalogPath = path.join(root, "index.json")
const recorded = JSON.parse(await fs.readFile(catalogPath, "utf8")) as {
  skills: Record<string, { source: string }>
}
recorded.skills["hand-made"].source = "registry"
await fs.writeFile(catalogPath, `${JSON.stringify(recorded, null, 2)}\n`, "utf8")
const reopened = await createFsSkillStore({ home })
const registryOnly = await reopened.list({ source: "registry" })
check(
  "a recorded origin survives a reopen",
  registryOnly.total === 1 && registryOnly.items[0]?.id === "hand-made",
  registryOnly.items.map((item) => item.id)
)
check(
  "reopened counts follow the recorded origins",
  registryOnly.counts.registry === 1 && registryOnly.counts.local === 1,
  registryOnly.counts
)
check("the workspace tab drops the registry row", (await reopened.list({ source: "local" })).total === 1)
reopened.dispose()

/* A partial patch rewrites only its own line, so the rest of the file survives. */
const before = await store.readFile("hand-made", "SKILL.md")
await store.update("hand-made", { tags: ["Docs", "Safety"] })
const patched = await store.readFile("hand-made", "SKILL.md")
check("a tags-only write keeps the name line", /^name: Hand Made$/m.test(patched), patched.split("\n")[1])
check("a tags-only write keeps the description line", /^description: /m.test(patched))
check("a tags-only write replaces the tags line", /^tags: \[Docs, Safety\]$/m.test(patched))
check("a tags-only write keeps the body", patched.includes("# Hand Made"), patched.slice(-40))
check("the write changes the file", patched !== before)

/* Uploaded bytes land in the hub's asset directory and the record holds the path. */
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const first = await store.putAsset("pdf-extract", new File([png], "cover.png", { type: "image/png" }))
const second = await store.putAsset("pdf-extract", new File([png], "cover.png", { type: "image/png" }))
check("first upload keeps its name", first.ref === "assets/cover.png", first.ref)
check("a taken name gains a suffix", second.ref === "assets/cover-1.png", second.ref)
check("upload reports the kind", first.kind === "image")
const withAssets = await store.get("pdf-extract")
check("assets keep upload order", withAssets.assets.join(",") === "assets/cover.png,assets/cover-1.png", withAssets.assets)
check("the bytes are stored with the hub", (await fs.stat(path.join(files, "cover.png"))).size === png.byteLength)
check("the skill directory keeps no copy", (await fs.readdir(path.join(root, "pdf-extract", "assets"))).length === 0)
check("a stored path is served from the hub route", store.assetUrl("assets/cover.png") === "/hub/files/assets/cover.png", store.assetUrl("assets/cover.png"))

/* Oversize uploads are refused before anything is written. */
let refused = ""
try {
  await store.putAsset("pdf-extract", new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" }))
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("oversize upload is refused with a reason", refused.includes("5 MB"), refused)

/* A remote source stays a link: the hub never reads or copies it. */
const link = await store.addAssetSource(
  "pdf-extract",
  "https://media.example.com/clips/take one.mp4"
)
check("a remote source is recorded as given", link.ref === "https://media.example.com/clips/take one.mp4", link.ref)
check("a remote source reports the kind from its name", link.kind === "video", link.kind)
check("a remote source passes through as its own URL", store.assetUrl(link.ref) === link.ref)
check("a remote source is listed", (await store.get("pdf-extract")).assets.includes(link.ref))
const again = await store.addAssetSource("pdf-extract", link.ref)
check("re-adding a link keeps one entry", again.ref === link.ref, again.ref)
const linked = await store.get("pdf-extract")
check("re-adding a link does not duplicate it", linked.assets.filter((ref) => ref === link.ref).length === 1)
check("no file is written for a link", (await fs.readdir(files)).sort().join(",") === "cover-1.png,cover.png", await fs.readdir(files))

/* A data: source carries its own bytes, so the hub takes it over. */
const inline = await store.addAssetSource(
  "pdf-extract",
  `data:image/png;base64,${Buffer.from(png).toString("base64")}`
)
check("a data: source is stored as a file", inline.ref === "assets/asset.png", inline.ref)
check("a data: source reports the kind its type names", inline.kind === "image", inline.kind)
check("a data: source writes the decoded bytes", (await fs.stat(path.join(files, "asset.png"))).size === png.byteLength)

/* Anything the hub cannot keep is refused with a reason. */
let scheme = ""
try {
  await store.addAssetSource("pdf-extract", "file:///etc/passwd")
} catch (error) {
  scheme = error instanceof Error ? error.message : String(error)
}
check("a non-http source is refused", scheme.includes("http"), scheme)

/* Deleting a reference deletes the file the hub stores for it. */
await store.deleteAsset("pdf-extract", inline.ref)
check("the file is gone from the disk", (await fs.stat(path.join(files, "asset.png")).catch(() => null)) === null)
check("the reference is gone from the record", !(await store.get("pdf-extract")).assets.includes(inline.ref))

await store.deleteAsset("pdf-extract", link.ref)
check(
  "the record keeps the other references",
  (await store.get("pdf-extract")).assets.join(",") === "assets/cover.png,assets/cover-1.png",
  (await store.get("pdf-extract")).assets
)

/* An upload always lands under the hub's asset directory, whatever name it carries. */
const traversing = await store.putAsset(
  "pdf-extract",
  new File([png], "../cover.png", { type: "image/png" })
)
check(
  "upload name keeps only its base name",
  /^assets\/cover(-\d+)?\.png$/.test(traversing.ref),
  traversing.ref
)
check(
  "upload lands inside the asset directory",
  (await fs.stat(path.join(files, "cover.png")).catch(() => null)) !== null
)

/* Path escapes are refused. */
let escaped = ""
try {
  await store.readFile("pdf-extract", "../../../index.json")
} catch (error) {
  escaped = error instanceof Error ? error.message : String(error)
}
check("path escape is refused", escaped.includes("escapes"), escaped)

let unsafe = ""
try {
  await store.deleteAsset("pdf-extract", "../cover.png")
} catch (error) {
  unsafe = error instanceof Error ? error.message : String(error)
}
check("a reference outside the hub is refused", unsafe.includes("escapes"), unsafe)

/* Removing a skill takes the files it references with it. */
await store.remove("pdf-extract")
check("removing a skill deletes the files it referenced", (await fs.readdir(files)).length === 0, await fs.readdir(files))
check("removing a skill deletes its directory", (await fs.stat(path.join(root, "pdf-extract")).catch(() => null)) === null)
check("removing a skill drops the row", (await store.list()).items.every((item) => item.id !== "pdf-extract"))

/* File bodies are read from disk, not from the catalog. */
await store.writeFile("hand-made", "references/notes.md", "# Notes\n")
check("written file reads back", (await store.readFile("hand-made", "references/notes.md")) === "# Notes\n")
check(
  "file tree lists the written file",
  (await store.get("hand-made")).files.some((file) => file.path === "references/notes.md")
)

/* Remove deletes the directory and its catalog row. */
await store.remove("hand-made")
check("remove drops the row", (await store.list()).total === 0)
check(
  "remove deletes the directory",
  (await fs.stat(path.join(root, "hand-made")).catch(() => null)) === null
)

/* Directory watching reports an external change without an explicit refresh. */
const notified = new Promise<boolean>((resolve) => {
  const timer = setTimeout(() => resolve(false), 3000)
  const unsubscribe = store.subscribe(() => {
    clearTimeout(timer)
    unsubscribe()
    resolve(true)
  })
})
await fs.mkdir(path.join(root, "watched"), { recursive: true })
await fs.writeFile(
  path.join(root, "watched", "SKILL.md"),
  `---\nname: Watched\ndescription: Arrives by watching\n---\n\n# Watched\n`,
  "utf8"
)
check("directory watching notifies the caller", await notified)
check("watched skill reaches the list", (await store.list()).total === 1)

store.dispose()
await fs.rm(root, { recursive: true, force: true })
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
