/**
 * Behaviour check for the plugin library: what reading an address accepts and
 * refuses, what collecting one writes, what a pack's own logo is taken to be,
 * whether a moved source is noticed, and what the registry an agent plugin
 * registers into hands an installer.
 *
 * Everything here runs against a temporary hub home and a git repository made on
 * the spot, so nothing touches a real library, a real agent, or the network.
 *
 * Run from the package: `node scripts/check-plugin-library.ts`
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { folderHash } from "@context-hub/core/host/folder-hash"
import { createAssetStore, type AssetSink } from "@context-hub/core"
import { createFsAssetLibrary } from "@context-hub/core/host"

import {
  hasUpstream,
  installedRevision,
  type PluginOrigin,
} from "../src/contract.ts"
import { formatPluginSource, parsePluginSource } from "../src/inspect.ts"
import { emptyIndex, readIndex, serializeIndex } from "../src/records.ts"
import {
  createPluginInstallerRegistry,
  type PluginHeld,
  type PluginInstaller,
  type PluginTools,
} from "../src/provider.ts"
import { modified, outdated } from "../src/revision.ts"
import { createPluginCollector, type PackUpload } from "../src/host/collect.ts"
import { fetchPlugin, stagingDir } from "../src/host/fetch.ts"
import { readPackContents } from "../src/host/contents.ts"
import { createFsPluginLibrary, listDirectory, readInDirectory } from "../src/host/library.ts"
import { findLogo } from "../src/host/logo.ts"
import { bestPicture, pictureOf } from "../src/pictures.ts"
import { runProgram } from "../src/host/program.ts"
import { createPluginProbe } from "../src/host/probe.ts"
import { createPluginUpdater } from "../src/host/update.ts"

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

function git(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd, windowsHide: true }, (error, stdout) => {
      if (error === null) resolve(String(stdout))
      else reject(error)
    })
  })
}

/** Write one plugin pack: a manifest, a skill, and a command. */
async function writePack(
  dir: string,
  version: string,
  name = "acme-hello",
  body = "Say hello."
): Promise<void> {
  await fs.mkdir(path.join(dir, ".claude-plugin"), { recursive: true })
  await fs.mkdir(path.join(dir, "skills", "hello"), { recursive: true })
  await fs.mkdir(path.join(dir, "commands"), { recursive: true })
  await fs.writeFile(
    path.join(dir, ".claude-plugin", "plugin.json"),
    `${JSON.stringify(
      { name, version, description: "Says hello, and nothing else." },
      null,
      2
    )}\n`,
    "utf8"
  )
  await fs.writeFile(
    path.join(dir, "skills", "hello", "SKILL.md"),
    `---\nname: hello\ndescription: Say hello.\n---\n\n${body}\n`,
    "utf8"
  )
  await fs.writeFile(path.join(dir, "commands", "greet.md"), "Say hello.\n", "utf8")
}

/** Put one text file into a pack, so the logo walk has something to find. */
async function writePicture(dir: string, relative: string, text: string): Promise<void> {
  const target = path.join(dir, relative)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, text, "utf8")
}

/**
 * One pack's files the way a page sends them: the path each keeps inside the
 * pack, and its bytes as base64, because the request body is JSON.
 */
async function uploads(dir: string): Promise<PackUpload[]> {
  const found: PackUpload[] = []
  const walk = async (at: string, prefix: string): Promise<void> => {
    for (const entry of await fs.readdir(at, { withFileTypes: true })) {
      const inside = prefix === "" ? entry.name : `${prefix}/${entry.name}`
      const full = path.join(at, entry.name)
      if (entry.isDirectory()) {
        await walk(full, inside)
        continue
      }
      found.push({ path: inside, base64: (await fs.readFile(full)).toString("base64") })
    }
  }
  await walk(dir, "")
  return found
}

const root = await fs.mkdtemp(path.join(tmpdir(), "hub-plugin-check-"))
const home = path.join(root, "hub")
const source = path.join(root, "source")
await fs.mkdir(home, { recursive: true })
await writePack(source, "1.0.0")

console.log("reading an address")

check("owner/repo becomes the repository it names", (() => {
  const spec = parsePluginSource("DietrichGebert/ponytail")
  return spec.kind === "url" && spec.url === "https://github.com/DietrichGebert/ponytail"
})())
check("a repository URL is that repository", (() => {
  const spec = parsePluginSource("https://github.com/owner/repo")
  return spec.kind === "url" && spec.url === "https://github.com/owner/repo"
})())
check("a fragment is the ref", (() => {
  const spec = parsePluginSource("owner/repo#v2")
  return spec.kind === "url" && spec.ref === "v2"
})())
check("an @ on a shorthand is the ref too", (() => {
  const spec = parsePluginSource("owner/repo@v2")
  return spec.kind === "url" && spec.ref === "v2" && spec.url === "https://github.com/owner/repo"
})())
check("both spellings read alike", (() => {
  const hash = parsePluginSource("owner/repo#main")
  const at = parsePluginSource("owner/repo@main")
  return formatPluginSource(hash) === formatPluginSource(at)
})())
check("a host shorthand expands", (() => {
  const spec = parsePluginSource("gitlab:owner/repo")
  return spec.kind === "url" && spec.url === "https://gitlab.com/owner/repo"
})())
/* An scp address carries an `@` for its own reasons, so it must not be read as a
   pinned ref. */
check("an scp address keeps the user's @", (() => {
  const spec = parsePluginSource("git@github.com:owner/repo.git")
  return spec.kind === "url" && spec.url === "git@github.com:owner/repo.git" && spec.ref === undefined
})())
check("a distinct git protocol URL is one", (() => {
  const spec = parsePluginSource("git://example.test/repo.git")
  return spec.kind === "url" && spec.url === "git://example.test/repo.git"
})())
check("an absolute path is a directory", parsePluginSource("/tmp/pack").kind === "local")
check("a windows path is a directory", parsePluginSource("D:\\packs\\x").kind === "local")
check("a file URL is a directory", (() => {
  const spec = parsePluginSource("file:///tmp/pack")
  return spec.kind === "local" && spec.path === "/tmp/pack"
})())
check("an archive URL is an archive", parsePluginSource("https://x.test/p.zip").kind === "archive")
check("a tarball URL is an archive", parsePluginSource("https://x.test/p.tgz").kind === "archive")
check(
  "an address reads back as text",
  formatPluginSource({ kind: "url", url: "https://x.test/r", ref: "v1" }) === "https://x.test/r#v1"
)
check(
  "a subdirectory address reads back as one",
  formatPluginSource({ kind: "git-subdir", url: "https://x.test/r", path: "tools/one" }) ===
    "https://x.test/r/tools/one"
)

/* A relative path is refused because the host's working directory means nothing
   to a person typing into a browser; a bare word is refused because looking a
   name up is a marketplace's job, and this hub takes addresses. */
for (const [what, refused] of [
  ["an empty address", ""],
  ["a relative path", "./relative"],
  ["a parent-relative path", "../up"],
  ["a home shortcut", "~/packs/x"],
  ["a bare name", "airwallex-dev"],
  ["a name with a space", "not an address"],
] as [string, string][]) {
  let message = ""
  try {
    parsePluginSource(refused)
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
  }
  check(`refused: ${what}`, message !== "", message)
  check(`  and the refusal names the address`, !message.includes("plugin source"), message)
}

console.log("records")

/* A record's two answers come from two separate facts: the revision the source
   was at, and the hash of the files that landed. */
const gitOrigin: PluginOrigin = { kind: "url", url: "/tmp/x", revision: "abc1234" }
const pathOrigin: PluginOrigin = { kind: "local", path: source }
const subdirOrigin: PluginOrigin = {
  kind: "git-subdir",
  url: "/tmp/x",
  path: "tools/one",
  revision: "abc1234",
}
check("a git source reports its revision", installedRevision(gitOrigin) === "abc1234")
check("a local directory reports none", installedRevision(pathOrigin) === null)
check("a repository can be asked about", hasUpstream(gitOrigin))
check("a local directory cannot", !hasUpstream(pathOrigin))
/* A subdirectory's revision is the repository's, and what a check would have to
   ask about is the subdirectory's own last commit: this build says it cannot
   answer rather than reporting an update whenever any other directory moves. */
