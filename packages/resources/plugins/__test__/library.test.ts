/**
 * Behaviour of the plugin library: what reading an address accepts and refuses,
 * what collecting one writes, what a pack's own logo is taken to be, whether a
 * moved source is noticed, and what the registry an agent plugin registers into
 * hands an installer.
 *
 * Everything here runs against a temporary hub home and a git repository made on
 * the spot, so nothing touches a real library, a real agent, or the network.
 *
 * The cases run in the order they are written: each block reads the libraries and
 * the folders the one before it left behind, so a suite depends on the suites
 * above it. The temporary root is removed at the end.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { Context } from "@deepseek-ai/cordis"

import { createAssetStore, type AssetSink } from "@context-hub/core"
import { createFsAssetLibrary } from "@context-hub/core/host"
import { folderHash } from "@context-hub/core/host/folder-hash"

import { hasUpstream, installedRevision, type PluginOrigin } from "../src/contract.ts"
import { formatPluginSource, parsePluginSource } from "../src/inspect.ts"
import { emptyIndex, readIndex, serializeIndex } from "../src/records.ts"
import {
  PluginService,
  type PluginHeld,
  type PluginInstaller,
  type PluginTools,
} from "../src/provider.ts"
import { modified, outdated, type PluginRecord } from "../src/revision.ts"
import { createPluginCollector, type PackUpload, type PluginCollected } from "../src/host/collect.ts"
import { readPackContents } from "../src/host/contents.ts"
import { fetchPlugin, stagingDir } from "../src/host/fetch.ts"
import { createFsPluginLibrary, listDirectory, readInDirectory } from "../src/host/library.ts"
import { findLogo } from "../src/host/logo.ts"
import { bestPicture, pictureOf } from "../src/pictures.ts"
import { runProgram } from "../src/host/program.ts"
import { createPluginProbe } from "../src/host/probe.ts"
import { createPluginUpdater } from "../src/host/update.ts"

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

/**
 * The message a refusal carries. `rejects.toThrow` proves the throw and the words
 * in it; the two cases that need two facts out of one message read it here once,
 * so both facts are about the one refusal.
 */
