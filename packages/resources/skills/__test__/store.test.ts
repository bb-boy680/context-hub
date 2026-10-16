/**
 * Behaviour of the disk-backed skill library, run against a temporary hub home:
 * the list is served from `index.json`, writes keep it in step with the
 * manifests, an external manifest edit reaches the list through a refresh, and
 * a media reference is either a link the hub leaves alone or a file it stores
 * and deletes together with the reference.
 *
 * Nothing here reaches the machine's own home: the hub home is a temporary
 * directory, and both the skills root and the asset directory sit under it.
 *
 * The cases share one store and run in the order they are declared, because
 * each one writes what the next reads.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createFsSkillStore } from "../src/host/skills-fs.ts"
import type { SkillPage, SkillStore } from "../src/store.ts"

/** The stat of a path, or `null` when nothing is there. */
const statOrNull = (target: string) => fs.stat(target).catch(() => null)

/** The bytes of a one-pixel PNG: what every upload in this file carries. */
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

let home: string
let root: string
/* Where the hub keeps the bytes of the media its skills reference. */
let files: string
let store: SkillStore
let reopened: SkillStore | undefined
/* The list read after the create, so a later revision can be compared against it. */
let listed: SkillPage

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-"))
  root = path.join(home, "skills")
  files = path.join(home, "assets")
  /* `userHome` is named here so nothing in this file can reach the real home. */
  store = await createFsSkillStore({ home, userHome: home })
})

afterAll(async () => {
  reopened?.dispose()
  store.dispose()
  await fs.rm(home, { recursive: true, force: true })
})

/* An empty root reads as an empty catalog, and the catalog file is written. */
describe("an empty root", () => {
  it("lists nothing, and writes the catalog file the read came from", async () => {
    const empty = await store.list()
    expect(empty.total, "empty root lists nothing").toBe(0)
    const catalog = await statOrNull(path.join(root, "index.json"))
    expect(catalog, "catalog file exists after first read").not.toBeNull()
  })
})

/* Create writes the manifest, the conventional folders, and the catalog row. */
describe("creating a skill", () => {
  it("takes a slugged id, a starter manifest, and the conventional folders", async () => {
    const created = await store.create({
      name: "PDF Extract",
      description: "Extract tables from PDFs and scans",
      tags: ["Documents"],
    })
    expect(created.id, "create uses a slugged id").toBe("pdf-extract")
    expect(created.body.length, "create writes SKILL.md").toBeGreaterThan(0)
    const conventional = await Promise.all(
      ["assets", "references", "scripts"].map(async (dir) => {
        const stat = await statOrNull(path.join(root, "pdf-extract", dir))
        return stat?.isDirectory() === true
      })
    )
    expect(conventional, "create makes the conventional folders").toEqual([true, true, true])
  })
})

/* The list comes from the catalog file: the manifest alone does not feed it. */
describe("the list", () => {
  it("carries the created skill and its frontmatter", async () => {
    listed = await store.list()
    expect(listed.total, "list returns the created skill").toBe(1)
    expect(listed.items[0]?.tags[0], "list carries frontmatter fields").toBe("Documents")
  })
})

/* Update rewrites the owned frontmatter and keeps hand-written keys. */
describe("updating a skill", () => {
  it("rewrites what it owns, and keeps the keys it does not", async () => {
    const manifest = path.join(root, "pdf-extract", "SKILL.md")
    await fs.writeFile(
      manifest,
      `---\nname: pdf-extract\ndescription: Extract tables from PDFs and scans\ntags: [Documents]\nwhenToUse: spreadsheets\n---\n\n# PDF Extract\n\nBody text.\n`,
      "utf8"
    )
    await store.update("pdf-extract", { tags: ["Documents", "Data"] })
    const rewritten = await fs.readFile(manifest, "utf8")
    expect(rewritten, "update keeps unknown frontmatter keys").toContain(
      "whenToUse: spreadsheets"
    )
    expect(rewritten, "update writes the new tags").toContain("tags: [Documents, Data]")
    expect(rewritten, "update keeps the body").toContain("Body text.")
  })
})

/* The catalog reports the change without a scan. */
describe("the catalog after a write", () => {
  it("carries the new tags, and a later revision", async () => {
    const afterUpdate = await store.list()
    expect(afterUpdate.items[0]?.tags, "list reflects the new tags").toHaveLength(2)
    expect(afterUpdate.revision, "revision advances on every change").toBeGreaterThan(
      listed.revision
    )
  })
})