check("a subdirectory is not asked about yet", !hasUpstream(subdirOrigin))
check("its revision still reads back", installedRevision(subdirOrigin) === "abc1234")

const record = {
  name: "acme-hello",
  version: "1.0.0",
  description: "",
  tags: [],
  source: gitOrigin,
  hash: "hash-one",
  assets: [],
  installedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}
check("an unchecked pack is not ahead of anything", !outdated(record))
check(
  "a check that found the same revision is not an update",
  !outdated({ ...record, checked: { at: "now", latest: "abc1234", currentHash: "hash-one" } })
)
check(
  "a check that found a different revision is",
  outdated({ ...record, checked: { at: "now", latest: "def5678", currentHash: "hash-one" } })
)
check(
  "a matching hash is not an edit",
  !modified({ ...record, checked: { at: "now", currentHash: "hash-one" } })
)
check("a different hash is", modified({ ...record, checked: { at: "now", currentHash: "hash-two" } }))

/* The index is durable JSON a person may edit: a record this build cannot use is
   dropped, not fatal to the rest. */
const stored = [
  { name: "good", version: "1", source: { source: "archive", url: "https://x.test/a.tgz" }, hash: "h" },
  { name: "broken" },
  { version: "2", source: { source: "url", url: "u", revision: "r" }, hash: "h" },
  record,
]
const read = readIndex(stored)
check("a usable record is kept", read[0]?.name === "good")
check("a record with no source is dropped", !read.some((one) => one.name === "broken"))
check("a record with no name is dropped", read.length === 2, read.map((one) => one.name))
check("an unreadable file reads as empty", readIndex({ plugins: {} }).length === 0)
check("an empty index is an empty array", emptyIndex().length === 0)
check("an empty file is one empty array", serializeIndex(emptyIndex()) === "[]\n")

/* The four words were rewritten once: a repository was `git`, a directory here
   was `path`, and an archive's validator was `etag`. A library collected by that
   build has to read back as the words this one stores, or a person's packs would
   be dropped by an upgrade. */
const older = readIndex([
  {
    name: "older-git",
    version: "1",
    hash: "h",
    source: { kind: "git", url: "https://x.test/r", ref: "v1", revision: "aaa" },
  },
  { name: "older-path", version: "1", hash: "h", source: { kind: "path", path: "/here" } },
  {
    name: "older-archive",
    version: "1",
    hash: "h",
    source: { kind: "archive", url: "https://x.test/a.zip", etag: "W/1" },
  },
])
check("a repository written as git reads as a url", older[0]?.source.kind === "url", older[0]?.source)
check(
  "and keeps the ref it was taken at",
  older[0]?.source.kind === "url" && older[0].source.ref === "v1",
  older[0]?.source
)
check("a directory written as path reads as local", older[1]?.source.kind === "local", older[1]?.source)
check(
  "an archive's etag reads as its revision",
  older[2]?.source.kind === "archive" && older[2].source.revision === "W/1",
  older[2]?.source
)
check(
  "a subdirectory written by this build reads back whole",
  (() => {
    const one = readIndex([
      {
        name: "sub",
        version: "1",
        hash: "h",
        source: {
          source: "git-subdir",
          url: "https://x.test/r",
          path: "tools/one",
          ref: "main",
          revision: "bbb",
        },
      },
    ])[0]
    return (
      one?.source.kind === "git-subdir" &&
      one.source.path === "tools/one" &&
      one.source.ref === "main" &&
      one.source.revision === "bbb"
    )
  })()
)

/* A record written before the two fields were told apart kept the pack's mark
   among the pictures a person adds. Reading one puts the mark back where it
   belongs, and leaves a picture somebody added alone. */
const mixed = readIndex([
  {
    name: "old-pack",
    version: "1",
    source: { source: "local", path: "/somewhere" },
    hash: "h",
    assets: ["assets/old-pack/logo.png", "https://cdn.test/shot.png"],
  },
])[0]
check(
  "a mark kept among the assets reads as the icon",
  mixed?.icon === "assets/old-pack/logo.png",
  mixed?.icon
)
check(
  "and a picture a person added stays a picture",
  mixed?.assets.join() === "https://cdn.test/shot.png",
  mixed?.assets
)
const named = readIndex([
  {
    name: "named-pack",
    version: "1",
    source: { source: "local", path: "/somewhere" },
    hash: "h",
    icon: "assets/named-pack/icon.png",
    assets: ["assets/named-pack/icon.png", "assets/added-by-hand.png"],
  },
])[0]
check("a declared icon is kept as written", named?.icon === "assets/named-pack/icon.png", named?.icon)
check(
  "and a copy of it kept among the assets leaves nothing behind",
  named?.assets.join() === "assets/added-by-hand.png",
  named?.assets
)

console.log("collecting")

const library = createFsPluginLibrary(home)
const collector = createPluginCollector(library)
const collected = await collector.add(source)
check("a fresh address is collected", !collected.already, collected.already)
check("the pack landed under its own manifest name", collected.record.name === "acme-hello", collected.record.name)
check("its version was read from the manifest", collected.record.version === "1.0.0", collected.record.version)
check("its description was read", collected.record.description.includes("hello"), collected.record.description)
check("a local directory is recorded as one", collected.record.source.kind === "local")
check("its tags start empty", collected.record.tags.length === 0)
check("it has no pictures of its own", collected.record.icon === "" && collected.record.assets.length === 0, collected.record)

check(
  "the recorded hash is the files' own",
  collected.record.hash === (await folderHash(path.join(home, "plugins", "acme-hello")))
)
check(
  "the pack's files are there",
  (await fs.stat(path.join(home, "plugins", "acme-hello", "skills", "hello", "SKILL.md")).catch(() => null)) !== null
)

const index: unknown = JSON.parse(await fs.readFile(path.join(home, "plugins", "plugins.json"), "utf8"))
check("the index is a top-level array", Array.isArray(index), typeof index)
check("it holds one record", Array.isArray(index) && index.length === 1)
check(
  "the record's fields are the agreed ones, in order",
  JSON.stringify(Object.keys((index as Record<string, unknown>[])[0] as object)) ===
    JSON.stringify(["name", "version", "description", "tags", "source", "hash", "icon", "assets", "installedAt", "updatedAt"]),
  Object.keys((index as Record<string, unknown>[])[0] as object)
)
/* The word travels under `source`, the key Claude Code's own marketplace schema
   spells its sources with, rather than under the `kind` this build used to write. */
check(
  "the source is written under its own word",
  JSON.stringify((index as Record<string, unknown>[])[0]?.source) ===
    JSON.stringify({ source: "local", path: source }),
  (index as Record<string, unknown>[])[0]?.source
)
check(
  "nothing writes a marketplace index beside it",
  (await fs.stat(path.join(home, "plugins", ".claude-plugin")).catch(() => null)) === null &&
    (await fs.stat(path.join(home, "plugins", ".agents")).catch(() => null)) === null
)

/* The same address twice is one pack, and saying so is the answer rather than a
   failure: it is a read of the index, not a question for the source. */
const repeated = await collector.add(source)
check("the same address answers that it is already here", repeated.already, repeated.already)
check("and names the pack that is here", repeated.record.name === "acme-hello", repeated.record.name)
check("nothing was added a second time", (await library.list()).length === 1)

console.log("a folder a page read")

/* A page hands over files rather than a path, because a browser is told nothing
   about where a folder sits. The pack's own manifest still names it, and what the
   page called it is kept as where it came from — a pack found inside a folder is
   the pack, not the folder, so the two are not the same word. */
