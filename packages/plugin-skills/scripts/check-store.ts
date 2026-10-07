/**
 * Behaviour check for the disk-backed skill library. It runs the store against
 * a temporary root and asserts the catalog contract: the list is served from
 * `index.json`, writes keep it in step with the manifests, and an external
 * manifest edit reaches the list through a refresh.
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

const root = await fs.mkdtemp(path.join(tmpdir(), "context-hub-skills-"))
console.log(`root: ${root}`)

const store = await createFsSkillStore(root)

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

/* A partial patch rewrites only its own line, so the rest of the file survives. */
const before = await store.readFile("hand-made", "SKILL.md")
await store.update("hand-made", { tags: ["Docs", "Safety"] })
const patched = await store.readFile("hand-made", "SKILL.md")
check("a tags-only write keeps the name line", /^name: Hand Made$/m.test(patched), patched.split("\n")[1])
check("a tags-only write keeps the description line", /^description: /m.test(patched))
check("a tags-only write replaces the tags line", /^tags: \[Docs, Safety\]$/m.test(patched))
check("a tags-only write keeps the body", patched.includes("# Hand Made"), patched.slice(-40))
check("the write changes the file", patched !== before)

/* Uploads land in assets/, are recorded in order, and are served by URL. */
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const first = await store.putAsset("pdf-extract", new File([png], "cover.png", { type: "image/png" }))
const second = await store.putAsset("pdf-extract", new File([png], "cover.png", { type: "image/png" }))
check("first upload keeps its name", first.file === "cover.png", first.file)
check("a taken name gains a suffix", second.file === "cover-1.png", second.file)
check("upload reports the kind", first.kind === "image")
const withAssets = await store.get("pdf-extract")
check("assets keep upload order", withAssets.assets.join(",") === "cover.png,cover-1.png", withAssets.assets)
check("asset url encodes the skill and file", store.assetUrl("pdf-extract", "cover.png").includes("/pdf-extract/assets/cover.png"))

/* Oversize uploads are refused before anything is written. */
let refused = ""
try {
  await store.putAsset("pdf-extract", new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" }))
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("oversize upload is refused with a reason", refused.includes("5 MB"), refused)

/* Deleting an asset drops it from the record. */
await store.deleteAsset("pdf-extract", "cover.png")
check(
  "deleted asset leaves the record",
  (await store.get("pdf-extract")).assets.join(",") === "cover-1.png"
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
check("unsafe asset name is refused", unsafe.includes("not allowed"), unsafe)

/* An upload always lands under assets/, whatever the client sends as its name. */
const traversing = await store.putAsset(
  "pdf-extract",
  new File([png], "../cover.png", { type: "image/png" })
)
check("upload name is reduced to its base name", traversing.file === "cover.png", traversing.file)
check(
  "upload lands inside assets/",
  (await fs.stat(path.join(root, "pdf-extract", "assets", "cover.png")).catch(() => null)) !== null
)

/* File bodies are read from disk, not from the catalog. */
await store.writeFile("pdf-extract", "references/notes.md", "# Notes\n")
check("written file reads back", (await store.readFile("pdf-extract", "references/notes.md")) === "# Notes\n")
check(
  "file tree lists the written file",
  (await store.get("pdf-extract")).files.some((file) => file.path === "references/notes.md")
)

/* Remove deletes the directory and its catalog row. */
await store.remove("hand-made")
check("remove drops the row", (await store.list()).total === 1)
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
check("watched skill reaches the list", (await store.list()).total === 2)

store.dispose()
await fs.rm(root, { recursive: true, force: true })
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