/* An external edit is invisible until a refresh indexes it. */
describe("an external manifest edit", () => {
  it("is invisible until a refresh indexes it", async () => {
    const external = path.join(root, "hand-made")
    await fs.mkdir(external, { recursive: true })
    await fs.writeFile(
      path.join(external, "SKILL.md"),
      /* A byte-order mark is what Windows editors write; it must not hide the block. */
      `\uFEFF---\r\nname: Hand Made\r\ndescription: Added outside the app\r\ntags: [Docs]\r\n---\r\n\r\n# Hand Made\r\n`,
      "utf8"
    )
    expect((await store.list()).total, "external skill is not listed before refresh").toBe(1)
    await store.refresh()
    const afterRefresh = await store.list()
    expect(afterRefresh.total, "refresh indexes the external skill").toBe(2)
    const handmade = afterRefresh.items.find((item) => item.id === "hand-made")
    expect(handmade?.name, "refresh reads its frontmatter").toBe("Hand Made")
  })
})

/* Paging is stable and total counts the whole match set. */
describe("paging", () => {
  it("slices the rows, orders them by name, and reports the root it read", async () => {
    const page = await store.list({ offset: 1, limit: 1, sort: "name" })
    expect(page.items, "paging slices the rows").toHaveLength(1)
    expect(page.total).toBe(2)
    expect(page.items[0]?.id, "sort by name orders the first page").toBe("pdf-extract")
    expect(page.root, "a page reports the root it read").toContain("skills")
  })

  it("lists every category once, sorted", async () => {
    const tags = await store.tags()
    expect(tags, "tags() lists every category once, sorted").toEqual(["Data", "Docs", "Documents"])
  })
})

/* Filtering matches name or description, case-insensitively. */
describe("filtering", () => {
  it("matches a name whatever its case", async () => {
    const found = await store.list({ q: "EXTRACT" })
    expect(found.total, "search matches name and description").toBe(1)
  })

  it("selects by tag, and leaves the other rows out", async () => {
    const tagged = await store.list({ tag: "Docs" })
    expect(tagged.total, "tag filter selects the right row").toBe(1)
    expect(tagged.items[0]?.id).toBe("hand-made")
    expect((await store.list({ tag: "Data" })).total, "tag filter excludes other rows").toBe(1)
  })

  it("selects by the enabled state, from either side", async () => {
    const off = await store.update("hand-made", { enabled: false })
    expect(off.enabled, "update reports the new enabled state").toBe(false)
    const enabledOnly = await store.list({ enabled: true })
    expect(enabledOnly.total, "enabled filter keeps the other rows").toBe(1)
    expect(enabledOnly.items[0]?.id).toBe("pdf-extract")
    const disabledOnly = await store.list({ enabled: false })
    expect(disabledOnly.total, "enabled filter selects the switched-off row").toBe(1)
    expect(disabledOnly.items[0]?.id).toBe("hand-made")
    await store.update("hand-made", { enabled: true })
  })
})

/* The tab row labels every origin: counts describe the other filters, and the
   origin filter itself only narrows the rows. */
describe("the counts the tab row labels", () => {
  it("describe the whole library, each under its own origin", async () => {
    const counted = await store.list()
    expect(counted.counts.all, "counts report the whole library").toBe(2)
    expect(counted.counts.local, "counts land under their own origin").toBe(2)
    expect(counted.counts.builtin).toBe(0)
    expect(counted.counts.registry).toBe(0)
  })

  it("keep the rows of the origin a filter asks for, and drop the others", async () => {
    expect((await store.list({ source: "local" })).total, "a source filter keeps its own rows")
      .toBe(2)
    const noRegistry = await store.list({ source: "registry" })
    expect(noRegistry.total, "a source filter drops other origins").toBe(0)
    expect(noRegistry.items).toEqual([])
  })

  it("ignore the origin filter, and follow the tag filter", async () => {
    const noRegistry = await store.list({ source: "registry" })
    expect(noRegistry.counts.all, "counts ignore the origin filter").toBe(2)
    expect((await store.list({ tag: "Docs" })).counts.all, "counts follow the tag filter").toBe(1)
  })
})

/* A reopened store reads the origin the catalog recorded and filters on it. */
describe("a reopened store", () => {
  it("reads the recorded origin, and filters on it", async () => {
    const catalogPath = path.join(root, "index.json")
    const recorded = JSON.parse(await fs.readFile(catalogPath, "utf8")) as {
      skills: Record<string, { source: string }>
    }
    recorded.skills["hand-made"].source = "registry"
    await fs.writeFile(catalogPath, `${JSON.stringify(recorded, null, 2)}\n`, "utf8")
    reopened = await createFsSkillStore({ home, userHome: home })
    const registryOnly = await reopened.list({ source: "registry" })
    expect(registryOnly.total, "a recorded origin survives a reopen").toBe(1)
    expect(registryOnly.items[0]?.id).toBe("hand-made")
    expect(registryOnly.counts.registry, "reopened counts follow the recorded origins").toBe(1)
    expect(registryOnly.counts.local).toBe(1)
    expect(
      (await reopened.list({ source: "local" })).total,
      "the workspace tab drops the registry row"
    ).toBe(1)
  })
})