const uploadHub = path.join(root, "upload-hub")
const uploadLibrary = createFsPluginLibrary(uploadHub)
const uploadCollector = createPluginCollector(uploadLibrary)
const dropped = path.join(root, "dropped")
const one = path.join(dropped, "plugins", "acme-hello")
await writePack(one, "2.0.0")
await writePicture(one, "assets/logo.png", "the logo")
await writePicture(one, "skills/hello/reference.md", "More.\n")

const uploaded = await uploadCollector.addFolder(
  "dropped/plugins/acme-hello",
  await uploads(one)
)
check("a folder a page read is collected", uploaded.record.name === "acme-hello", uploaded.record.name)
check("it is not reported as already here", !uploaded.already)
check("its files landed under the manifest's name", await uploadLibrary.has("acme-hello"))
check(
  "every file came across, not only the manifest",
  (await fs.stat(path.join(uploadHub, "plugins", "acme-hello", "skills", "hello", "reference.md")).catch(() => null)) !== null
)
check(
  "what was recorded is where it sat in the drop",
  uploaded.record.source.kind === "local" && uploaded.record.source.path === "dropped/plugins/acme-hello",
  uploaded.record.source
)
check(
  "and its picture came with it",
  (await fs.readdir(path.join(uploadHub, "assets"))).join() === "acme-hello-logo-7e0b9e9c.png"
)

/* A folder of packs is not one pack: the page collects each separately, so what
   it calls each one has to tell them apart — two packs from one drop share a
   folder but not a path. */
const two = path.join(dropped, "plugins", "acme-other")
await writePack(two, "1.0.0", "acme-other")
const other = await uploadCollector.addFolder(
  "dropped/plugins/acme-other",
  await uploads(two)
)
check("a second pack from one drop is its own record", other.record.name === "acme-other", other.record.name)
check("the two are told apart by where they sat", other.record.source.kind === "local" && other.record.source.path !== uploaded.record.source.path)
check("and both are in the library", (await uploadLibrary.list()).length === 2)

/* The label is a label, not a location, but it still must not read as one: a
   path that would walk out of what was chosen is refused before anything lands. */
let escaped = ""
try {
  await uploadCollector.addFolder("../elsewhere", await uploads(two))
} catch (error) {
  escaped = error instanceof Error ? error.message : String(error)
}
check("a label that walks out is refused", escaped.includes("unusable path"), escaped)

console.log("one folder, two ways in")

/* A dropped folder is recorded by the label it was chosen by, because a browser
   cannot say where it sits. The same folder typed as a path can never equal that
   label, so the name is what has to say the two are one pack — otherwise a person
   typing the path of the folder they just dropped is told a different pack is
   wearing the name. */
const twiceHub = path.join(root, "twice-hub")
const twice = createFsPluginLibrary(twiceHub)
const twiceCollector = createPluginCollector(twice)
const typed = path.join(root, "typed")
await writePack(typed, "4.0.0", "twice-pack")
await writePicture(typed, "assets/logo.png", "the logo")

const byLabel = await twiceCollector.addFolder("somewhere/twice-pack", await uploads(typed))
check("a dropped folder is recorded by its label", byLabel.record.source.path === "somewhere/twice-pack", byLabel.record.source)
const byPath = await twiceCollector.add(typed)
check("the same folder typed as a path is that pack", byPath.already, byPath)
check("nothing was written a second time", (await twice.list()).length === 1)
check("and the label it was first recorded by stands", (await twice.list())[0]?.source.path === "somewhere/twice-pack")

/* Edited since it was dropped: what the person handed over is what belongs here,
   and it is the same folder either way. */
await fs.writeFile(
  path.join(typed, "skills", "hello", "SKILL.md"),
  "---\nname: hello\n---\n\nChanged since.\n",
  "utf8"
)
const movedOn = await twiceCollector.add(typed)
check("a folder whose files moved on is taken again", !movedOn.already, movedOn)
check(
  "and what is here is what it holds now",
  (await fs.readFile(path.join(twiceHub, "plugins", "twice-pack", "skills", "hello", "SKILL.md"), "utf8")).includes("Changed since")
)

/* The label travels the other way too, and a path typed with the other separator
   names the same folder. */
const bySlash = await twiceCollector.add(typed.replace(/\\/g, "/"))
check("the path in either separator is that folder", bySlash.already, bySlash)

/* A dropped folder under a name the library already holds is that pack, because
   the label it arrives with cannot be compared to anything. */
const droppedAgain = await twiceCollector.addFolder("elsewhere/twice-pack", await uploads(typed))
check("a dropped folder of that name is the same pack", droppedAgain.already, droppedAgain)

/* Two folders a person named by path are comparable, and differing ones are two
   packs: which belongs here is the person's call rather than this hub's. */
const otherFolder = path.join(root, "other-twice")
await writePack(otherFolder, "6.0.0", "twice-pack")
let twoPaths = ""
try {
  await twiceCollector.add(otherFolder)
} catch (error) {
  twoPaths = error instanceof Error ? error.message : String(error)
}
check("a second path of that name is refused", twoPaths.includes("already in this library"), twoPaths)

console.log("an index that lost a record")

/* The index is durable JSON a person may edit, and a directory is a fact whether
   or not the index knows about it. A record deleted by hand leaves its pack on
   disk, so adding that address again has to put the record back rather than
   refuse the name the directory still holds. */
const orphanHub = path.join(root, "orphan-hub")
const orphanLibrary = createFsPluginLibrary(orphanHub)
const orphanCollector = createPluginCollector(orphanLibrary)
const orphanSource = path.join(root, "orphan-source")
await writePack(orphanSource, "1.0.0")
await writePicture(orphanSource, "assets/logo.png", "the orphan's logo")
const orphan = await orphanCollector.add(orphanSource)
const indexPath = path.join(orphanHub, "plugins", "plugins.json")
await fs.writeFile(indexPath, "[]\n", "utf8")
check("the pack's directory is still there after the record is deleted", await orphanLibrary.has(orphan.record.name))
check("and the index no longer lists it", (await orphanLibrary.list()).length === 0)

const restored = await orphanCollector.add(orphanSource)
check("adding that address again records the pack", restored.record.name === "acme-hello", restored.record.name)
check("it is not reported as something that was already here", !restored.already)
check("the record is back in the index", (await orphanLibrary.list()).length === 1)
check(
  "and it describes the files that are here",
  restored.record.hash === (await folderHash(path.join(orphanHub, "plugins", "acme-hello"))),
  restored.record.hash
)
/* The copy the index lost track of is cleared before the record is written again,
   so recovering a pack does not leave a second copy of its picture behind. */
check(
  "its picture is stored once, not twice",
  (await fs.readdir(path.join(orphanHub, "assets"))).join() === "acme-hello-logo-8da96759.png",
  await fs.readdir(path.join(orphanHub, "assets"))
)
check("a third attempt then finds it here", (await orphanCollector.add(orphanSource)).already)

console.log("a pack whose files were deleted")

/* A record outliving its directory is a memory of a pack rather than the pack. A
   directory that lost its manifest is the same thing: nothing could describe it.
   Both are what makes an address worth fetching again. */
await fs.rm(path.join(orphanHub, "plugins", "acme-hello"), { recursive: true, force: true })
check("a record whose folder is gone is not a pack that is here", !(await orphanLibrary.has("acme-hello")))

const refetched = await orphanCollector.add(orphanSource)
check("adding that address fetches the pack again", !refetched.already)
check("the files are back", await orphanLibrary.has("acme-hello"))
check(
  "and its picture is there once",
  (await fs.readdir(path.join(orphanHub, "assets"))).join() === "acme-hello-logo-8da96759.png",
  await fs.readdir(path.join(orphanHub, "assets"))
)

