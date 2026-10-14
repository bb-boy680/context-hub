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

import { folderHash } from "@workspace/core/host/folder-hash"
import { createAssetStore, type AssetSink } from "@workspace/core"
import { createFsAssetLibrary } from "@workspace/core/host"

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
import { createFsPluginLibrary } from "../src/host/library.ts"
import { findLogo } from "../src/host/logo.ts"
import { bestPicture, pictureOf } from "../src/pictures.ts"
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
  return spec.kind === "git" && spec.url === "https://github.com/DietrichGebert/ponytail"
})())
check("a repository URL is that repository", (() => {
  const spec = parsePluginSource("https://github.com/owner/repo")
  return spec.kind === "git" && spec.url === "https://github.com/owner/repo"
})())
check("a fragment is the ref", (() => {
  const spec = parsePluginSource("owner/repo#v2")
  return spec.kind === "git" && spec.ref === "v2"
})())
check("an @ on a shorthand is the ref too", (() => {
  const spec = parsePluginSource("owner/repo@v2")
  return spec.kind === "git" && spec.ref === "v2" && spec.url === "https://github.com/owner/repo"
})())
check("both spellings read alike", (() => {
  const hash = parsePluginSource("owner/repo#main")
  const at = parsePluginSource("owner/repo@main")
  return formatPluginSource(hash) === formatPluginSource(at)
})())
check("a host shorthand expands", (() => {
  const spec = parsePluginSource("gitlab:owner/repo")
  return spec.kind === "git" && spec.url === "https://gitlab.com/owner/repo"
})())
/* An scp address carries an `@` for its own reasons, so it must not be read as a
   pinned ref. */
check("an scp address keeps the user's @", (() => {
  const spec = parsePluginSource("git@github.com:owner/repo.git")
  return spec.kind === "git" && spec.url === "git@github.com:owner/repo.git" && spec.ref === undefined
})())
check("a distinct git protocol URL is one", (() => {
  const spec = parsePluginSource("git://example.test/repo.git")
  return spec.kind === "git" && spec.url === "git://example.test/repo.git"
})())
check("an absolute path is a directory", parsePluginSource("/tmp/pack").kind === "path")
check("a windows path is a directory", parsePluginSource("D:\\packs\\x").kind === "path")
check("a file URL is a directory", (() => {
  const spec = parsePluginSource("file:///tmp/pack")
  return spec.kind === "path" && spec.path === "/tmp/pack"
})())
check("an archive URL is an archive", parsePluginSource("https://x.test/p.zip").kind === "archive")
check("a tarball URL is an archive", parsePluginSource("https://x.test/p.tgz").kind === "archive")
check(
  "an address reads back as text",
  formatPluginSource({ kind: "git", url: "https://x.test/r", ref: "v1" }) === "https://x.test/r#v1"
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
const gitOrigin: PluginOrigin = { kind: "git", url: "/tmp/x", revision: "abc1234" }
const pathOrigin: PluginOrigin = { kind: "path", path: source }
check("a git source reports its revision", installedRevision(gitOrigin) === "abc1234")
check("a local directory reports none", installedRevision(pathOrigin) === null)
check("a repository can be asked about", hasUpstream(gitOrigin))
check("a local directory cannot", !hasUpstream(pathOrigin))

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
  { name: "good", version: "1", source: { kind: "archive", url: "https://x.test/a.tgz" }, hash: "h" },
  { name: "broken" },
  { version: "2", source: { kind: "git", url: "u", revision: "r" }, hash: "h" },
  record,
]
const read = readIndex(stored)
check("a usable record is kept", read[0]?.name === "good")
check("a record with no source is dropped", !read.some((one) => one.name === "broken"))
check("a record with no name is dropped", read.length === 2, read.map((one) => one.name))
check("an unreadable file reads as empty", readIndex({ plugins: {} }).length === 0)
check("an empty index is an empty array", emptyIndex().length === 0)
check("an empty file is one empty array", serializeIndex(emptyIndex()) === "[]\n")

/* A record written before the two fields were told apart kept the pack's mark
   among the pictures a person adds. Reading one puts the mark back where it
   belongs, and leaves a picture somebody added alone. */
const mixed = readIndex([
  {
    name: "old-pack",
    version: "1",
    source: { kind: "path", path: "/somewhere" },
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
    source: { kind: "path", path: "/somewhere" },
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
check("a local directory is recorded as one", collected.record.source.kind === "path")
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
  uploaded.record.source.kind === "path" && uploaded.record.source.path === "dropped/plugins/acme-hello",
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
check("the two are told apart by where they sat", other.record.source.kind === "path" && other.record.source.path !== uploaded.record.source.path)
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
    { kind: "git", url: repo, ...(at === undefined ? {} : { ref: at }), revision },
    await folderHash(pack)
  )
}

const cloned = await takeFromRepo(repoLibrary)
check(
  "a pack taken from a repository records its revision",
  cloned.source.kind === "git" && /^[0-9a-f]{40}$/.test(cloned.source.revision),
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
    (cloned.source.kind === "git" ? cloned.source.revision : ""),
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
  after?.source.kind === "git" && after.source.revision === applied.to
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
  remove: async (name, scope) => {
    const at = stubHeld.findIndex((one) => one.name === name && one.scope === scope)
    if (at !== -1) stubHeld.splice(at, 1)
    return { message: `${name} out of ${scope}` }
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
await registered.remove("acme-hello", "user", tools)
check("removing one scope leaves the other", (await heldScopes("acme-hello")) === "project")
unregister()
check("the disposer takes it back out", registry.installers().length === 0)

await fs.rm(root, { recursive: true, force: true })

console.log(`\n${failures === 0 ? "all checks passed" : `${String(failures)} failed`} (${String(checked)} checks)`)
process.exit(failures === 0 ? 0 : 1)