/* A partial patch rewrites only its own line, so the rest of the file survives. */
describe("a tags-only patch", () => {
  it("rewrites the tags line and leaves the rest of the file alone", async () => {
    const before = await store.readFile("hand-made", "SKILL.md")
    await store.update("hand-made", { tags: ["Docs", "Safety"] })
    const patched = await store.readFile("hand-made", "SKILL.md")
    expect(patched, "a tags-only write keeps the name line").toMatch(/^name: Hand Made$/m)
    expect(patched, "a tags-only write keeps the description line").toMatch(/^description: /m)
    expect(patched, "a tags-only write replaces the tags line").toMatch(/^tags: \[Docs, Safety\]$/m)
    expect(patched, "a tags-only write keeps the body").toContain("# Hand Made")
    expect(patched, "the write changes the file").not.toBe(before)
  })
})

/* Uploaded bytes land in the hub's asset directory and the record holds the path. */
describe("an uploaded file", () => {
  it("is stored under its own name and a digest of its bytes, recorded once", async () => {
    const first = await store.putAsset(
      "pdf-extract",
      new File([PNG], "cover.png", { type: "image/png" })
    )
    const second = await store.putAsset(
      "pdf-extract",
      new File([PNG], "cover.png", { type: "image/png" })
    )
    expect(first.ref, "an upload is stored under its own name and a digest of its bytes").toBe(
      "assets/pdf-extract-cover-4c4b6a3b.png"
    )
    expect(second.ref, "uploading the same bytes again reuses that file").toBe(first.ref)
    expect(first.kind, "upload reports the kind").toBe("image")
    const withAssets = await store.get("pdf-extract")
    expect(withAssets.assets, "the same asset is recorded once").toEqual([
      "assets/pdf-extract-cover-4c4b6a3b.png",
    ])
  })

  it("keeps the bytes with the hub, and is served from the hub route", async () => {
    const stored = path.join(files, "pdf-extract-cover-4c4b6a3b.png")
    expect((await fs.stat(stored)).size, "the bytes are stored with the hub").toBe(PNG.byteLength)
    expect(
      await fs.readdir(path.join(root, "pdf-extract", "assets")),
      "the skill directory keeps no copy"
    ).toEqual([])
    expect(
      store.assetUrl("assets/pdf-extract-cover-4c4b6a3b.png"),
      "a stored path is served from the hub route"
    ).toBe("/hub/files/assets/pdf-extract-cover-4c4b6a3b.png")
  })
})

/* Two different pictures under one name stay two files. */
describe("two pictures under one name", () => {
  it("are a second file, leaving the first untouched", async () => {
    const other = await store.putAsset(
      "pdf-extract",
      new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 11])], "cover.png", {
        type: "image/png",
      })
    )
    expect(other.ref, "different bytes under one name are a second file").not.toBe(
      "assets/pdf-extract-cover-4c4b6a3b.png"
    )
    const first = await statOrNull(path.join(files, "pdf-extract-cover-4c4b6a3b.png"))
    expect(first, "and the first file is untouched").not.toBeNull()
  })
})

/* Oversize uploads are refused before anything is written. */
describe("an oversize upload", () => {
  it("is refused with a reason", async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" })
    await expect(store.putAsset("pdf-extract", big)).rejects.toThrow(/5 MB/)
  })
})

/* A remote source stays a link: the hub never reads or copies it. */
describe("a remote source", () => {
  const url = "https://media.example.com/clips/take one.mp4"

  it("is recorded as given, with the kind its name names", async () => {
    const link = await store.addAssetSource("pdf-extract", url)
    expect(link.ref, "a remote source is recorded as given").toBe(url)
    expect(link.kind, "a remote source reports the kind from its name").toBe("video")
    expect(store.assetUrl(link.ref), "a remote source passes through as its own URL").toBe(link.ref)
    expect((await store.get("pdf-extract")).assets, "a remote source is listed").toContain(link.ref)
  })

  it("keeps one entry when it is added again, and writes no file", async () => {
    const again = await store.addAssetSource("pdf-extract", url)
    expect(again.ref, "re-adding a link keeps one entry").toBe(url)
    const linked = await store.get("pdf-extract")
    expect(
      linked.assets.filter((ref) => ref === url),
      "re-adding a link does not duplicate it"
    ).toHaveLength(1)
    /* Sorted: a directory listing has no order of its own to lean on. */
    expect(
      (await fs.readdir(files)).sort(),
      "no file is written for a link"
    ).toEqual(["pdf-extract-cover-4c4b6a3b.png", "pdf-extract-cover-87f2af60.png"])
  })
})