/* A folder that is there but holds no manifest is not a pack either. */
await fs.rm(path.join(orphanHub, "plugins", "acme-hello", ".claude-plugin"), { recursive: true, force: true })
check("a folder that lost its manifest is not a pack that is here", !(await orphanLibrary.has("acme-hello")))
const refetchedAgain = await orphanCollector.add(orphanSource)
check("and that fetches it again too", !refetchedAgain.already)
check("the manifest is back", await orphanLibrary.has("acme-hello"))
check(
  "with its picture stored once",
  (await fs.readdir(path.join(orphanHub, "assets"))).join() === "acme-hello-logo-8da96759.png",
  await fs.readdir(path.join(orphanHub, "assets"))
)

/* A directory holding a *different* pack under a name the index lost is replaced
   by what the address holds: the address is what was asked for. */
const otherContent = path.join(root, "other-content")
await writePack(otherContent, "3.0.0")
await fs.writeFile(path.join(otherContent, "commands", "greet.md"), "Different.\n", "utf8")
await fs.writeFile(indexPath, "[]\n", "utf8")
const replaced = await orphanCollector.add(otherContent)
check("a lost name holding another pack takes what was asked for", !replaced.already)
check(
  "with the files the address holds",
  (await fs.readFile(path.join(orphanHub, "plugins", "acme-hello", "commands", "greet.md"), "utf8")) === "Different.\n"
)
check("and the index lists it again", (await orphanLibrary.list()).length === 1)

console.log("a pack with no manifest")

/* A directory that carries no plugin manifest has no name to record it under, so
   it is refused rather than recorded under a name this hub invented. */
const nameless = path.join(root, "nameless")
await fs.mkdir(path.join(nameless, "docs"), { recursive: true })
await fs.writeFile(path.join(nameless, "README.md"), "nothing here\n", "utf8")
let noManifest = ""
try {
  await collector.add(nameless)
} catch (error) {
  noManifest = error instanceof Error ? error.message : String(error)
}
check("a directory with no manifest is refused", noManifest.includes("no plugin manifest"), noManifest)
check("and nothing was recorded", (await library.list()).length === 1)

/* A file with that name may still be somebody else's — a repository root carries
   a `plugin.json` for its own tooling often enough that the refusal has to say
   which of the two it found. */
const foreign = path.join(root, "foreign-manifest")
await fs.mkdir(foreign, { recursive: true })
await fs.writeFile(
  path.join(foreign, "plugin.json"),
  `${JSON.stringify({ build: { out: "dist" } }, null, 2)}\n`,
  "utf8"
)
let notAPack = ""
try {
  await collector.add(foreign)
} catch (error) {
  notAPack = error instanceof Error ? error.message : String(error)
}
check("a manifest that names no plugin says so", notAPack.includes("names no plugin"), notAPack)

/* A root manifest is the fallback for a pack from before the convention. */
const legacy = path.join(root, "legacy")
await fs.mkdir(legacy, { recursive: true })
await fs.writeFile(path.join(legacy, "plugin.json"), `${JSON.stringify({ name: "legacy-pack" })}\n`, "utf8")
check("a root plugin.json names the pack", (await collector.add(legacy)).record.name === "legacy-pack")

/* A name no filesystem would take is refused rather than rewritten: the name is
   the identity, so quietly changing it would change what the pack is. */
const awkward = path.join(root, "awkward")
await fs.mkdir(path.join(awkward, ".claude-plugin"), { recursive: true })
await fs.writeFile(
  path.join(awkward, ".claude-plugin", "plugin.json"),
  `${JSON.stringify({ name: "@scope/pkg", version: "1.0.0" })}\n`,
  "utf8"
)
let awkwardName = ""
try {
  await collector.add(awkward)
} catch (error) {
  awkwardName = error instanceof Error ? error.message : String(error)
}
check("a name that is not a directory name is refused", awkwardName.includes("unusable"), awkwardName)

/* The same name from somewhere else is a different pack wearing it, which is the
   person's call rather than this hub's — so it is refused, and the refusal names
   where the one that is here came from. */
const impostor = path.join(root, "impostor")
await writePack(impostor, "9.9.9", "acme-hello")
let impostorName = ""
try {
  await collector.add(impostor)
} catch (error) {
  impostorName = error instanceof Error ? error.message : String(error)
}
check("a second pack wearing a taken name is refused", impostorName.includes("already in this library"), impostorName)
check("and the refusal names the address it came from", impostorName.includes(root), impostorName)
check("while the pack that was here is untouched", (await library.list()).length === 2)

console.log("a pack's own logo")
const logoPack = path.join(root, "logo-pack")
await writePack(logoPack, "1.0.0")
await writePicture(logoPack, "assets/logo.png", "the logo")
await writePicture(logoPack, "assets/logo-dark.png", "a variant of it")
await writePicture(logoPack, "assets/retriever-logo-dark.svg", "somebody else's mark")
await writePicture(logoPack, "docs/a/b/icon.svg", "too deep to be looked at")
await writePicture(path.join(logoPack, "node_modules", "left-pad"), "logo.png", "a dependency's")
const chosen = await findLogo(logoPack)
check("a plain logo, near the root, wins", chosen === "assets/logo.png", chosen)

const noLogo = path.join(root, "no-logo")
await writePack(noLogo, "1.0.0")
check("a pack with no picture finds none", (await findLogo(noLogo)) === undefined)

/* The rule that says which file is the picture is shared with the page that scans
   a folder, which applies it to the tree it has already read rather than walking
   a disk. Both go through this, so a row cannot offer a picture the library would
   then say the pack does not have. */
const ranked = ["assets/logo-dark.png", "logo.png", "assets/retriever-logo-dark.svg"].map(
  (one, at) => pictureOf(one, at === 1 ? 1 : 2)!
)
check("the rule picks the same file the walk does", bestPicture(ranked)?.relative === "logo.png")
check("a name that is not a picture is not one", pictureOf("assets/screenshot.png", 2) === null)
check("a file that is not a picture is not one", pictureOf("logo.txt", 1) === null)
check("a name merely containing one is not", pictureOf("catalogue.png", 1) === null)
check("but one that carries it is", pictureOf("my-logo.png", 1) !== null)
check("and one that says it another way is too", pictureOf("icon.svg", 1) !== null)
check("nothing found is no picture", bestPicture([]) === undefined)
check(
  "the depth bound is the rule's, not the walk's",
  pictureOf("a/b/logo.png", 3) !== null && pictureOf("a/b/c/logo.png", 4) === null
)
check(
  "and a dependency's pictures are nobody's",
  pictureOf("node_modules/left-pad/logo.png", 3) === null &&
    pictureOf(".git/logo.png", 2) === null
)

/* A logo is *copied* into the hub's own asset directory, because a record holds
   one kind of reference and a reference that only resolves while the pack is
   installed is not one. The file is flat and named after the pack, so two packs
   that ship a `logo.png` never share one. */
const logoHub = path.join(root, "logo-hub")
const logoLibrary = createFsPluginLibrary(logoHub)
const first = (await createPluginCollector(logoLibrary).add(logoPack)).record
check(
  "the record points at the copy, named after the pack and its bytes",
  first.icon === "assets/acme-hello-logo-7e0b9e9c.png",
  first.icon
)
check("and it is not filed among what a person added", first.assets.length === 0, first.assets)
check(
  "and the copy really is in the hub's asset directory, in no directory of its own",
  (await fs.readFile(path.join(logoHub, "assets", "acme-hello-logo-7e0b9e9c.png"), "utf8")) === "the logo"
)

/* Two packs that each ship a `logo.png` keep one file each, and removing one
   takes only what it brought. */
const otherPack = path.join(root, "other-pack")
await writePack(otherPack, "2.0.0", "other-pack")
await writePicture(otherPack, "assets/logo.png", "the other pack's logo")
const second = (await createPluginCollector(logoLibrary).add(otherPack)).record
check("a second pack's logo does not collide with the first", second.icon !== first.icon, second.icon)
check(
  "each copy is kept under the name of the pack that brought it",
  second.icon === "assets/other-pack-logo-e157ef72.png",
  second.icon
)
check(
  "and the first file is untouched",
  (await fs.readFile(path.join(logoHub, "assets", "acme-hello-logo-7e0b9e9c.png"), "utf8")) === "the logo"
)