async function refusalOf(run: () => unknown): Promise<string> {
  try {
    await run()
    return ""
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/* One temporary root for the whole file. It is made here rather than in a hook so
   every path below can be a constant, and it is removed at the end. */
const root = await fs.mkdtemp(path.join(tmpdir(), "hub-plugin-check-"))
const home = path.join(root, "hub")
const source = path.join(root, "source")

const library = createFsPluginLibrary(home)
const collector = createPluginCollector(library)

const uploadHub = path.join(root, "upload-hub")
const uploadLibrary = createFsPluginLibrary(uploadHub)
const uploadCollector = createPluginCollector(uploadLibrary)
const droppedPacks = path.join(root, "dropped", "plugins")

const twiceHub = path.join(root, "twice-hub")
const twice = createFsPluginLibrary(twiceHub)
const twiceCollector = createPluginCollector(twice)
const typed = path.join(root, "typed")

const orphanHub = path.join(root, "orphan-hub")
const orphanLibrary = createFsPluginLibrary(orphanHub)
const orphanCollector = createPluginCollector(orphanLibrary)
const orphanSource = path.join(root, "orphan-source")
const orphanIndex = path.join(orphanHub, "plugins", "plugins.json")

const logoPack = path.join(root, "logo-pack")
const logoHub = path.join(root, "logo-hub")
const logoLibrary = createFsPluginLibrary(logoHub)

const repo = path.join(root, "repo")
const repoHub = path.join(root, "repo-hub")
const repoLibrary = createFsPluginLibrary(repoHub)
const probe = createPluginProbe(repoLibrary)

const monorepo = path.join(root, "monorepo")
const subdirLibrary = createFsPluginLibrary(path.join(root, "subdir-hub"))

const shapes = path.join(root, "shapes")

/* The collection cases below read these; each is assigned by the suite that owns
   it, and the suites run in the order they are written. */
let collected: PluginCollected
let orphan: PluginCollected
let first: PluginRecord
let cloned: PluginRecord

beforeAll(async () => {
  await fs.mkdir(home, { recursive: true })
  await writePack(source, "1.0.0")
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe("reading an address", () => {
  it("takes owner/repo as the repository it names", () => {
    expect(
      parsePluginSource("DietrichGebert/ponytail"),
      "owner/repo becomes the repository it names"
    ).toMatchObject({ kind: "url", url: "https://github.com/DietrichGebert/ponytail" })
  })

  it("takes a repository URL as that repository", () => {
    expect(
      parsePluginSource("https://github.com/owner/repo"),
      "a repository URL is that repository"
    ).toMatchObject({ kind: "url", url: "https://github.com/owner/repo" })
  })

  it("reads a fragment as the ref", () => {
    expect(parsePluginSource("owner/repo#v2"), "a fragment is the ref").toMatchObject({
      kind: "url",
      ref: "v2",
    })
  })

  it("reads an @ on a shorthand as the ref too", () => {
    expect(
      parsePluginSource("owner/repo@v2"),
      "an @ on a shorthand is the ref too"
    ).toMatchObject({ kind: "url", ref: "v2", url: "https://github.com/owner/repo" })
  })

  it("reads both spellings of a ref alike", () => {
    const hash = parsePluginSource("owner/repo#main")
    const at = parsePluginSource("owner/repo@main")
    expect(formatPluginSource(at), "both spellings read alike").toBe(formatPluginSource(hash))
  })

  it("expands a host shorthand", () => {
    expect(
      parsePluginSource("gitlab:owner/repo"),
      "a host shorthand expands"
    ).toMatchObject({ kind: "url", url: "https://gitlab.com/owner/repo" })
  })

  /* An scp address carries an `@` for its own reasons, so it must not be read as a
     pinned ref — which is what an exact match here says, a ref left out being the
     same as no ref. */
  it("keeps the user's @ in an scp address", () => {
    expect(
      parsePluginSource("git@github.com:owner/repo.git"),
      "an scp address keeps the user's @, and is read as no ref"
    ).toEqual({ kind: "url", url: "git@github.com:owner/repo.git" })
  })

  it("takes a distinct git protocol URL as one", () => {
    expect(
      parsePluginSource("git://example.test/repo.git"),
      "a distinct git protocol URL is one"
    ).toMatchObject({ kind: "url", url: "git://example.test/repo.git" })
  })

  it("reads an absolute path as a directory", () => {
    expect(parsePluginSource("/tmp/pack").kind, "an absolute path is a directory").toBe("local")
  })

  it("reads a windows path as a directory", () => {
    expect(parsePluginSource("D:\\packs\\x").kind, "a windows path is a directory").toBe("local")
  })

  it("reads a file URL as a directory", () => {
    expect(parsePluginSource("file:///tmp/pack"), "a file URL is a directory").toMatchObject({
      kind: "local",
      path: "/tmp/pack",
    })
  })

  it("reads an archive URL as an archive", () => {
    expect(parsePluginSource("https://x.test/p.zip").kind, "an archive URL is an archive").toBe(
      "archive"
    )
  })

  it("reads a tarball URL as an archive", () => {
    expect(parsePluginSource("https://x.test/p.tgz").kind, "a tarball URL is an archive").toBe(
      "archive"
    )
  })

  it("reads an address back as the text it came from", () => {
    expect(
      formatPluginSource({ kind: "url", url: "https://x.test/r", ref: "v1" }),
      "an address reads back as text"
    ).toBe("https://x.test/r#v1")
  })

  it("reads a subdirectory address back as one", () => {
    expect(
      formatPluginSource({ kind: "git-subdir", url: "https://x.test/r", path: "tools/one" }),
      "a subdirectory address reads back as one"
    ).toBe("https://x.test/r/tools/one")
  })

  /* A relative path is refused because the host's working directory means nothing
     to a person typing into a browser; a bare word is refused because looking a
     name up is a marketplace's job, and this hub takes addresses. */
  describe("an address this build does not take", () => {
    it("refuses an empty address, naming it rather than the field", async () => {
      const message = await refusalOf(() => parsePluginSource(""))
      expect(message, "an empty address is refused").not.toBe("")
      expect(message, "and the refusal names the address, not the field").not.toContain(
        "plugin source"
      )
    })

    it("refuses a relative path, naming it rather than the field", async () => {
      const message = await refusalOf(() => parsePluginSource("./relative"))
      expect(message, "a relative path is refused").not.toBe("")
      expect(message, "and the refusal names the address, not the field").not.toContain(
        "plugin source"
      )
    })

    it("refuses a parent-relative path, naming it rather than the field", async () => {
      const message = await refusalOf(() => parsePluginSource("../up"))
      expect(message, "a parent-relative path is refused").not.toBe("")
      expect(message, "and the refusal names the address, not the field").not.toContain(
        "plugin source"
      )
    })

    it("refuses a home shortcut, naming it rather than the field", async () => {
      const message = await refusalOf(() => parsePluginSource("~/packs/x"))
      expect(message, "a home shortcut is refused").not.toBe("")
      expect(message, "and the refusal names the address, not the field").not.toContain(
        "plugin source"
      )
    })

    it("refuses a bare name, naming it rather than the field", async () => {
      const message = await refusalOf(() => parsePluginSource("airwallex-dev"))
      expect(message, "a bare name is refused").not.toBe("")
      expect(message, "and the refusal names the address, not the field").not.toContain(
        "plugin source"
      )
    })

    it("refuses a name with a space, naming it rather than the field", async () => {
      const message = await refusalOf(() => parsePluginSource("not an address"))
      expect(message, "a name with a space is refused").not.toBe("")
      expect(message, "and the refusal names the address, not the field").not.toContain(
        "plugin source"
      )
    })
  })
})

describe("records", () => {
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

  describe("what a source can be asked", () => {
    it("reports the revision a repository was at", () => {
      expect(installedRevision(gitOrigin), "a git source reports its revision").toBe("abc1234")
    })

    it("reports no revision for a directory on this machine", () => {
      expect(installedRevision(pathOrigin), "a local directory reports none").toBeNull()
    })

    it("can be asked about when it is a repository", () => {
      expect(hasUpstream(gitOrigin), "a repository can be asked about").toBe(true)
    })

    it("cannot be asked about when it is a directory on this machine", () => {
      expect(hasUpstream(pathOrigin), "a local directory cannot").toBe(false)
    })

    /* A subdirectory's revision is the repository's, and what a check would have to
       ask about is the subdirectory's own last commit: this build says it cannot
       answer rather than reporting an update whenever any other directory moves. */
    it("is not asked about yet when it is one directory of a repository", () => {
      expect(hasUpstream(subdirOrigin), "a subdirectory is not asked about yet").toBe(false)
    })

    it("still reads its revision back", () => {
      expect(installedRevision(subdirOrigin), "its revision still reads back").toBe("abc1234")
    })
  })

  /* One record, read by the cases about updating and editing and by the ones about
     reading the index back. */
  const record = {
    name: "acme-hello",
    version: "1.0.0",
    description: "",
    tags: [],
    icon: "",
    source: gitOrigin,
    hash: "hash-one",
    assets: [],
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }

  describe("an update, and an edit", () => {
    it("reports neither while the pack has not been checked", () => {
      expect(outdated(record), "an unchecked pack is not ahead of anything").toBe(false)
    })

    it("reports no update while a check found the same revision", () => {
      expect(
        outdated({ ...record, checked: { at: "now", latest: "abc1234", currentHash: "hash-one" } }),
        "a check that found the same revision is not an update"
      ).toBe(false)
    })

    it("reports an update once a check found a different revision", () => {
      expect(
        outdated({ ...record, checked: { at: "now", latest: "def5678", currentHash: "hash-one" } }),
        "a check that found a different revision is"
      ).toBe(true)
    })

    it("reports no edit while the hash matches", () => {
      expect(
        modified({ ...record, checked: { at: "now", currentHash: "hash-one" } }),
        "a matching hash is not an edit"
      ).toBe(false)
    })

    it("reports an edit once the hash differs", () => {
      expect(
        modified({ ...record, checked: { at: "now", currentHash: "hash-two" } }),
        "a different hash is"
      ).toBe(true)
    })
  })

  /* The index is durable JSON a person may edit: a record this build cannot use is
     dropped, not fatal to the rest. */
  describe("reading the index", () => {
    const read = readIndex([
      {
        name: "good",
        version: "1",
        source: { source: "archive", url: "https://x.test/a.tgz" },
        hash: "h",
      },
      { name: "broken" },
      { version: "2", source: { source: "url", url: "u", revision: "r" }, hash: "h" },
      record,
    ])

    it("keeps a record this build can use", () => {
      expect(read[0]?.name, "a usable record is kept").toBe("good")
    })

    it("drops a record with no source", () => {
      expect(
        read.map((one) => one.name),
        "a record with no source is dropped"
      ).not.toContain("broken")
    })

    it("drops a record with no name, keeping the rest", () => {
      expect(read, "a record with no name is dropped").toHaveLength(2)
    })

    it("reads an unreadable file as empty", () => {
      expect(readIndex({ plugins: {} }), "an unreadable file reads as empty").toHaveLength(0)
    })

    it("reads an empty index as an empty array", () => {
      expect(emptyIndex(), "an empty index is an empty array").toEqual([])
    })

    it("writes an empty index as one empty array", () => {
      expect(serializeIndex(emptyIndex()), "an empty file is one empty array").toBe("[]\n")
    })
  })

  /* The four words were rewritten once: a repository was `git`, a directory here
     was `path`, and an archive's validator was `etag`. A library collected by that
     build has to read back as the words this one stores, or a person's packs would
     be dropped by an upgrade. */
  describe("a library collected by an older build", () => {
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

    it("reads a repository written as git as a url", () => {
      expect(older[0]?.source, "a repository written as git reads as a url").toMatchObject({
        kind: "url",
      })
    })

    it("keeps the ref it was taken at", () => {
      expect(older[0]?.source, "and keeps the ref it was taken at").toMatchObject({ ref: "v1" })
    })

    it("reads a directory written as path as local", () => {
      expect(older[1]?.source, "a directory written as path reads as local").toMatchObject({
        kind: "local",
      })
    })

    it("reads an archive's etag as its revision", () => {
      expect(
        older[2]?.source,
        "an archive's etag reads as its revision"
      ).toMatchObject({ kind: "archive", revision: "W/1" })
    })

    it("reads a subdirectory written by this build back whole", () => {
      const sub = readIndex([
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
      expect(sub?.source, "a subdirectory written by this build reads back whole").toMatchObject({
        kind: "git-subdir",
        path: "tools/one",
        ref: "main",
        revision: "bbb",
      })
    })
  })

  /* A record written before the two fields were told apart kept the pack's mark
     among the pictures a person adds. Reading one puts the mark back where it
     belongs, and leaves a picture somebody added alone. */
  describe("a mark kept among the assets", () => {
    const mixed = readIndex([
      {
        name: "old-pack",
        version: "1",
        source: { source: "local", path: "/somewhere" },
        hash: "h",
        assets: ["assets/old-pack/logo.png", "https://cdn.test/shot.png"],
      },
    ])[0]
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

    it("reads a mark kept among the assets as the icon", () => {
      expect(mixed?.icon, "a mark kept among the assets reads as the icon").toBe(
        "assets/old-pack/logo.png"
      )
    })

    it("leaves a picture a person added a picture", () => {
      expect(mixed?.assets, "and a picture a person added stays a picture").toEqual([
        "https://cdn.test/shot.png",
      ])
    })

    it("keeps a declared icon as written", () => {
      expect(named?.icon, "a declared icon is kept as written").toBe("assets/named-pack/icon.png")
    })

    it("leaves nothing behind for a copy of it kept among the assets", () => {
      expect(
        named?.assets,
        "and a copy of it kept among the assets leaves nothing behind"
      ).toEqual(["assets/added-by-hand.png"])
    })
  })
})

describe("collecting", () => {
  beforeAll(async () => {
    collected = await collector.add(source)
  })

  it("collects a fresh address as the pack its manifest names", () => {
    expect(collected.already, "a fresh address is collected").toBe(false)
    expect(collected.record.name, "the pack landed under its own manifest name").toBe("acme-hello")
    expect(collected.record.version, "its version was read from the manifest").toBe("1.0.0")
    expect(collected.record.description, "its description was read").toContain("hello")
    expect(collected.record.source.kind, "a local directory is recorded as one").toBe("local")
    expect(collected.record.tags, "its tags start empty").toHaveLength(0)
    expect(collected.record.icon, "it has no picture of its own").toBe("")
    expect(collected.record.assets, "and none a person added").toHaveLength(0)
  })

  it("records the hash the files themselves have, and lands them", async () => {
    expect(collected.record.hash, "the recorded hash is the files' own").toBe(
      await folderHash(path.join(home, "plugins", "acme-hello"))
    )
    expect(
      await fs
        .stat(path.join(home, "plugins", "acme-hello", "skills", "hello", "SKILL.md"))
        .catch(() => null),
      "the pack's files are there"
    ).not.toBeNull()
  })

  it("writes the index as the agreed fields, in the order they are agreed in", async () => {
    const raw: unknown = JSON.parse(
      await fs.readFile(path.join(home, "plugins", "plugins.json"), "utf8")
    )
    expect(Array.isArray(raw), "the index is a top-level array").toBe(true)
    const index = raw as Record<string, unknown>[]
    expect(index, "it holds one record").toHaveLength(1)
    expect(Object.keys(index[0] ?? {}), "the record's fields are the agreed ones, in order").toEqual(
      [
        "name",
        "version",
        "description",
        "tags",
        "source",
        "hash",
        "icon",
        "assets",
        "installedAt",
        "updatedAt",
      ]
    )
  })

  /* The word travels under `source`, the key Claude Code's own marketplace schema
     spells its sources with, rather than under the `kind` this build used to write. */
  it("writes the source under its own word", async () => {
    const index = JSON.parse(
      await fs.readFile(path.join(home, "plugins", "plugins.json"), "utf8")
    ) as Record<string, unknown>[]
    expect(index[0]?.source, "the source is written under its own word").toEqual({
      source: "local",
      path: source,
    })
  })

  it("writes no marketplace index of its own beside the packs", async () => {
    expect(
      await fs.stat(path.join(home, "plugins", ".claude-plugin")).catch(() => null),
      "nothing writes a marketplace index beside it"
    ).toBeNull()
    expect(
      await fs.stat(path.join(home, "plugins", ".agents")).catch(() => null),
      "nor an agent's own directory"
    ).toBeNull()
  })

  /* The same address twice is one pack, and saying so is the answer rather than a
     failure: it is a read of the index, not a question for the source. */
  it("answers that the same address is already here", async () => {
    const repeated = await collector.add(source)
    expect(repeated.already, "the same address answers that it is already here").toBe(true)
    expect(repeated.record.name, "and names the pack that is here").toBe("acme-hello")
    expect(await library.list(), "nothing was added a second time").toHaveLength(1)
  })
})

describe("a folder a page read", () => {
  let uploaded: PluginCollected

  beforeAll(async () => {
    /* A page hands over files rather than a path, because a browser is told nothing
       about where a folder sits. The pack's own manifest still names it, and what the
       page called it is kept as where it came from — a pack found inside a folder is
       the pack, not the folder, so the two are not the same word. */
    const one = path.join(droppedPacks, "acme-hello")
    await writePack(one, "2.0.0")
    await writePicture(one, "assets/logo.png", "the logo")
    await writePicture(one, "skills/hello/reference.md", "More.\n")
    uploaded = await uploadCollector.addFolder("dropped/plugins/acme-hello", await uploads(one))
  })

  it("collects a folder a page read under its manifest's own name", async () => {
    expect(uploaded.record.name, "a folder a page read is collected").toBe("acme-hello")
    expect(uploaded.already, "it is not reported as already here").toBe(false)
    expect(await uploadLibrary.has("acme-hello"), "its files landed under the manifest's name").toBe(
      true
    )
    expect(
      await fs
        .stat(path.join(uploadHub, "plugins", "acme-hello", "skills", "hello", "reference.md"))
        .catch(() => null),
      "every file came across, not only the manifest"
    ).not.toBeNull()
  })

  it("records where the pack sat in the drop, and brings its picture", async () => {
    expect(
      uploaded.record.source,
      "what was recorded is where it sat in the drop"
    ).toMatchObject({ kind: "local", path: "dropped/plugins/acme-hello" })
    expect(await fs.readdir(path.join(uploadHub, "assets")), "and its picture came with it").toEqual(
      ["acme-hello-logo-7e0b9e9c.png"]
    )
  })

  /* A folder of packs is not one pack: the page collects each separately, so what
     it calls each one has to tell them apart — two packs from one drop share a
     folder but not a path. */
  it("tells a second pack from one drop apart by where it sat", async () => {
    const two = path.join(droppedPacks, "acme-other")
    await writePack(two, "1.0.0", "acme-other")
    const other = await uploadCollector.addFolder("dropped/plugins/acme-other", await uploads(two))
    expect(other.record.name, "a second pack from one drop is its own record").toBe("acme-other")
    expect(other.record.source, "the two are both folders here").toMatchObject({ kind: "local" })
    expect(
      other.record.source,
      "the two are told apart by where they sat"
    ).not.toEqual(uploaded.record.source)
    expect(await uploadLibrary.list(), "and both are in the library").toHaveLength(2)
  })

  /* The label is a label, not a location, but it still must not read as one: a
     path that would walk out of what was chosen is refused before anything lands.
     The refusal is thrown as the call is made, so it is asserted as one. */
  it("refuses a label that walks out of what was chosen", async () => {
    const files = await uploads(path.join(droppedPacks, "acme-other"))
    expect(
      () => uploadCollector.addFolder("../elsewhere", files),
      "a label that walks out is refused"
    ).toThrow(/unusable path/)
  })
})

describe("one folder, two ways in", () => {
  let byLabel: PluginCollected

  beforeAll(async () => {
    /* A dropped folder is recorded by the label it was chosen by, because a browser
       cannot say where it sits. The same folder typed as a path can never equal that
       label, so the name is what has to say the two are one pack — otherwise a person
       typing the path of the folder they just dropped is told a different pack is
       wearing the name. */
    await writePack(typed, "4.0.0", "twice-pack")
    await writePicture(typed, "assets/logo.png", "the logo")
    byLabel = await twiceCollector.addFolder("somewhere/twice-pack", await uploads(typed))
  })

  it("records a dropped folder by its label", () => {
    expect(byLabel.record.source, "a dropped folder is recorded by its label").toMatchObject({
      path: "somewhere/twice-pack",
    })
  })

  it("takes the same folder typed as a path as that pack", async () => {
    const byPath = await twiceCollector.add(typed)
    expect(byPath.already, "the same folder typed as a path is that pack").toBe(true)
    expect(await twice.list(), "nothing was written a second time").toHaveLength(1)
    expect((await twice.list())[0], "and the label it was first recorded by stands").toMatchObject({
      source: { path: "somewhere/twice-pack" },
    })
  })

  /* Edited since it was dropped: what the person handed over is what belongs here,
     and it is the same folder either way. */
  it("takes a folder whose files moved on again, keeping what it holds now", async () => {
    await fs.writeFile(
      path.join(typed, "skills", "hello", "SKILL.md"),
      "---\nname: hello\n---\n\nChanged since.\n",
      "utf8"
    )
    const movedOn = await twiceCollector.add(typed)
    expect(movedOn.already, "a folder whose files moved on is taken again").toBe(false)
    expect(
      await fs.readFile(
        path.join(twiceHub, "plugins", "twice-pack", "skills", "hello", "SKILL.md"),
        "utf8"
      ),
      "and what is here is what it holds now"
    ).toContain("Changed since")
  })

  /* The label travels the other way too, and a path typed with the other separator
     names the same folder. */
  it("takes a path typed with either separator as that folder", async () => {
    const bySlash = await twiceCollector.add(typed.replace(/\\/g, "/"))
    expect(bySlash.already, "the path in either separator is that folder").toBe(true)
  })

  /* A dropped folder under a name the library already holds is that pack, because
     the label it arrives with cannot be compared to anything. */
  it("takes a dropped folder of that name as the same pack", async () => {
    const files = await uploads(typed)
    const droppedAgain = await twiceCollector.addFolder("elsewhere/twice-pack", files)
    expect(droppedAgain.already, "a dropped folder of that name is the same pack").toBe(true)
  })

  /* Two folders a person named by path are comparable, and differing ones are two
     packs: which belongs here is the person's call rather than this hub's. */
  it("refuses a second path of that name", async () => {
    const otherFolder = path.join(root, "other-twice")
    await writePack(otherFolder, "6.0.0", "twice-pack")
    await expect(
      twiceCollector.add(otherFolder),
      "a second path of that name is refused"
    ).rejects.toThrow(/already in this library/)
  })
})

describe("an index that lost a record", () => {
  beforeAll(async () => {
    /* The index is durable JSON a person may edit, and a directory is a fact whether
       or not the index knows about it. A record deleted by hand leaves its pack on
       disk, so adding that address again has to put the record back rather than
       refuse the name the directory still holds. */
    await writePack(orphanSource, "1.0.0")
    await writePicture(orphanSource, "assets/logo.png", "the orphan's logo")
    orphan = await orphanCollector.add(orphanSource)
    await fs.writeFile(orphanIndex, "[]\n", "utf8")
  })

  it("leaves the pack's directory where the index no longer names it", async () => {
    expect(
      await orphanLibrary.has(orphan.record.name),
      "the pack's directory is still there after the record is deleted"
    ).toBe(true)
    expect(await orphanLibrary.list(), "and the index no longer lists it").toHaveLength(0)
  })

  it("records the pack again rather than refusing the name the directory holds", async () => {
    const restored = await orphanCollector.add(orphanSource)
    expect(restored.record.name, "adding that address again records the pack").toBe("acme-hello")
    expect(restored.already, "it is not reported as something that was already here").toBe(false)
    expect(await orphanLibrary.list(), "the record is back in the index").toHaveLength(1)
    expect(restored.record.hash, "and it describes the files that are here").toBe(
      await folderHash(path.join(orphanHub, "plugins", "acme-hello"))
    )
    /* The copy the index lost track of is cleared before the record is written again,
       so recovering a pack does not leave a second copy of its picture behind. */
    expect(
      await fs.readdir(path.join(orphanHub, "assets")),
      "and its picture is stored once, not twice"
    ).toEqual(["acme-hello-logo-8da96759.png"])
  })

  it("finds it here on the next attempt", async () => {
    const third = await orphanCollector.add(orphanSource)
    expect(third.already, "a third attempt then finds it here").toBe(true)
  })
})

describe("a pack whose files were deleted", () => {
  /* A record outliving its directory is a memory of a pack rather than the pack. A
     directory that lost its manifest is the same thing: nothing could describe it.
     Both are what makes an address worth fetching again. */
  it("stops counting a record whose folder is gone as a pack that is here", async () => {
    await fs.rm(path.join(orphanHub, "plugins", "acme-hello"), { recursive: true, force: true })
    expect(
      await orphanLibrary.has("acme-hello"),
      "a record whose folder is gone is not a pack that is here"
    ).toBe(false)
  })

  it("fetches the pack again, keeping its picture once", async () => {
    const refetched = await orphanCollector.add(orphanSource)
    expect(refetched.already, "adding that address fetches the pack again").toBe(false)
    expect(await orphanLibrary.has("acme-hello"), "the files are back").toBe(true)
    expect(
      await fs.readdir(path.join(orphanHub, "assets")),
      "and its picture is there once"
    ).toEqual(["acme-hello-logo-8da96759.png"])
  })

  /* A folder that is there but holds no manifest is not a pack either. */
  it("fetches a folder that lost its manifest again too", async () => {
    await fs.rm(path.join(orphanHub, "plugins", "acme-hello", ".claude-plugin"), {
      recursive: true,
      force: true,
    })
    expect(
      await orphanLibrary.has("acme-hello"),
      "a folder that lost its manifest is not a pack that is here"
    ).toBe(false)
    const refetchedAgain = await orphanCollector.add(orphanSource)
    expect(refetchedAgain.already, "and that fetches it again too").toBe(false)
    expect(await orphanLibrary.has("acme-hello"), "the manifest is back").toBe(true)
    expect(await fs.readdir(path.join(orphanHub, "assets")), "with its picture stored once").toEqual([
      "acme-hello-logo-8da96759.png",
    ])
  })

  /* A directory holding a *different* pack under a name the index lost is replaced
     by what the address holds: the address is what was asked for. */
  it("replaces a directory holding another pack under a lost name", async () => {
    const otherContent = path.join(root, "other-content")
    await writePack(otherContent, "3.0.0")
    await fs.writeFile(path.join(otherContent, "commands", "greet.md"), "Different.\n", "utf8")
    await fs.writeFile(orphanIndex, "[]\n", "utf8")
    const replaced = await orphanCollector.add(otherContent)
    expect(replaced.already, "a lost name holding another pack takes what was asked for").toBe(
      false
    )
    expect(
      await fs.readFile(
        path.join(orphanHub, "plugins", "acme-hello", "commands", "greet.md"),
        "utf8"
      ),
      "with the files the address holds"
    ).toBe("Different.\n")
    expect(await orphanLibrary.list(), "and the index lists it again").toHaveLength(1)
  })
})

describe("a pack with no manifest", () => {
  /* A directory that carries no plugin manifest has no name to record it under, so
     it is refused rather than recorded under a name this hub invented. */
  it("refuses a directory with no manifest, and records nothing", async () => {
    const nameless = path.join(root, "nameless")
    await fs.mkdir(path.join(nameless, "docs"), { recursive: true })
    await fs.writeFile(path.join(nameless, "README.md"), "nothing here\n", "utf8")
    await expect(collector.add(nameless), "a directory with no manifest is refused").rejects.toThrow(
      /no plugin manifest/
    )
    expect(await library.list(), "and nothing was recorded").toHaveLength(1)
  })

  /* A file with that name may still be somebody else's — a repository root carries
     a `plugin.json` for its own tooling often enough that the refusal has to say
     which of the two it found. */
  it("says so when a root manifest names no plugin", async () => {
    const foreign = path.join(root, "foreign-manifest")
    await fs.mkdir(foreign, { recursive: true })
    await fs.writeFile(
      path.join(foreign, "plugin.json"),
      `${JSON.stringify({ build: { out: "dist" } }, null, 2)}\n`,
      "utf8"
    )
    await expect(collector.add(foreign), "a manifest that names no plugin says so").rejects.toThrow(
      /names no plugin/
    )
  })

  /* A root manifest is the fallback for a pack from before the convention. */
  it("takes a root plugin.json as naming the pack", async () => {
    const legacy = path.join(root, "legacy")
    await fs.mkdir(legacy, { recursive: true })
    await fs.writeFile(
      path.join(legacy, "plugin.json"),
      `${JSON.stringify({ name: "legacy-pack" })}\n`,
      "utf8"
    )
    expect((await collector.add(legacy)).record.name, "a root plugin.json names the pack").toBe(
      "legacy-pack"
    )
  })

  /* A name no filesystem would take is refused rather than rewritten: the name is
     the identity, so quietly changing it would change what the pack is. */
  it("refuses a name that is not a directory name", async () => {
    const awkward = path.join(root, "awkward")
    await fs.mkdir(path.join(awkward, ".claude-plugin"), { recursive: true })
    await fs.writeFile(
      path.join(awkward, ".claude-plugin", "plugin.json"),
      `${JSON.stringify({ name: "@scope/pkg", version: "1.0.0" })}\n`,
      "utf8"
    )
    await expect(
      collector.add(awkward),
      "a name that is not a directory name is refused"
    ).rejects.toThrow(/unusable/)
  })

  /* The same name from somewhere else is a different pack wearing it, which is the
     person's call rather than this hub's — so it is refused, and the refusal names
     where the one that is here came from. */
  it("refuses a second pack wearing a taken name, naming the address it came from", async () => {
    const impostor = path.join(root, "impostor")
    await writePack(impostor, "9.9.9", "acme-hello")
    const refusal = await refusalOf(() => collector.add(impostor))
    expect(refusal, "a second pack wearing a taken name is refused").toContain(
      "already in this library"
    )
    expect(refusal, "and the refusal names the address it came from").toContain(root)
    expect(await library.list(), "while the pack that was here is untouched").toHaveLength(2)
  })
})

describe("a pack's own logo", () => {
  let second: PluginRecord

  beforeAll(async () => {
    await writePack(logoPack, "1.0.0")
    await writePicture(logoPack, "assets/logo.png", "the logo")
    await writePicture(logoPack, "assets/logo-dark.png", "a variant of it")
    await writePicture(logoPack, "assets/retriever-logo-dark.svg", "somebody else's mark")
    await writePicture(logoPack, "docs/a/b/icon.svg", "too deep to be looked at")
    await writePicture(path.join(logoPack, "node_modules", "left-pad"), "logo.png", "a dependency's")
    first = (await createPluginCollector(logoLibrary).add(logoPack)).record
  })

  it("takes a plain logo near the root as the pack's picture", async () => {
    expect(await findLogo(logoPack), "a plain logo, near the root, wins").toBe("assets/logo.png")
  })

  it("finds no picture in a pack that ships none", async () => {
    const noLogo = path.join(root, "no-logo")
    await writePack(noLogo, "1.0.0")
    expect(await findLogo(noLogo), "a pack with no picture finds none").toBeUndefined()
  })

  describe("the rule that says what a picture is", () => {
    /* The rule is shared with the page that scans a folder, which applies it to the
       tree it has already read rather than walking a disk. Both go through this, so a
       row cannot offer a picture the library would then say the pack does not have. */
    it("picks the same file the walk picks", () => {
      const ranked = ["assets/logo-dark.png", "logo.png", "assets/retriever-logo-dark.svg"].map(
        (one, at) => pictureOf(one, at === 1 ? 1 : 2)!
      )
      expect(bestPicture(ranked)?.relative, "the rule picks the same file the walk does").toBe(
        "logo.png"
      )
    })

    it("is not a name that merely contains the word", () => {
      expect(
        pictureOf("assets/screenshot.png", 2),
        "a name that is not a picture is not one"
      ).toBeNull()
      expect(pictureOf("logo.txt", 1), "a file that is not a picture is not one").toBeNull()
      expect(pictureOf("catalogue.png", 1), "a name merely containing one is not").toBeNull()
      expect(pictureOf("my-logo.png", 1), "but one that carries it is").not.toBeNull()
      expect(pictureOf("icon.svg", 1), "and one that says it another way is too").not.toBeNull()
      expect(bestPicture([]), "nothing found is no picture").toBeUndefined()
    })

    it("bounds itself by its own depth rather than by the walk's", () => {
      expect(
        pictureOf("a/b/logo.png", 3),
        "the depth bound is the rule's, not the walk's"
      ).not.toBeNull()
      expect(pictureOf("a/b/c/logo.png", 4), "and one level too deep is no picture").toBeNull()
      expect(
        pictureOf("node_modules/left-pad/logo.png", 3),
        "and a dependency's pictures are nobody's"
      ).toBeNull()
      expect(pictureOf(".git/logo.png", 2), "nor are a generated directory's").toBeNull()
    })
  })

  /* A logo is *copied* into the hub's own asset directory, because a record holds
     one kind of reference and a reference that only resolves while the pack is
     installed is not one. The file is flat and named after the pack, so two packs
     that ship a `logo.png` never share one. */
  it("points the record at a copy, named after the pack and its bytes", async () => {
    expect(
      first.icon,
      "the record points at the copy, named after the pack and its bytes"
    ).toBe("assets/acme-hello-logo-7e0b9e9c.png")
    expect(first.assets, "and it is not filed among what a person added").toHaveLength(0)
    expect(
      await fs.readFile(path.join(logoHub, "assets", "acme-hello-logo-7e0b9e9c.png"), "utf8"),
      "and the copy really is in the hub's asset directory, in no directory of its own"
    ).toBe("the logo")
  })

  /* Two packs that each ship a `logo.png` keep one file each, and removing one
     takes only what it brought. */
  it("keeps one file per pack when two packs ship a logo.png", async () => {
    const otherPack = path.join(root, "other-pack")
    await writePack(otherPack, "2.0.0", "other-pack")
    await writePicture(otherPack, "assets/logo.png", "the other pack's logo")
    second = (await createPluginCollector(logoLibrary).add(otherPack)).record
    expect(
      second.icon,
      "each copy is kept under the name of the pack that brought it"
    ).toBe("assets/other-pack-logo-e157ef72.png")
    expect(second.icon, "a second pack's logo does not collide with the first").not.toBe(first.icon)
    expect(
      await fs.readFile(path.join(logoHub, "assets", "acme-hello-logo-7e0b9e9c.png"), "utf8"),
      "and the first file is untouched"
    ).toBe("the logo")
  })

  /* The same pack read again stores the same file rather than a second copy: a
     scan runs on every page load, so this is what keeps the directory from
     growing. */
  it("stores the same file again rather than a second copy", async () => {
    const again = (await createPluginCollector(logoLibrary).add(logoPack)).record
    expect(again.icon, "reading a pack again keeps one copy of its picture").toBe(first.icon)
    expect(
      await fs.readdir(path.join(logoHub, "assets")),
      "and the asset directory still holds one file per pack"
    ).toEqual(["acme-hello-logo-7e0b9e9c.png", "other-pack-logo-e157ef72.png"])
  })
})

describe("the pictures a person adds", () => {
  /* What a person adds is recorded on the pack's own row and kept in the hub's
     asset directory, in the order it was added: that order is what says which
     picture a card is drawn by, so what was added last is what a card shows. */
  const shot = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])
  const dataUrl = `data:image/png;base64,${Buffer.from(shot).toString("base64")}`
  const clip = `data:video/mp4;base64,${Buffer.from(new Uint8Array([0, 0, 0, 24, 102])).toString("base64")}`

  let stored = ""
  let later = ""

  it("records a picture a person added on the pack, and keeps its file in the hub", async () => {
    await logoLibrary.addAssets("acme-hello", [dataUrl])
    const added = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
    stored = added?.assets[0] ?? ""
    expect(stored, "a picture a person added is recorded on the pack").toMatch(/^assets\//)
    expect(
      await fs.stat(path.join(logoHub, "assets", path.basename(stored))).catch(() => null),
      "and its file is the hub's"
    ).not.toBeNull()
    expect(added?.icon, "and it is not confused with the picture the pack brought").toBe(first.icon)
    expect(added?.icon, "the two being different files").not.toBe(stored)
    expect(added?.hash, "and the row was not otherwise rewritten").toBe(first.hash)
    expect(added?.updatedAt, "nor stamped again").toBe(first.updatedAt)
    expect(added?.tags, "nor its tags changed").toEqual(first.tags)
  })

  it("draws the picture added last, and moves one added again to the front", async () => {
    await logoLibrary.addAssets("acme-hello", [clip])
    const both = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
    later = both?.assets[0] ?? ""
    expect(
      both?.assets,
      "a picture added later comes first, because that is the one a card draws"
    ).toHaveLength(2)
    expect(both?.assets[0], "with the picture added last in front").toBe(later)
    expect(both?.assets[1], "and the one added before it behind").toBe(stored)

    await logoLibrary.addAssets("acme-hello", [dataUrl])
    const same = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
    expect(same?.assets, "the same picture added again is one entry").toHaveLength(2)
    expect(same?.assets[0], "moved to the front").toBe(stored)
    expect(same?.assets[1], "behind the one that came after it").toBe(later)
  })

  it("records an address as it stands, and keeps nothing for it", async () => {
    await logoLibrary.addAssets("acme-hello", ["https://elsewhere.test/shot.png"])
    const linked = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
    expect(linked?.assets[0], "an address is recorded as it stands").toBe(
      "https://elsewhere.test/shot.png"
    )
    expect(linked?.assets, "and nothing is kept for it").toHaveLength(3)
  })

  /* The name a file is kept under carries the pack's own name: two packs that
     hold the same bytes are two files, so dropping one never takes the other's. */
  it("keeps the same picture under another pack's own name", async () => {
    await logoLibrary.addAssets("other-pack", [dataUrl])
    const otherRow = (await logoLibrary.list()).find((one) => one.name === "other-pack")
    const otherFile = otherRow?.assets[0] ?? ""
    expect(otherFile, "the same picture added to another pack is that pack's own file").toMatch(
      /^assets\//
    )
    expect(otherFile, "and is not the first pack's file").not.toBe(stored)
    expect(
      await fs.stat(path.join(logoHub, "assets", path.basename(otherFile))).catch(() => null),
      "and its file is really there"
    ).not.toBeNull()
  })

  it("refuses a picture for a pack the hub does not hold", async () => {
    await expect(
      logoLibrary.addAssets("no-such-pack", [dataUrl]),
      "a picture for a pack the hub does not hold is refused, and nothing is written"
    ).rejects.toThrow(/not in this library/)
  })

  /* The one thing that could quietly take an added picture away: an update reads
     the record again, and keeps what a person added only while its file is there.
     The mark it brought is replaced by that same read, and the two must not be
     taken for each other. */
  it("keeps the pictures a person added through an update, taking a new mark of its own", async () => {
    const linked = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
    const stage = path.join(root, "logo-pack-again")
    await writePack(stage, "9.9.9")
    await writePicture(stage, "assets/logo.png", "the new logo")
    const replaced = await logoLibrary.replace("acme-hello", stage, first.source, await folderHash(stage))
    expect(replaced.assets, "an update keeps the pictures a person added, in their order").toEqual(
      linked?.assets ?? []
    )
    expect(replaced.assets, "all three of them").toHaveLength(3)
    expect(
      await fs.stat(path.join(logoHub, "assets", path.basename(stored))).catch(() => null),
      "and the file one of them is kept in is still there"
    ).not.toBeNull()
    expect(replaced.icon, "and the mark it now brings is a new file").not.toBe(first.icon)
    expect(replaced.icon, "which is a file this hub holds").not.toBe("")
    expect(replaced.assets, "kept apart from what a person added").not.toContain(replaced.icon)
    expect(
      await fs.stat(path.join(logoHub, "assets", path.basename(replaced.icon))).catch(() => null),
      "in the hub's own asset directory"
    ).not.toBeNull()
  })

  it("drops the references a person added, and the files with them", async () => {
    /* A reference this pack's record does not hold is not this call's to remove:
       its own mark lives in the same store, and a mistake is not a reason to
       delete a file. */
    await logoLibrary.removeAsset("acme-hello", "https://elsewhere.test/shot.png")
    const dropped = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
    expect(dropped?.assets, "dropping an address takes it off the pack").toHaveLength(2)
    expect(dropped?.assets, "leaving nothing of it behind").not.toContain(
      "https://elsewhere.test/shot.png"
    )

    await logoLibrary.removeAsset("acme-hello", stored)
    const after = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
    expect(after?.assets, "dropping a picture takes its file too").toHaveLength(1)
    expect(after?.assets[0], "and the next one takes its place").toBe(later)
    expect(
      await fs.stat(path.join(logoHub, "assets", path.basename(stored))).catch(() => null),
      "with the file gone"
    ).toBeNull()

    const otherRow = (await logoLibrary.list()).find((one) => one.name === "other-pack")
    const otherFile = otherRow?.assets[0] ?? ""
    expect(
      await fs.stat(path.join(logoHub, "assets", path.basename(otherFile))).catch(() => null),
      "and the other pack's copy of the same bytes is still there"
    ).not.toBeNull()
  })

  it("drops the last picture, leaving the mark the pack itself brought", async () => {
    await logoLibrary.removeAsset("acme-hello", later)
    const bare = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
    expect(bare?.assets, "dropping the last picture leaves the pack with none").toHaveLength(0)
    expect(bare?.icon, "while the picture the pack itself brought stays").not.toBe("")
    expect(
      await fs.stat(path.join(logoHub, "assets", path.basename(bare?.icon ?? ""))).catch(() => null),
      "with its file still there"
    ).not.toBeNull()
  })

  it("leaves the pack's own mark alone when asked to drop it as a picture", async () => {
    /* A reference this pack's record does not hold is not this call's to remove:
       its own mark lives in the same store, and a mistake is not a reason to
       delete a file. */
    const before = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
    await logoLibrary.removeAsset("acme-hello", before?.icon ?? "")
    await logoLibrary.removeAsset("acme-hello", "assets/never-recorded-00000000.png")
    const untouched = (await logoLibrary.list()).find((one) => one.name === "acme-hello")
    expect(
      untouched?.icon,
      "the pack's own mark is not a picture a person added, and is left alone"
    ).toBe(before?.icon)
    expect(untouched?.icon, "and it is still a mark").not.toBe("")
    expect(
      await fs.stat(path.join(logoHub, "assets", path.basename(untouched?.icon ?? ""))).catch(
        () => null
      ),
      "with its file still there"
    ).not.toBeNull()
    expect(
      (await logoLibrary.list()).find((one) => one.name === "other-pack")?.assets,
      "and another pack's row is not touched by any of it"
    ).toHaveLength(1)
  })
})

describe("reading a directory an agent keeps a pack in", () => {
  /* A pack no library record holds is read straight out of the directory an agent
     named, so that directory is the boundary: everything the panel asks for is
     resolved inside it, and a path that climbs out is refused rather than opened.
     A pack is somebody else's directory, and the panel asks for paths by name. */
  const outside = path.join(root, "outside.txt")
  const inside = logoPack

  beforeAll(async () => {
    await fs.writeFile(outside, "not part of any pack", "utf8")
    await fs.writeFile(path.join(inside, "NOTE.md"), "# hi\n", "utf8")
  })

  it("lists what is in a directory, a file and not a directory", async () => {
    const listed = await listDirectory(inside)
    const note = listed.find((one) => one.path === "NOTE.md")
    expect(note, "a directory lists what is in it").toBeDefined()
    expect(note?.directory, "and says a file is not a directory").toBe(false)
  })

  it("reads a file inside it", async () => {
    expect(await readInDirectory(inside, "NOTE.md"), "and reads a file inside it").toBe("# hi\n")
  })

  it("refuses a path that climbs out, whichever way it is written", async () => {
    await expect(
      readInDirectory(inside, "../outside.txt"),
      "a path that climbs out is refused"
    ).rejects.toThrow(/escapes/)
    await expect(
      readInDirectory(inside, path.resolve(outside)),
      "and so is an absolute one, wherever it lands"
    ).rejects.toThrow(/escapes/)
  })

  it("refuses the same way through the hub's own reader", async () => {
    await expect(
      library.read("logo-pack", "../../outside.txt"),
      "while the hub's own reader refuses the same way"
    ).rejects.toThrow(/escapes/)
  })
})

describe("a program runs in the folder it is given", () => {
  /* A client resolves its project files against the working directory: Claude
     Code writes `.claude/settings.json` where it was started. So an install aimed
     at a workspace has to be started in that workspace, not in whichever package
     this host happens to run from — otherwise the pack lands beside the dev
     server instead of in the folder a person picked. */
  const says = ["-e", "process.stdout.write(process.cwd())"]

  it("answers from the folder it was started in", async () => {
    const where = path.join(root, "a-workspace")
    await fs.mkdir(where, { recursive: true })
    const here = await runProgram(process.execPath, says, { cwd: where })
    expect(
      await fs.realpath(here.output),
      "a program started in a folder answers from that folder"
    ).toBe(await fs.realpath(where))
  })

  it("answers from this host's own folder when started with none", async () => {
    const started = await runProgram(process.execPath, says)
    expect(
      await fs.realpath(started.output),
      "and one started with no folder answers from this host's own"
    ).toBe(await fs.realpath(process.cwd()))
  })
})

describe("an asset store with a sink of its own", () => {
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
  const sinkLibrary = createFsPluginLibrary(
    sinkHub,
    createAssetStore(createFsAssetLibrary(sinkHub), [bucket])
  )
  let hosted: PluginRecord

  beforeAll(async () => {
    hosted = (await createPluginCollector(sinkLibrary).add(logoPack)).record
  })

  it("offers the pack's picture to the sink as a file of its own", () => {
    expect(kept, "the sink is offered the pack's picture as a file of its own").toHaveLength(1)
    expect(kept[0]?.name, "named after the pack").toBe("acme-hello-logo.png")
    expect(kept[0]?.type, "and carrying its kind").toBe("image/png")
  })

  it("holds the reference the sink answers with", () => {
    expect(hosted.icon, "and the reference it answers with is what the record holds").toBe(
      "https://bucket.test/acme-hello-logo.png"
    )
  })

  it("keeps nothing in the hub's own directory", async () => {
    expect(
      await fs.readdir(path.join(sinkHub, "assets")).catch(() => []),
      "so nothing is kept in the hub's own directory"
    ).toHaveLength(0)
  })

  it("asks the sink to drop its copy when the pack goes", async () => {
    await sinkLibrary.remove(hosted.name)
    expect(
      sinkDropped,
      "dropping the pack asks the sink to drop its copy"
    ).toEqual([hosted.icon])
  })
})

describe("removing", () => {
  it("takes the pack's directory, its record, and the picture it brought", async () => {
    await logoLibrary.remove(first.name)
    expect(
      await fs.stat(path.join(logoHub, "plugins", "acme-hello")).catch(() => null),
      "the pack's directory is gone"
    ).toBeNull()
    expect(
      (await logoLibrary.list()).map((one) => one.name),
      "its record is gone"
    ).not.toContain(first.name)
    expect(
      await fs.stat(path.join(logoHub, "assets", "acme-hello-logo-7e0b9e9c.png")).catch(() => null),
      "the picture it brought is gone too"
    ).toBeNull()
    expect(
      await fs.stat(path.join(logoHub, "assets", "other-pack-logo-e157ef72.png")).catch(() => null),
      "while the other pack's picture stays"
    ).not.toBeNull()
  })
})

describe("a source that moved", () => {
  let pinnedLibrary: ReturnType<typeof createFsPluginLibrary>

  /**
   * Take the repository as a pack, the way a collected one is recorded: the files
   * without their history, and the revision they were at. The repository is on
   * this machine, so an address naming it would be read as a directory rather than
   * a repository — which is the point of the two forms being separate.
   */
  async function takeFromRepo(
    into: ReturnType<typeof createFsPluginLibrary>,
    at?: string
  ): Promise<PluginRecord> {
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

  beforeAll(async () => {
    /* A repository made here is an upstream the checks can ask without a network. */
    await writePack(repo, "1.0.0")
    await git(repo, ["init", "-q"])
    await git(repo, ["config", "user.email", "check@example.test"])
    await git(repo, ["config", "user.name", "Check"])
    await git(repo, ["add", "-A"])
    await git(repo, ["commit", "-qm", "first"])
    cloned = await takeFromRepo(repoLibrary)
  })

  it("records the revision the repository was at", () => {
    expect(cloned.source.kind, "a pack taken from a repository is a url").toBe("url")
    expect(
      cloned.source,
      "a pack taken from a repository records its revision"
    ).toMatchObject({ revision: expect.stringMatching(/^[0-9a-f]{40}$/) })
  })

  /* A name the library holds from an address is not a folder's to take over: that
     address can be asked again, so which pack belongs here is the person's call
     rather than this hub's. Only a folder is a label nobody can compare. */
  it("does not let a folder take a name held from an address", async () => {
    const folderWithATakenName = path.join(root, "impostor-folder")
    await writePack(folderWithATakenName, "1.0.0")
    await expect(
      createPluginCollector(repoLibrary).add(folderWithATakenName),
      "a folder does not take a name held from an address"
    ).rejects.toThrow(/already in this library/)
    expect(
      await fs.stat(path.join(repoHub, "plugins", "acme-hello", ".git")).catch(() => null),
      "and none of the repository's history came with it"
    ).toBeNull()
  })

  it("records the answer a check that found nothing new gives", async () => {
    const firstCheck = await probe.checkAll(await repoLibrary.list())
    expect(firstCheck.outdated, "a source that has not moved is not an update").toBe(0)
    expect(firstCheck.failed, "nothing failed to answer").toHaveLength(0)
    expect(
      (await repoLibrary.list())[0]?.checked?.latest,
      "the answer was recorded"
    ).toBe(cloned.source.kind === "url" ? cloned.source.revision : "")
  })

  it("sees a moved source as an update", async () => {
    /* Move the source on, and the next check has to see it. */
    await fs.writeFile(
      path.join(repo, "skills", "hello", "SKILL.md"),
      "---\nname: hello\ndescription: Say hello.\n---\n\nSay hello loudly.\n",
      "utf8"
    )
    await git(repo, ["add", "-A"])
    await git(repo, ["commit", "-qm", "second"])
    const secondCheck = await probe.checkAll(await repoLibrary.list())
    expect(secondCheck.outdated, "a moved source is an update").toBe(1)
  })

  it("takes the new files, recording what it came from and went to", async () => {
    const applied = await createPluginUpdater(repoLibrary).update("acme-hello")
    expect(applied.changed, "the update took the new files").toBe(true)
    expect(applied.from, "it reports what it came from and went to").not.toBe(applied.to)
    const after = (await repoLibrary.list())[0]
    expect(after?.source, "the record now holds the new revision").toMatchObject({
      kind: "url",
      revision: applied.to,
    })
    expect(after?.hash, "and the new hash").toBe(
      await folderHash(path.join(repoHub, "plugins", "acme-hello"))
    )
    expect(outdated(after!), "the check that said there was an update is answered").toBe(false)
  })

  /* A pack taken at a ref is asked about *that* ref: a tag is not behind the
     branch it happens to sit on, and a commit above it is not an update to it. */
  it("does not report a pack taken at a tag as behind its own tag", async () => {
    await git(repo, ["tag", "v1"])
    pinnedLibrary = createFsPluginLibrary(path.join(root, "pinned-hub"))
    await takeFromRepo(pinnedLibrary, "v1")
    const pinnedCheck = await createPluginProbe(pinnedLibrary).checkAll(await pinnedLibrary.list())
    expect(pinnedCheck.outdated, "a pack taken at a tag is not behind its own tag").toBe(0)
  })

  it("does not report a commit above the tag as an update to it", async () => {
    await fs.writeFile(
      path.join(repo, "skills", "hello", "SKILL.md"),
      "---\nname: hello\n---\n\nSomething else.\n",
      "utf8"
    )
    await git(repo, ["add", "-A"])
    await git(repo, ["commit", "-qm", "third"])
    const stillPinned = await createPluginProbe(pinnedLibrary).checkAll(await pinnedLibrary.list())
    expect(stillPinned.outdated, "and a commit above the tag is not an update to it").toBe(0)
  })

  /* A directory on this machine has no source to ask, and says so rather than
     reporting a change every time. */
  it("lists a local directory as unanswerable", async () => {
    const localCheck = await probe.checkAll([collected.record])
    expect(localCheck.unanswerable, "a local directory is listed as unanswerable").toContain(
      "acme-hello"
    )
  })
})

describe("asking about one pack", () => {
  /* One pack at a time, for the panel that is looking at that one: the same
     answer as a batch would give, recorded the same way, and a refusal where a
     batch would only have listed the pack as unanswerable. */
  it("reads its source, recording the answer the way a batch records it", async () => {
    const one = await createPluginProbe(repoLibrary).checkOne(await repoLibrary.list(), "acme-hello")
    expect(one.latestRevision, "asking about one pack reads its source").not.toBe("")
    expect(
      (await repoLibrary.list())[0]?.checked?.latest,
      "and the answer is recorded the way a batch records it"
    ).toBe(one.latestRevision)
  })

  it("refuses a name no record carries", async () => {
    await expect(
      createPluginProbe(repoLibrary).checkOne(await repoLibrary.list(), "not-a-pack"),
      "a name no record carries is refused"
    ).rejects.toThrow(/not-a-pack/)
  })

  it("refuses a source that cannot be asked rather than guessing at it", async () => {
    await expect(
      probe.checkOne([collected.record], "acme-hello"),
      "and a source that cannot be asked is refused rather than guessed at"
    ).rejects.toThrow(/cannot be asked/)
  })
})

describe("one directory of a repository", () => {
  /* A monorepo ships packs as directories of one repository. An address naming a
     subdirectory is taken as that directory and nothing else: the pack is what
     lands, and no other directory of the repository comes with it. */
  beforeAll(async () => {
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
  })

  /** One fetch of a subdirectory of the monorepo, into a staging directory of its own. */
  async function takeSubdir(where: string): Promise<{ taken: PluginOrigin; stage: string }> {
    const work = await stagingDir()
    const stage = path.join(work, "pack")
    await fs.mkdir(stage, { recursive: true })
    const taken = await fetchPlugin({ kind: "git-subdir", url: monorepo, path: where }, stage, work)
    return { taken, stage }
  }

  it("takes a subdirectory as that directory and nothing else", async () => {
    const subdir = await takeSubdir("tools/acme-hello")
    expect(subdir.taken, "a subdirectory is recorded as one").toMatchObject({
      kind: "git-subdir",
      path: "tools/acme-hello",
    })
    expect(subdir.taken, "at the revision the repository was at").toMatchObject({
      revision: expect.stringMatching(/^[0-9a-f]{40}$/),
    })
    expect(
      await fs.stat(path.join(subdir.stage, "skills", "hello", "SKILL.md")).catch(() => null),
      "the pack's own files are what landed"
    ).not.toBeNull()
    expect(
      await fs.stat(path.join(subdir.stage, "README.md")).catch(() => null),
      "and nothing of the rest of the repository"
    ).toBeNull()
    expect(
      await fs.stat(path.join(subdir.stage, "tools")).catch(() => null),
      "no other directory of it either"
    ).toBeNull()
    expect(
      await fs.stat(path.join(subdir.stage, ".git")).catch(() => null),
      "with no history"
    ).toBeNull()
  })

  it("refuses a subdirectory the repository does not hold", async () => {
    await expect(
      takeSubdir("tools/nowhere"),
      "a subdirectory the repository does not hold is refused"
    ).rejects.toThrow(/holds no/)
  })

  it("refuses a subdirectory that walks out", async () => {
    await expect(
      takeSubdir("../elsewhere"),
      "a subdirectory that walks out is refused"
    ).rejects.toThrow(/unusable path/)
  })

  /* Two packs from one repository are two packs: the path is what tells them
     apart, so a library can hold both. */
  it("records a pack from a subdirectory as one this build cannot ask about", async () => {
    const collectedSubdir = await takeSubdir("tools/acme-hello")
    const firstSubdir = await subdirLibrary.add(
      "acme-hello",
      collectedSubdir.stage,
      collectedSubdir.taken,
      await folderHash(collectedSubdir.stage)
    )
    expect(firstSubdir.source.kind, "a pack from a subdirectory is recorded").toBe("git-subdir")
    const subdirCheck = await createPluginProbe(subdirLibrary).checkAll(await subdirLibrary.list())
    expect(subdirCheck.unanswerable, "and is answered as one this build cannot ask about").toContain(
      "acme-hello"
    )
    expect(subdirCheck.outdated, "with nothing reported as behind").toBe(0)
    expect(outdated(firstSubdir), "so it is never reported as behind").toBe(false)
  })
})

describe("putting a pack back", () => {
  /* A record outlives the directory it names. The address it carries is what makes
     the pack recoverable, so a folder deleted by hand is fetched again rather than
     remembered as a row whose files are nowhere. */
  const repoPack = path.join(repoHub, "plugins", "acme-hello")

  it("fetches a folder deleted by hand again, from the address its record carries", async () => {
    const beforeLoss = (await repoLibrary.list())[0]
    await fs.rm(repoPack, { recursive: true, force: true })
    expect(await repoLibrary.has("acme-hello"), "the folder is gone").toBe(false)
    expect(await repoLibrary.missing(), "and the library names it as missing").toContain("acme-hello")

    await createPluginCollector(repoLibrary).restore("acme-hello")
    expect(await repoLibrary.has("acme-hello"), "the pack is fetched again").toBe(true)
    expect(await repoLibrary.missing(), "and is no longer missing").toHaveLength(0)
    expect(
      (await repoLibrary.list())[0]?.hash,
      "what came back is what the source holds"
    ).toBe(await folderHash(repoPack))
    expect(
      (await repoLibrary.list())[0]?.installedAt,
      "and it is still the same record"
    ).toBe(beforeLoss?.installedAt)
  })

  /* Two collections of one address at once are one pack: whichever lands second
     finds the files already here rather than a name it must refuse. */
  it("leaves one pack when two collections of one address race", async () => {
    await fs.rm(repoPack, { recursive: true, force: true })
    const racing = createPluginCollector(repoLibrary)
    await Promise.all([racing.restore("acme-hello"), racing.restore("acme-hello")])
    expect(await repoLibrary.list(), "asking twice at once leaves one pack").toHaveLength(1)
    expect(await repoLibrary.has("acme-hello"), "with its files here").toBe(true)
  })

  /* A source that cannot be reached fails, and says so: the pack is the one thing
     a person can then add again by hand. */
  it("reports a source that cannot be reached", async () => {
    const brokenFile = path.join(repoHub, "plugins", "plugins.json")
    const broken = JSON.parse(await fs.readFile(brokenFile, "utf8")) as { source: { url: string } }[]
    broken[0]!.source.url = path.join(root, "no-such-repository")
    await fs.writeFile(brokenFile, `${JSON.stringify(broken, null, 2)}\n`, "utf8")
    await fs.rm(repoPack, { recursive: true, force: true })
    await expect(
      createPluginCollector(repoLibrary).restore("acme-hello"),
      "a source that cannot be reached is reported"
    ).rejects.toThrow()
  })

  /* A pack that came from a directory on this machine is the exception: that
     directory *is* the pack, so a missing one is nothing this hub can fetch. */
  it("says a local pack has nothing to fetch it from", async () => {
    await fs.rm(path.join(orphanHub, "plugins", "acme-hello"), { recursive: true, force: true })
    await expect(
      createPluginCollector(orphanLibrary).restore("acme-hello"),
      "a local pack says there is nothing to fetch it from"
    ).rejects.toThrow(/this machine/)
  })
})

describe("delivering", () => {
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
    /* No configuration files behind this form; nothing in these cases reads one. */
    files: null,
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
    /* The two scopes this stub is handed below. Nothing here reads the places
       themselves, but an installer has to declare the ones it has, and it keeps
       no switch of its own to offer. */
    places: [
      { id: "stub.user", label: "Stub", scope: "global", scopeWord: "user", switchable: false },
      {
        id: "stub.project",
        label: "Stub",
        scope: "workspace",
        scopeWord: "project",
        switchable: false,
      },
    ],
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
        pack: { name, version: "1", description: "" },
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

  /* A bare context is enough: the service publishes itself on construction, and
     what is under test is the registry it holds, not the kernel around it. Its
     tools are the form's, and no installer below reads them from here. */
  const registry = new PluginService(new Context(), tools)
  let registered: PluginInstaller
  let unregister: () => void

  /** The scopes the stub holds one pack in, as the installed list reads them. */
  async function heldScopes(name: string): Promise<string> {
    const packs = await registered.held(tools)
    return packs
      .filter((one) => one.name === name)
      .map((one) => one.scope)
      .join()
  }

  it("holds no installer until one registers, and lists the one that does", () => {
    expect(registry.installers(), "a fresh registry holds no installer").toHaveLength(0)
    unregister = registry.register(stub)
    expect(
      registry.installers().map((one) => one.id),
      "registering one lists it"
    ).toEqual(["hub.target.stub"])
  })

  it("records both scopes an installer was given", async () => {
    const [only] = registry.installers()
    if (only === undefined) throw new Error("the registry lost the installer it was given")
    registered = only
    await registered.install("acme-hello", "user", tools)
    await registered.install("acme-hello", "project", tools)
    expect(await heldScopes("acme-hello"), "an installer records both scopes it was given").toBe(
      "user,project"
    )
  })

  it("answers which program is here and which is not", async () => {
    expect(await tools.has("stub"), "the tools say which program is here").toBe(true)
    expect(await tools.has("nowhere"), "and which is not").toBe(false)
  })

  it("answers what a pack says about itself", async () => {
    expect(
      (await tools.describe(libraryRoot, "acme-hello")).description,
      "an installer can ask what a pack says about itself"
    ).toBe(`a pack at ${libraryRoot}`)
  })

  it("calls a program with structured arguments, never a re-parsed line", async () => {
    /* The library root is a person's own directory, so a path with a space is a
       case every installer hits. It travels as one list entry, never re-parsed. */
    await tools.run("stub", [libraryRoot, "one argument"])
    expect(ran.at(-1), "the program is called with structured arguments").toEqual([
      "stub",
      libraryRoot,
      "one argument",
    ])
  })

  /* Removed by the id the client itself reported, which is what a client's own
     commands take back — and the only thing that names a copy this hub never
     delivered. */
  it("removes one scope by the client's own id, and gives the registry back", async () => {
    await registered.remove("acme-hello@stub", "user", tools)
    expect(await heldScopes("acme-hello"), "removing one scope leaves the other").toBe("project")
    unregister()
    expect(registry.installers(), "the disposer takes it back out").toHaveLength(0)
  })
})

describe("what a pack carries inside it", () => {
  /* The pack the rest of this check writes: one skill that names itself, and one
     command that says nothing about itself at all. */
  it("reads a skill under the name its own file gives", async () => {
    const carried = await readPackContents(source)
    expect(carried.skills[0]?.title, "a skill reads under the name its own file gives").toBe("hello")
    expect(carried.skills[0]?.description, "and carries the sentence beside it").toBe("Say hello.")
    expect(carried.commands[0]?.title, "a command with no frontmatter reads as its file name").toBe(
      "greet"
    )
    expect(
      carried.commands[0]?.description,
      "with nothing said about it rather than something invented"
    ).toBe("")
    expect(carried.mcp, "a pack that declares no server carries none").toBeNull()
  })

  describe("the shapes a pack may carry", () => {
    /* A pack carrying the shapes the first one does not: a skill directory that is
       not a skill, two skills out of order, a command grouped in a directory, a file
       that is not markdown, and a declared server. */
    const declared = '{\n  "mcpServers": { "ping": { "command": "ping" } }\n}\n'
    let more: Awaited<ReturnType<typeof readPackContents>>

    beforeAll(async () => {
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
      await fs.writeFile(path.join(shapes, ".mcp.json"), declared, "utf8")
      more = await readPackContents(shapes)
    })

    it("does not read a directory with no SKILL.md as a skill", () => {
      expect(more.skills, "a directory with no SKILL.md is not a skill").toHaveLength(2)
    })

    it("reads the skills in the order a list reads them", () => {
      expect(
        more.skills.map((one) => one.title),
        "skills come back in the order a list reads them"
      ).toEqual(["alpha", "zulu"])
    })

    /* One strict comparison rather than a look for what should be absent: a title
       the filter failed to drop is only visible against the whole list. */
    it("reads the commands as the markdown files under commands/, however deep they sit", () => {
      expect(
        more.commands.map((one) => one.title),
        "the commands are the markdown files under commands/, however deep they sit"
      ).toEqual(["commit", "greet"])
    })

    it("reads a description written under its key as the value", () => {
      expect(
        more.skills[0]?.description,
        "a description written under its key is read as the value"
      ).toBe("A skill called alpha, whose description was wrapped by hand.")
    })

    it("reads a description wrapped by hand as one line", () => {
      expect(more.commands[0]?.description, "and one wrapped by hand reads as one line").toBe(
        "Write a commit, twice over."
      )
    })

    it("returns the declared servers exactly as written", () => {
      expect(more.mcp, "the declared servers come back exactly as written").toBe(declared)
    })
  })

  /* A directory holding nothing of the three is the ordinary case, not a failure:
     it is what says the three tabs are not offered at all. */
  it("answers empty for a directory carrying none of the three", async () => {
    const bare = path.join(root, "bare")
    await fs.mkdir(bare, { recursive: true })
    const none = await readPackContents(bare)
    expect(none.skills, "a directory carrying none of the three answers with no skills").toHaveLength(
      0
    )
    expect(none.commands, "and no commands").toHaveLength(0)
    expect(none.mcp, "and no declared server").toBeNull()
  })
})