/* A `data:` source carries its own bytes, so the hub takes it over. */
describe("a data: source", () => {
  it("is stored as a file, named for the kind its type names", async () => {
    const inline = await store.addAssetSource(
      "pdf-extract",
      `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`
    )
    expect(inline.ref, "a data: source is stored as a file").toBe(
      "assets/pdf-extract-asset-4c4b6a3b.png"
    )
    expect(inline.kind, "a data: source reports the kind its type names").toBe("image")
    expect(
      (await fs.stat(path.join(files, "pdf-extract-asset-4c4b6a3b.png"))).size,
      "a data: source writes the decoded bytes"
    ).toBe(PNG.byteLength)
  })
})

/* Anything the hub cannot keep is refused with a reason. */
describe("a source the hub cannot keep", () => {
  it("is refused with a reason", async () => {
    await expect(store.addAssetSource("pdf-extract", "file:///etc/passwd")).rejects.toThrow(/http/)
  })
})

/* Deleting a reference deletes the file the hub stores for it. */
describe("deleting a reference", () => {
  it("takes the stored file with it, and keeps the other references", async () => {
    await store.deleteAsset("pdf-extract", "assets/pdf-extract-asset-4c4b6a3b.png")
    const gone = await statOrNull(path.join(files, "pdf-extract-asset-4c4b6a3b.png"))
    expect(gone, "the file is gone from the disk").toBeNull()
    expect(
      (await store.get("pdf-extract")).assets,
      "the reference is gone from the record"
    ).not.toContain("assets/pdf-extract-asset-4c4b6a3b.png")

    await store.deleteAsset("pdf-extract", "https://media.example.com/clips/take one.mp4")
    expect(
      (await store.get("pdf-extract")).assets,
      "the record keeps the other references"
    ).toEqual(["assets/pdf-extract-cover-4c4b6a3b.png", "assets/pdf-extract-cover-87f2af60.png"])
  })
})

/* An upload always lands under the hub's asset directory, whatever name it carries. */
describe("an upload whose name is a path", () => {
  it("cannot escape, and keeps the skill's own words", async () => {
    const traversing = await store.putAsset(
      "pdf-extract",
      new File([PNG], "../cover.png", { type: "image/png" })
    )
    expect(traversing.ref, "a path inside the name cannot escape, and keeps the skill's own words")
      .toBe("assets/pdf-extract-cover-4c4b6a3b.png")
    const landed = await statOrNull(path.join(files, "pdf-extract-cover-4c4b6a3b.png"))
    expect(landed, "upload lands inside the asset directory").not.toBeNull()
  })
})

/* Path escapes are refused. */
describe("a path that escapes", () => {
  it("is refused when a file is read", async () => {
    await expect(store.readFile("pdf-extract", "../../../index.json")).rejects.toThrow(/escapes/)
  })

  it("is refused when a reference is dropped", async () => {
    await expect(store.deleteAsset("pdf-extract", "../cover.png")).rejects.toThrow(
      /asset directory/
    )
  })
})

/* Removing a skill takes the files it references with it. */
describe("removing a skill", () => {
  it("takes the files it referenced with it, and drops the row", async () => {
    await store.remove("pdf-extract")
    expect(await fs.readdir(files), "removing a skill deletes the files it referenced").toEqual([])
    const directory = await statOrNull(path.join(root, "pdf-extract"))
    expect(directory, "removing a skill deletes its directory").toBeNull()
    expect(
      (await store.list()).items.map((item) => item.id),
      "removing a skill drops the row"
    ).not.toContain("pdf-extract")
  })
})

/* File bodies are read from disk, not from the catalog. */
describe("a file written into a skill", () => {
  it("reads back from disk, and reaches the file tree", async () => {
    await store.writeFile("hand-made", "references/notes.md", "# Notes\n")
    const notes = await store.readFile("hand-made", "references/notes.md")
    expect(notes, "written file reads back").toBe("# Notes\n")
    expect(
      (await store.get("hand-made")).files.map((file) => file.path),
      "file tree lists the written file"
    ).toContain("references/notes.md")
  })
})

/* Remove deletes the directory and its catalog row. */
describe("removing the last skill", () => {
  it("drops the row and deletes the directory", async () => {
    await store.remove("hand-made")
    expect((await store.list()).total, "remove drops the row").toBe(0)
    const directory = await statOrNull(path.join(root, "hand-made"))
    expect(directory, "remove deletes the directory").toBeNull()
  })
})

/* Directory watching reports an external change without an explicit refresh. */
describe("directory watching", () => {
  it("notifies the caller, and the watched skill reaches the list", async () => {
    /* A real timer: a watcher that never fires has to fail the case, not hang it. */
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
    expect(await notified, "directory watching notifies the caller").toBe(true)
    expect((await store.list()).total, "watched skill reaches the list").toBe(1)
  })
})