/* The same pack read again stores the same file rather than a second copy: a
   scan runs on every page load, so this is what keeps the directory from
   growing. */
const again = (await createPluginCollector(logoLibrary).add(logoPack)).record
check("reading a pack again keeps one copy of its picture", again.icon === first.icon, again.icon)
check(
  "and the asset directory still holds one file per pack",
  (await fs.readdir(path.join(logoHub, "assets"))).join(",") ===
    "acme-hello-logo-7e0b9e9c.png,other-pack-logo-e157ef72.png",
  await fs.readdir(path.join(logoHub, "assets"))
)

console.log("the pictures a person adds")

/* What a person adds is recorded on the pack's own row and kept in the hub's
   asset directory, in the order it was added: that order is what says which
   picture a card is drawn by, so what was added last is what a card shows. */
{
  const shot = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])
  const dataUrl = `data:image/png;base64,${Buffer.from(shot).toString("base64")}`
  const clip = `data:video/mp4;base64,${Buffer.from(new Uint8Array([0, 0, 0, 24, 102])).toString("base64")}`

  await logoLibrary.addAssets("acme-hello", [dataUrl])
  const added = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
  const stored = added?.assets[0] ?? ""
  check(
    "a picture a person added is recorded on the pack, and its file is the hub's",
    stored.startsWith("assets/") &&
      (await fs.stat(path.join(logoHub, "assets", path.basename(stored))).catch(() => null)) !== null,
    stored
  )
  check(
    "and it is not confused with the picture the pack brought",
    added?.icon === first.icon && added?.icon !== stored,
    added?.icon
  )
  check(
    "and the row was not otherwise rewritten",
    added !== undefined &&
      added.hash === first.hash &&
      added.updatedAt === first.updatedAt &&
      added.tags.join() === first.tags.join(),
    added
  )

  await logoLibrary.addAssets("acme-hello", [clip])
  const both = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
  check(
    "a picture added later comes first, because that is the one a card draws",
    both?.assets.length === 2 && both.assets[0] !== stored && both.assets[1] === stored,
    both?.assets
  )

  await logoLibrary.addAssets("acme-hello", [dataUrl])
  const same = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
  check(
    "the same picture added again is one entry, moved to the front",
    same?.assets.length === 2 && same.assets[0] === stored && same.assets[1] === both?.assets[0],
    same?.assets
  )

  await logoLibrary.addAssets("acme-hello", ["https://elsewhere.test/shot.png"])
  const linked = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
  check(
    "an address is recorded as it stands, and nothing is kept for it",
    linked?.assets[0] === "https://elsewhere.test/shot.png" && linked.assets.length === 3,
    linked?.assets
  )

  /* The name a file is kept under carries the pack's own name: two packs that
     hold the same bytes are two files, so dropping one never takes the other's. */
  await logoLibrary.addAssets("other-pack", [dataUrl])
  const otherRow = (await logoLibrary.list()).find((one) => one.name === "other-pack")
  const otherFile = otherRow?.assets[0] ?? ""
  check(
    "the same picture added to another pack is that pack's own file",
    otherFile.startsWith("assets/") &&
      otherFile !== stored &&
      (await fs.stat(path.join(logoHub, "assets", path.basename(otherFile))).catch(() => null)) !== null,
    [otherFile, stored]
  )

  const refused = await logoLibrary.addAssets("no-such-pack", [dataUrl]).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error))
  )
  check(
    "a picture for a pack the hub does not hold is refused, and nothing is written",
    refused !== null && refused.includes("not in this library"),
    refused
  )

  /* The one thing that could quietly take an added picture away: an update reads
     the record again, and keeps what a person added only while its file is there.
     The mark it brought is replaced by that same read, and the two must not be
     taken for each other. */
  const stage = path.join(root, "logo-pack-again")
  await writePack(stage, "9.9.9")
  await writePicture(stage, "assets/logo.png", "the new logo")
  const replaced = await logoLibrary.replace(
    "acme-hello",
    stage,
    first.source,
    await folderHash(stage)
  )
  check(
    "an update keeps the pictures a person added, in their order",
    replaced.assets.join() === (linked?.assets ?? []).join() &&
      replaced.assets.length === 3 &&
      (await fs.stat(path.join(logoHub, "assets", path.basename(stored))).catch(() => null)) !== null,
    [replaced.assets, linked?.assets]
  )
  check(
    "and the mark it now brings is a new file, kept apart from them",
    replaced.icon !== first.icon &&
      replaced.icon !== "" &&
      !replaced.assets.includes(replaced.icon) &&
      (await fs.stat(path.join(logoHub, "assets", path.basename(replaced.icon))).catch(() => null)) !==
        null,
    replaced.icon
  )

  await logoLibrary.removeAsset("acme-hello", "https://elsewhere.test/shot.png")
  const dropped = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
  check(
    "dropping an address takes it off the pack",
    !dropped?.assets.includes("https://elsewhere.test/shot.png") && dropped.assets.length === 2,
    dropped?.assets
  )

  await logoLibrary.removeAsset("acme-hello", stored)
  const after = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
  check(
    "dropping a picture takes its file too, and the next one takes its place",
    after?.assets.length === 1 &&
      after.assets[0] === both?.assets[0] &&
      (await fs.stat(path.join(logoHub, "assets", path.basename(stored))).catch(() => null)) === null,
    after?.assets
  )
  check(
    "and the other pack's copy of the same bytes is still there",
    (await fs.stat(path.join(logoHub, "assets", path.basename(otherFile))).catch(() => null)) !== null
  )

  await logoLibrary.removeAsset("acme-hello", after?.assets[0] ?? "")
  const bare = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
  check("dropping the last picture leaves the pack with none", bare?.assets.length === 0, bare?.assets)
  check(
    "while the picture the pack itself brought stays",
    bare?.icon !== "" &&
      (await fs.stat(path.join(logoHub, "assets", path.basename(bare.icon))).catch(() => null)) !== null,
    bare?.icon
  )

  /* A reference this pack's record does not hold is not this call's to remove:
     its own mark lives in the same store, and a mistake is not a reason to
     delete a file. */
  await logoLibrary.removeAsset("acme-hello", bare?.icon ?? "")
  await logoLibrary.removeAsset("acme-hello", "assets/never-recorded-00000000.png")
  const untouched = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
  check(
    "the pack's own mark is not a picture a person added, and is left alone",
    untouched?.icon === bare?.icon &&
      untouched?.icon !== "" &&
      (await fs.stat(path.join(logoHub, "assets", path.basename(untouched.icon))).catch(() => null)) !==
        null,
    untouched?.icon
  )
  check(
    "and another pack's row is not touched by any of it",
    (await logoLibrary.list()).find((one) => one.name === "other-pack")?.assets.length === 1
  )
}

console.log("reading a directory an agent keeps a pack in")

/* A pack no library record holds is read straight out of the directory an agent
   named, so that directory is the boundary: everything the panel asks for is
   resolved inside it, and a path that climbs out is refused rather than opened.
   A pack is somebody else's directory, and the panel asks for paths by name. */
{
  const outside = path.join(root, "outside.txt")
  await fs.writeFile(outside, "not part of any pack", "utf8")
  const inside = path.join(root, "logo-pack")
  await fs.writeFile(path.join(inside, "NOTE.md"), "# hi\n", "utf8")

  const listed = await listDirectory(inside)
  check(
    "a directory lists what is in it",
    listed.some((one) => one.path === "NOTE.md" && !one.directory),
    listed.map((one) => one.path)
  )
  check(
    "and reads a file inside it",
    (await readInDirectory(inside, "NOTE.md")) === "# hi\n"
  )
  const climbed = await readInDirectory(inside, "../outside.txt").then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error))
  )
  check("a path that climbs out is refused", climbed !== null && climbed.includes("escapes"), climbed)
  const absolute = await readInDirectory(inside, path.resolve(outside)).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error))
  )
  check(
    "and so is an absolute one, wherever it lands",
    absolute !== null && absolute.includes("escapes"),
    absolute
  )
  check(
    "while the hub's own reader refuses the same way",
    (await library.read("logo-pack", "../../outside.txt").then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : String(error))
    ))?.includes("escapes") === true
  )
}

console.log("a program runs in the folder it is given")

/* A client resolves its project files against the working directory: Claude
   Code writes `.claude/settings.json` where it was started. So an install aimed
   at a workspace has to be started in that workspace, not in whichever package
   this host happens to run from — otherwise the pack lands beside the dev
   server instead of in the folder a person picked. */
{
  const where = path.join(root, "a-workspace")
  await fs.mkdir(where, { recursive: true })
  const says = ["-e", "process.stdout.write(process.cwd())"]
  const here = await runProgram(process.execPath, says, { cwd: where })
  check(
    "a program started in a folder answers from that folder",
    (await fs.realpath(here.output)) === (await fs.realpath(where)),
    here.output
  )
  const home = await runProgram(process.execPath, says)
  check(
    "and one started with no folder answers from this host's own",
    (await fs.realpath(home.output)) === (await fs.realpath(process.cwd())),
    home.output
  )
}

console.log("an asset store with a sink of its own")

/* A sink is the seam a plugin adds a backend through — somewhere else an asset
   can be kept. The store offers every file to it first; one that answers takes
   the file over, and dropping that reference is the sink's again. */
const kept: { name: string; type: string; bytes: number }[] = []
const sinkDropped: string[] = []
const bucket: AssetSink = {
  id: "check-bucket",
  async keep(file: File) {
    kept.push({ name: file.name, type: file.type, bytes: file.size })
    return `https://bucket.test/${encodeURIComponent(file.name)}`
  },
  async drop(ref: string) {
    sinkDropped.push(ref)
  },
}
const sinkHub = path.join(root, "sink-hub")
const sinkStore = createAssetStore(createFsAssetLibrary(sinkHub), [bucket])
const sinkLibrary = createFsPluginLibrary(sinkHub, sinkStore)
const hosted = (await createPluginCollector(sinkLibrary).add(logoPack)).record
check(
  "the sink is offered the pack's picture as a file of its own",
  kept.length === 1 && kept[0]?.name === "acme-hello-logo.png" && kept[0]?.type === "image/png",
  kept
)
check(
  "and the reference it answers with is what the record holds",
  hosted.icon === "https://bucket.test/acme-hello-logo.png",
  hosted.icon
)
check(
  "so nothing is kept in the hub's own directory",
  (await fs.readdir(path.join(sinkHub, "assets")).catch(() => [])).length === 0,
  await fs.readdir(path.join(sinkHub, "assets")).catch(() => [])
)
await sinkLibrary.remove(hosted.name)
check("dropping the pack asks the sink to drop its copy", sinkDropped.join() === hosted.icon, sinkDropped)

console.log("removing")

await logoLibrary.remove(first.name)
check("the pack's directory is gone", (await fs.stat(path.join(logoHub, "plugins", "acme-hello")).catch(() => null)) === null)
check("its record is gone", !(await logoLibrary.list()).some((one) => one.name === first.name))
check(
  "the picture it brought is gone too",
  (await fs.stat(path.join(logoHub, "assets", "acme-hello-logo-7e0b9e9c.png")).catch(() => null)) === null
)
check(
  "while the other pack's picture stays",
  (await fs.stat(path.join(logoHub, "assets", "other-pack-logo-e157ef72.png")).catch(() => null)) !== null
)

console.log("a source that moved")

/* A repository made here is an upstream the checks can ask without a network. */
const repo = path.join(root, "repo")
await writePack(repo, "1.0.0")
await git(repo, ["init", "-q"])
await git(repo, ["config", "user.email", "check@example.test"])
await git(repo, ["config", "user.name", "Check"])
await git(repo, ["add", "-A"])
await git(repo, ["commit", "-qm", "first"])

const repoLibrary = createFsPluginLibrary(path.join(root, "repo-hub"))

/**
 * Take the repository as a pack, the way a collected one is recorded: the files
 * without their history, and the revision they were at. The repository is on
 * this machine, so an address naming it would be read as a directory rather than
 * a repository — which is the point of the two forms being separate.
 */
async function takeFromRepo(into: ReturnType<typeof createFsPluginLibrary>, at?: string) {
  const work = await fs.mkdtemp(path.join(tmpdir(), "hub-plugin-stage-"))
  const pack = path.join(work, "pack")
  await fs.cp(repo, pack, {
    recursive: true,
    filter: (from) => !from.includes(`${path.sep}.git`),
  })
  const revision = (await git(repo, ["rev-parse", at ?? "HEAD"])).trim()
  return into.add(
    "acme-hello",
    pack,
    { kind: "url", url: repo, ...(at === undefined ? {} : { ref: at }), revision },
    await folderHash(pack)
  )
}

const cloned = await takeFromRepo(repoLibrary)
check(
  "a pack taken from a repository records its revision",
  cloned.source.kind === "url" && /^[0-9a-f]{40}$/.test(cloned.source.revision),
  cloned.source
)

/* A name the library holds from an address is not a folder's to take over: that
   address can be asked again, so which pack belongs here is the person's call
   rather than this hub's. Only a folder is a label nobody can compare. */
const folderWithATakenName = path.join(root, "impostor-folder")
await writePack(folderWithATakenName, "1.0.0")
let takenOver = ""
try {
  await createPluginCollector(repoLibrary).add(folderWithATakenName)
} catch (error) {
  takenOver = error instanceof Error ? error.message : String(error)
}
check("a folder does not take a name held from an address", takenOver.includes("already in this library"), takenOver)
check(
  "and none of the repository's history came with it",
  (await fs.stat(path.join(root, "repo-hub", "plugins", "acme-hello", ".git")).catch(() => null)) === null
)

const probe = createPluginProbe(repoLibrary)
const firstCheck = await probe.checkAll(await repoLibrary.list())
check("a source that has not moved is not an update", firstCheck.outdated === 0, firstCheck)
check("nothing failed to answer", firstCheck.failed.length === 0, firstCheck.failed)
check(
  "the answer was recorded",
  (await repoLibrary.list())[0]?.checked?.latest ===
    (cloned.source.kind === "url" ? cloned.source.revision : ""),
  (await repoLibrary.list())[0]?.checked
)

/* Move the source on, and the next check has to see it. */
await fs.writeFile(
  path.join(repo, "skills", "hello", "SKILL.md"),
  "---\nname: hello\ndescription: Say hello.\n---\n\nSay hello loudly.\n",
  "utf8"
)
await git(repo, ["add", "-A"])
await git(repo, ["commit", "-qm", "second"])

const secondCheck = await probe.checkAll(await repoLibrary.list())
check("a moved source is an update", secondCheck.outdated === 1, secondCheck)

const applied = await createPluginUpdater(repoLibrary).update("acme-hello")
check("the update took the new files", applied.changed, applied)
check("it reports what it came from and went to", applied.from !== applied.to, applied)
const after = (await repoLibrary.list())[0]
check(
  "the record now holds the new revision",
  after?.source.kind === "url" && after.source.revision === applied.to
)
check("and the new hash", after?.hash === (await folderHash(path.join(root, "repo-hub", "plugins", "acme-hello"))))
check("the check that said there was an update is answered", !outdated(after!), after?.checked)

/* A pack taken at a ref is asked about *that* ref: a tag is not behind the
   branch it happens to sit on, and a commit above it is not an update to it. */
await git(repo, ["tag", "v1"])
const pinnedLibrary = createFsPluginLibrary(path.join(root, "pinned-hub"))
await takeFromRepo(pinnedLibrary, "v1")
const pinnedCheck = await createPluginProbe(pinnedLibrary).checkAll(await pinnedLibrary.list())
check("a pack taken at a tag is not behind its own tag", pinnedCheck.outdated === 0, pinnedCheck)

await fs.writeFile(path.join(repo, "skills", "hello", "SKILL.md"), "---\nname: hello\n---\n\nSomething else.\n", "utf8")
await git(repo, ["add", "-A"])
await git(repo, ["commit", "-qm", "third"])
const stillPinned = await createPluginProbe(pinnedLibrary).checkAll(await pinnedLibrary.list())
check("and a commit above the tag is not an update to it", stillPinned.outdated === 0, stillPinned)

/* A directory on this machine has no source to ask, and says so rather than
   reporting a change every time. */
const localCheck = await probe.checkAll([collected.record])
check("a local directory is listed as unanswerable", localCheck.unanswerable.includes("acme-hello"), localCheck)

/* One pack at a time, for the panel that is looking at that one: the same
   answer as a batch would give, recorded the same way, and a refusal where a
   batch would only have listed the pack as unanswerable. */
console.log("asking about one pack")
{
  const one = await createPluginProbe(repoLibrary).checkOne(await repoLibrary.list(), "acme-hello")
  check("asking about one pack reads its source", one.latestRevision !== "", one)
  check(
    "and the answer is recorded the way a batch records it",
    (await repoLibrary.list())[0]?.checked?.latest === one.latestRevision,
    (await repoLibrary.list())[0]?.checked
  )
  const named = await createPluginProbe(repoLibrary)
    .checkOne(await repoLibrary.list(), "not-a-pack")
    .then(() => null, (error: unknown) => (error instanceof Error ? error.message : String(error)))
  check("a name no record carries is refused", named !== null && named.includes("not-a-pack"), named)
  const unanswerable = await probe
    .checkOne([collected.record], "acme-hello")
    .then(() => null, (error: unknown) => (error instanceof Error ? error.message : String(error)))
  check(
    "and a source that cannot be asked is refused rather than guessed at",
    unanswerable !== null && unanswerable.includes("cannot be asked"),
    unanswerable
  )
}

console.log("one directory of a repository")

/* A monorepo ships packs as directories of one repository. An address naming a
   subdirectory is taken as that directory and nothing else: the pack is what
   lands, and no other directory of the repository comes with it. */
const monorepo = path.join(root, "monorepo")
await fs.mkdir(path.join(monorepo, "tools"), { recursive: true })
await writePack(path.join(monorepo, "tools", "acme-hello"), "3.0.0")
await writePack(path.join(monorepo, "tools", "other-pack"), "1.0.0", "other-pack")
await fs.writeFile(path.join(monorepo, "README.md"), "The repository's own file.\n", "utf8")
await git(monorepo, ["init", "-q"])
await git(monorepo, ["config", "user.email", "check@example.test"])
await git(monorepo, ["config", "user.name", "Check"])
await git(monorepo, ["add", "-A"])
await git(monorepo, ["commit", "-qm", "first"])
await fs.rm(path.join(root, "subdir-hub"), { recursive: true, force: true })

/** One fetch of a subdirectory of the monorepo, into a staging directory of its own. */
async function takeSubdir(where: string): Promise<{ taken: PluginOrigin; stage: string }> {
  const work = await stagingDir()
  const stage = path.join(work, "pack")
  await fs.mkdir(stage, { recursive: true })
  const taken = await fetchPlugin({ kind: "git-subdir", url: monorepo, path: where }, stage, work)
  return { taken, stage }
}

const subdir = await takeSubdir("tools/acme-hello")
check(
  "a subdirectory is recorded as one",
  subdir.taken.kind === "git-subdir" &&
    subdir.taken.path === "tools/acme-hello" &&
    /^[0-9a-f]{40}$/.test(subdir.taken.revision),
  subdir.taken
)
check(
  "the pack's own files are what landed",
  (await fs.stat(path.join(subdir.stage, "skills", "hello", "SKILL.md")).catch(() => null)) !== null
)
check(
  "and nothing of the rest of the repository",
  (await fs.stat(path.join(subdir.stage, "README.md")).catch(() => null)) === null &&
    (await fs.stat(path.join(subdir.stage, "tools")).catch(() => null)) === null,
  await fs.readdir(subdir.stage)
)
check(
  "with no history",
  (await fs.stat(path.join(subdir.stage, ".git")).catch(() => null)) === null
)

let noSuchDir = ""
try {
  await takeSubdir("tools/nowhere")
} catch (error) {
  noSuchDir = error instanceof Error ? error.message : String(error)
}
check("a subdirectory the repository does not hold is refused", noSuchDir.includes("holds no"), noSuchDir)

let walkedOut = ""
try {
  await takeSubdir("../elsewhere")
} catch (error) {
  walkedOut = error instanceof Error ? error.message : String(error)
}
check("a subdirectory that walks out is refused", walkedOut.includes("unusable path"), walkedOut)

/* Two packs from one repository are two packs: the path is what tells them
   apart, so a library can hold both. */
const subdirLibrary = createFsPluginLibrary(path.join(root, "subdir-hub"))
const collectedSubdir = await takeSubdir("tools/acme-hello")
const firstSubdir = await subdirLibrary.add(
  "acme-hello",
  collectedSubdir.stage,
  collectedSubdir.taken,
  await folderHash(collectedSubdir.stage)
)
check("a pack from a subdirectory is recorded", firstSubdir.source.kind === "git-subdir", firstSubdir.source)
const subdirCheck = await createPluginProbe(subdirLibrary).checkAll(await subdirLibrary.list())
check(
  "and is answered as one this build cannot ask about",
  subdirCheck.unanswerable.includes("acme-hello") && subdirCheck.outdated === 0,
  subdirCheck
)
check("so it is never reported as behind", !outdated(firstSubdir))

console.log("putting a pack back")

/* A record outlives the directory it names. The address it carries is what makes
   the pack recoverable, so a folder deleted by hand is fetched again rather than
   remembered as a row whose files are nowhere. */
const repoPack = path.join(root, "repo-hub", "plugins", "acme-hello")
const beforeLoss = (await repoLibrary.list())[0]
await fs.rm(repoPack, { recursive: true, force: true })
check("the folder is gone", !(await repoLibrary.has("acme-hello")))
check("and the library names it as missing", (await repoLibrary.missing()).includes("acme-hello"))

await createPluginCollector(repoLibrary).restore("acme-hello")
check("the pack is fetched again", await repoLibrary.has("acme-hello"))
check("and is no longer missing", (await repoLibrary.missing()).length === 0, await repoLibrary.missing())
check(
  "what came back is what the source holds",
  (await repoLibrary.list())[0]?.hash ===
    (await folderHash(path.join(root, "repo-hub", "plugins", "acme-hello")))
)
check(
  "and it is still the same record",
  (await repoLibrary.list())[0]?.installedAt === beforeLoss?.installedAt,
  (await repoLibrary.list())[0]
)

/* Two collections of one address at once are one pack: whichever lands second
   finds the files already here rather than a name it must refuse. */
await fs.rm(repoPack, { recursive: true, force: true })
const racing = createPluginCollector(repoLibrary)
await Promise.all([racing.restore("acme-hello"), racing.restore("acme-hello")])
check("asking twice at once leaves one pack", (await repoLibrary.list()).length === 1)
check("with its files here", await repoLibrary.has("acme-hello"))

/* A source that cannot be reached fails, and says so: the pack is the one thing
   a person can then add again by hand. */
const brokenFile = path.join(root, "repo-hub", "plugins", "plugins.json")
const broken = JSON.parse(await fs.readFile(brokenFile, "utf8")) as { source: { url: string } }[]
broken[0]!.source.url = path.join(root, "no-such-repository")
await fs.writeFile(brokenFile, `${JSON.stringify(broken, null, 2)}\n`, "utf8")
await fs.rm(repoPack, { recursive: true, force: true })
let unreachable = ""
try {
  await createPluginCollector(repoLibrary).restore("acme-hello")
} catch (error) {
  unreachable = error instanceof Error ? error.message : String(error)
}
check("a source that cannot be reached is reported", unreachable !== "", unreachable)

/* A pack that came from a directory on this machine is the exception: that
   directory *is* the pack, so a missing one is nothing this hub can fetch. */
await fs.rm(path.join(orphanHub, "plugins", "acme-hello"), { recursive: true, force: true })
let localGone = ""
try {
  await createPluginCollector(orphanLibrary).restore("acme-hello")
} catch (error) {
  localGone = error instanceof Error ? error.message : String(error)
}
check("a local pack says there is nothing to fetch it from", localGone.includes("this machine"), localGone)

console.log("delivering")

/* A stub stands in for an agent here. The installers that ship are each in the
   plugin for the agent they drive, and they shell out to that agent's own CLI —
   which a check on this module cannot assume is installed, and must not call if
   it is. What this module owns is the seam: the registry an agent plugin
   registers into, and the tools an installer is handed. */
const libraryRoot = path.join(home, "plugins")
const ran: string[][] = []
const stubHeld: PluginHeld[] = []
const tools: PluginTools = {
  root: async () => libraryRoot,
  syncMarketplace: async () => {
    ran.push(["sync-marketplace"])
  },
  run: async (program, args) => {
    ran.push([program, ...args])
    return ""
  },
  has: async (program) => program === "stub",
  /* Reading a pack's own directory is the hub's job, so an installer asks for
     it rather than reaching for a disk; the stub answers as a host would. */
  describe: async (directory) => ({
    name: "",
    version: "",
    description: `a pack at ${directory}`,
  }),
}
const stub: PluginInstaller = {
  id: "hub.target.stub",
  label: "Stub",
  scopes: ["user", "project"],
  available: (given) => given.has("stub"),
  held: async () => stubHeld,
  install: async (name, scope) => {
    stubHeld.push({
      name,
      id: `${name}@stub`,
      version: "1",
      scope,
      enabled: true,
      marketplace: "stub",
    })
    return { message: `${name} at ${scope}` }
  },
  /* Installing names the pack, because this hub is the marketplace supplying it;
     removing names the client's own id, because the client may well hold a copy
     some other marketplace supplied, and only that id finds it. */
  remove: async (id, scope) => {
    const at = stubHeld.findIndex((one) => one.id === id && one.scope === scope)
    if (at !== -1) stubHeld.splice(at, 1)
    return { message: `${id} out of ${scope}` }
  },
}

/** The scopes the stub holds one pack in, as the installed list reads them. */
async function heldScopes(name: string): Promise<string> {
  const packs = await registered.held(tools)
  return packs
    .filter((one) => one.name === name)
    .map((one) => one.scope)
    .join()
}

const registry = createPluginInstallerRegistry()
check("a fresh registry holds no installer", registry.installers().length === 0)
const unregister = registry.register(stub)
check("registering one lists it", registry.installers().map((one) => one.id).join() === "hub.target.stub")
const [registered] = registry.installers()
if (registered === undefined) throw new Error("the registry lost the installer it was given")
await registered.install("acme-hello", "user", tools)
await registered.install("acme-hello", "project", tools)
check("an installer records both scopes it was given", (await heldScopes("acme-hello")) === "user,project")
check("the tools say which program is here", (await tools.has("stub")) === true)
check("and which is not", (await tools.has("nowhere")) === false)
check(
  "an installer can ask what a pack says about itself",
  (await tools.describe(libraryRoot)).description === `a pack at ${libraryRoot}`
)
/* The library root is a person's own directory, so a path with a space is a
   case every installer hits. It travels as one list entry, never re-parsed. */
await tools.run("stub", [libraryRoot, "one argument"])
check(
  "the program is called with structured arguments",
  ran.at(-1)?.join("|") === `stub|${libraryRoot}|one argument`,
  ran.at(-1)
)
/* Removed by the id the client itself reported, which is what a client's own
   commands take back — and the only thing that names a copy this hub never
   delivered. */
await registered.remove("acme-hello@stub", "user", tools)
check("removing one scope leaves the other", (await heldScopes("acme-hello")) === "project")
unregister()
check("the disposer takes it back out", registry.installers().length === 0)

console.log("what a pack carries inside it")

/* The pack the rest of this check writes: one skill that names itself, and one
   command that says nothing about itself at all. */
const carried = await readPackContents(source)
check("a skill reads under the name its own file gives", carried.skills[0]?.title === "hello", carried.skills)
check("and carries the sentence beside it", carried.skills[0]?.description === "Say hello.")
check(
  "a command with no frontmatter reads as its file name",
  carried.commands[0]?.title === "greet",
  carried.commands
)
check("with nothing said about it rather than something invented", carried.commands[0]?.description === "")
check("a pack that declares no server carries none", carried.mcp === null)

/* A pack carrying the shapes the first one does not: a skill directory that is
   not a skill, two skills out of order, a command grouped in a directory, a file
   that is not markdown, and a declared server. */
const shapes = path.join(root, "shapes")
await writePack(shapes, "1.0.0")
await fs.rm(path.join(shapes, "skills", "hello", "SKILL.md"))
/* The directory names are not the names the skills give themselves, so a name
   read from the wrong one of the two is a failure rather than a coincidence.
   Alpha's description is wrapped the way a long one usually is. */
for (const [dir, name, description] of [
  ["zzz", "zulu", "description: A skill called zulu.\n"],
  ["aaa", "alpha", "description: >\n  A skill called alpha, whose description\n  was wrapped by hand.\n"],
] as const) {
  await fs.mkdir(path.join(shapes, "skills", dir), { recursive: true })
  await fs.writeFile(
    path.join(shapes, "skills", dir, "SKILL.md"),
    `---\nname: ${name}\n${description}---\n`,
    "utf8"
  )
}
await fs.mkdir(path.join(shapes, "commands", "git"), { recursive: true })
await fs.writeFile(
  path.join(shapes, "commands", "git", "commit.md"),
  "---\ndescription:\n  Write a commit,\n  twice over.\n---\n",
  "utf8"
)
await fs.writeFile(path.join(shapes, "commands", "notes.txt"), "not a command\n", "utf8")
const declared = '{\n  "mcpServers": { "ping": { "command": "ping" } }\n}\n'
await fs.writeFile(path.join(shapes, ".mcp.json"), declared, "utf8")

const more = await readPackContents(shapes)
check("a directory with no SKILL.md is not a skill", more.skills.length === 2, more.skills)
check(
  "skills come back in the order a list reads them",
  more.skills.map((one) => one.title).join(",") === "alpha,zulu",
  more.skills
)
/* One strict comparison rather than a look for what should be absent: a title
   the filter failed to drop is only visible against the whole list. */
check(
  "the commands are the markdown files under commands/, however deep they sit",
  more.commands.map((one) => one.title).join(",") === "commit,greet",
  more.commands
)
check(
  "a description written under its key is read as the value",
  more.skills[0]?.description === "A skill called alpha, whose description was wrapped by hand.",
  more.skills
)
check(
  "and one wrapped by hand reads as one line",
  more.commands[0]?.description === "Write a commit, twice over.",
  more.commands
)
check("the declared servers come back exactly as written", more.mcp === declared)

/* A directory holding nothing of the three is the ordinary case, not a failure:
   it is what says the three tabs are not offered at all. */
const bare = path.join(root, "bare")
await fs.mkdir(bare, { recursive: true })
const none = await readPackContents(bare)
check(
  "a directory carrying none of the three answers empty",
  none.skills.length === 0 && none.commands.length === 0 && none.mcp === null,
  none
)

await fs.rm(root, { recursive: true, force: true })

console.log(`\n${failures === 0 ? "all checks passed" : `${String(failures)} failed`} (${String(checked)} checks)`)
process.exit(failures === 0 ? 0 : 1)
