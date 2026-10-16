/**
 * Behaviour of taking skills in from outside. Three pieces are exercised
 * without a network: reading the Package field back into a source and a set of
 * pinned skills, reading the `skills add --list` text into rows, and writing a
 * dropped folder into a library root.
 *
 * The bounds that keep a big folder from taking the page down are exercised
 * here too, and the only thing written is a temporary library root, removed at
 * the end.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { importFolder } from "../src/host/folder-import.ts"
import { parsePackageList } from "../src/host/skills-cli.ts"
import {
  DEFAULT_LIMITS,
  filesFromPicker,
  readFolderFiles,
  scanFolder,
  walkEntries,
} from "../src/folder-scan.ts"
import { parsePackageRequest } from "../src/package-source.ts"

describe("the Package field", () => {
  it("takes a bare shorthand as the source, pinning nothing", () => {
    expect(parsePackageRequest("mattpocock/skills"), "a bare shorthand is the source").toEqual({
      source: "mattpocock/skills",
      skills: [],
    })
  })

  it("splits a skill off an @ pin", () => {
    expect(
      parsePackageRequest("mattpocock/skills@grill-me"),
      "an @ pin splits off the skill"
    ).toEqual({ source: "mattpocock/skills", skills: ["grill-me"] })
  })

  it("keeps the @ in a URL, where it is a credential separator", () => {
    expect(
      parsePackageRequest("https://github.com/mattpocock/skills@grill-me"),
      "a URL keeps its @, which is a credential separator there"
    ).toEqual({ source: "https://github.com/mattpocock/skills@grill-me", skills: [] })
  })

  it("gives up the source and the --skill flags of a pasted command", () => {
    expect(
      parsePackageRequest("npx skills add https://github.com/mattpocock/skills --skill grill-me"),
      "a pasted command gives up its source and its --skill flags"
    ).toEqual({ source: "https://github.com/mattpocock/skills", skills: ["grill-me"] })
  })

  it("reads a versioned command, short flags and repeats the same way", () => {
    expect(
      parsePackageRequest(
        "npx skills@1.7.1 add mattpocock/skills -s tdd -s code-review -a universal --copy -y"
      ),
      "a versioned command, short flags, and repeats all read the same"
    ).toEqual({ source: "mattpocock/skills", skills: ["tdd", "code-review"] })
  })

  it("reads an inline --skill=value too", () => {
    expect(
      parsePackageRequest("mattpocock/skills --skill=tdd"),
      "an inline --skill=value is read too"
    ).toEqual({ source: "mattpocock/skills", skills: ["tdd"] })
  })

  it("counts the same skill twice as one pick", () => {
    expect(
      parsePackageRequest("mattpocock/skills@tdd --skill tdd"),
      "the same skill twice is one pick"
    ).toEqual({ source: "mattpocock/skills", skills: ["tdd"] })
  })

  it("asks for nothing from an empty field", () => {
    expect(parsePackageRequest("   "), "an empty field asks for nothing").toEqual({
      source: "",
      skills: [],
    })
  })

  it("does not read a global flag as the source", () => {
    expect(
      parsePackageRequest("-g mattpocock/skills"),
      "a global flag does not become the source"
    ).toEqual({ source: "mattpocock/skills", skills: [] })
  })
})

describe("the --list report", () => {
  /* Captured from `skills@1.7.1 add mattpocock/skills --list`, escapes intact. */
  const listing = [
    "\u001b[?25l│",
    "●   github_copilot_vscode_agent  Agent detected — installing non-interactively",
    "◇  Source: https://github.com/mattpocock/skills.git",
    "\u001b[?25h\u001b[?25l│",
    "◇  Found 3 skills",
    "\u001b[?25h",
    "│",
    "\u001b[1m◇  Available Skills\u001b[22m",
    "\u001b[1mMattpocock Skills\u001b[22m",
    "│",
    "│    \u001b[36mask-matt\u001b[39m",
    "│",
    "│      \u001b[2mAsk which skill or flow fits your situation.\u001b[22m",
    "│",
    "│    \u001b[36mcode-review\u001b[39m",
    "│",
    "│      \u001b[2mReview the changes since a fixed point, along two axes: standards and spec.\u001b[22m",
    "│",
    "",
    "General",
    "│",
    "│    \u001b[36mprototype\u001b[39m",
    "│",
    "│      \u001b[2mBuild a throwaway prototype to answer a design question.\u001b[22m",
    "│",
    "└  Use --skill <name> to install specific skills",
    "",
  ].join("\n")

  const rows = parsePackageList(listing)

  it("yields every skill once", () => {
    expect(rows, "the listing yields every skill once").toHaveLength(3)
  })

  it("keeps the names in the order they were listed", () => {
    expect(
      rows.map((row) => row.name),
      "names and descriptions keep their order and pairing"
    ).toEqual(["ask-matt", "code-review", "prototype"])
  })

  it("attaches a description to the skill above it", () => {
    expect(
      rows[1]?.description,
      "a description is attached to the skill above it"
    ).toBe("Review the changes since a fixed point, along two axes: standards and spec.")
  })

  it("does not read a group title as a skill", () => {
    const names = rows.map((row) => row.name)
    expect(names, "Mattpocock Skills is a group title").not.toContain("Mattpocock Skills")
    expect(names, "General is a group title").not.toContain("General")
  })

  it("does not read the footer as a skill", () => {
    expect(
      rows.filter((row) => row.name.includes("Use --skill")),
      "the footer is not a skill"
    ).toEqual([])
  })

  it("yields nothing for a report with no listing", () => {
    expect(
      parsePackageList("◇  Cloning repository…"),
      "a report with no listing yields nothing"
    ).toEqual([])
  })
})

const manifest = (text: string) => new File([`${text}`], "SKILL.md")
const doc = (name: string, description: string) =>
  manifest(`---\nname: ${name}\ndescription: ${description}\n---\n\nBody\n`)

/** One file as a walk hands it over: a path, and an opener that waits. */
const at = (filePath: string, file: File) => ({ path: filePath, open: async () => file })

const droppedFiles = [
  at("docs-writer/SKILL.md", doc("docs-writer", "Turn notes into a docs page.")),
  at("docs-writer/references/guide.md", new File(["guide"], "guide.md")),
  at("notes/readme.md", new File(["notes"], "readme.md")),
]

const scanned = await scanFolder(droppedFiles)

/* A repository holds its skills under whatever folders it likes. */
const repository = await scanFolder([
  at("repo/README.md", new File(["readme"], "README.md")),
  at("repo/skills/engineering/code-review/SKILL.md", doc("code-review", "Review changes.")),
  at("repo/skills/engineering/code-review/reference.md", new File(["ref"], "reference.md")),
  at("repo/skills/writing/tdd/SKILL.md", doc("tdd", "Test first.")),
])

const encoded = await readFolderFiles(repository)

describe("reading a dropped folder", () => {
  it("yields one skill per SKILL.md", () => {
    expect(scanned.map((skill) => skill.name), "a folder yields one skill per SKILL.md").toEqual([
      "docs-writer",
    ])
  })

  it("carries the skill's description and its files", () => {
    expect(scanned[0]?.description, "the skill carries its description").toBe(
      "Turn notes into a docs page."
    )
    expect(scanned[0]?.files, "the skill carries its files").toHaveLength(2)
  })

  it("does not make a folder without a manifest a candidate", () => {
    expect(
      scanned.map((skill) => skill.name),
      "a folder without a manifest is not a candidate"
    ).not.toContain("notes")
  })

  it("gives a file at the drop's root to no skill", async () => {
    expect(
      await scanFolder([at("SKILL.md", manifest("x"))]),
      "a file at the drop's root belongs to no skill"
    ).toHaveLength(0)
  })

  it("finds every skill under the picked folder, at any depth", () => {
    expect(
      repository.map((skill) => `${skill.name}@${skill.dir}`),
      "every skill under the picked folder is found, at any depth"
    ).toEqual(["code-review@repo/skills/engineering/code-review", "tdd@repo/skills/writing/tdd"])
  })

  it("brings a skill's own subfolders with it", () => {
    expect(repository[0]?.files, "a skill's own subfolders come with it").toHaveLength(2)
  })

  /* A picked project keeps its skills where the agents put them. */
  it("searches a hidden agent directory instead of skipping it", async () => {
    const project = await scanFolder(
      [
        at("app/src/index.ts", new File(["code"], "index.ts")),
        at("app/.agents/skills/grill-me/SKILL.md", doc("grill-me", "Grill a plan.")),
        at("app/.agents/skills/grill-me/references/notes.md", new File(["notes"], "notes.md")),
        { path: "app/.claude/skills/retro/SKILL.md", file: doc("retro", "Run a retro.") },
      ].map((entry) => ("file" in entry ? at(entry.path, entry.file) : entry))
    )
    expect(
      project.map((skill) => `${skill.name}@${skill.dir}`),
      "a hidden agent directory is searched, not skipped"
    ).toEqual(["grill-me@app/.agents/skills/grill-me", "retro@app/.claude/skills/retro"])
  })

  /* Picking the agent directory itself: its own name must not hide what is under it. */
  it("searches the picked folder whatever it is called, nested files and all", async () => {
    const agentRoot = await scanFolder([
      at(".agents/skills/grill-me/SKILL.md", doc("grill-me", "Grill a plan.")),
      at(".agents/skills/grill-me/references/notes.md", new File(["notes"], "notes.md")),
    ])
    expect(
      agentRoot.map((skill) => `${skill.name}@${skill.dir}`),
      "the folder a person picked is searched whatever it is called"
    ).toEqual(["grill-me@.agents/skills/grill-me"])
    expect(agentRoot[0]?.files, "its nested files come along").toHaveLength(2)
  })

  /* A skill that carries another manifest is still one skill. */
  it("keeps a manifest inside a skill part of that skill", async () => {
    const nested = await scanFolder([
      at("outer/SKILL.md", doc("outer", "Outer.")),
      at("outer/examples/SKILL.md", doc("example", "An example.")),
    ])
    expect(
      nested.map((skill) => skill.name),
      "a manifest inside a skill belongs to that skill"
    ).toEqual(["outer"])
  })

  /* A picked folder that is itself a skill is one skill. */
  it("takes the picked folder itself as the skill", async () => {
    const solo = await scanFolder([at("solo/SKILL.md", doc("solo", "Alone."))])
    expect(solo.map((skill) => skill.name), "the picked folder can be the skill").toEqual(["solo"])
  })

  it("reads the chosen skills back, each file relative to its own skill", () => {
    expect(encoded.map((skill) => skill.name), "the chosen skills are read back").toEqual([
      "code-review",
      "tdd",
    ])
    expect(
      encoded[0]?.files.map((file) => file.path).join(","),
      "each file is sent relative to its own skill"
    ).toBe("SKILL.md,reference.md")
  })
})

/** A directory entry whose children arrive in one batch, as the browser hands them over. */
function dir(name: string, children: FileSystemEntry[]): FileSystemEntry {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => {
      let done = false
      return {
        readEntries: (onBatch: (batch: FileSystemEntry[]) => void) => {
          if (done) {
            onBatch([])
            return
          }
          done = true
          onBatch(children)
        },
      }
    },
    /* Only the three members the walk reads are here; the rest of the browser's
       interface is not worth stubbing to exercise it. */
  } as unknown as FileSystemEntry
}

function entry(name: string): FileSystemEntry {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: (onFile: (file: File) => void) => onFile(new File(["x"], name)),
  } as unknown as FileSystemEntry
}

describe("the bounds that keep a big folder from taking the page down", () => {
  /* The walk never reads a byte: a file that cannot be opened still lists. */
  it("still counts a skill whose manifest cannot be opened", async () => {
    const unreadable = await scanFolder([
      { path: "stale/SKILL.md", open: async () => null },
      at("stale/reference.md", new File(["ref"], "reference.md")),
    ])
    expect(
      unreadable.map((skill) => skill.name),
      "a stale handle still counts as a skill"
    ).toEqual(["stale"])
    expect(unreadable[0]?.description, "with no description to show").toBe("")
  })

  /* A byte budget stops an oversized import before it reads anything. */
  it("refuses an import over its byte budget, before opening the files", async () => {
    let opened = 0
    const heavy = await scanFolder([
      at("big/SKILL.md", doc("big", "Large.")),
      {
        path: "big/data.bin",
        open: async () => {
          opened += 1
          return new File([new Uint8Array(2 * 1024 * 1024)], "data.bin")
        },
      },
    ])
    await expect(
      readFolderFiles(heavy, 1),
      "an import over its byte budget refuses"
    ).rejects.toThrow(/more than this import takes at once/)
    expect(opened, "and never finishes opening the files").toBeLessThanOrEqual(2)
  })

  /* Generated directories are skipped wherever they sit. */
  it("holds no skills in a generated directory", async () => {
    const noise = await scanFolder(
      ["node_modules", "dist", "build", ".venv", "coverage", ".git"].map((name) =>
        at(`app/${name}/pkg/SKILL.md`, doc(name, "Generated."))
      )
    )
    expect(noise, "a generated directory holds no skills").toEqual([])
  })

  /* A picker that hands over more than the budget keeps only what it can use. */
  it("keeps only what the picker's budget can use, the agent root first", () => {
    const picked = filesFromPicker(
      {
        files: [
          ...Array.from({ length: 5 }, (_, index) =>
            Object.assign(new File(["x"], `f${index}.md`), {
              webkitRelativePath: `p/f${index}.md`,
            })
          ),
          Object.assign(new File(["x"], "SKILL.md"), {
            webkitRelativePath: "p/node_modules/pkg/SKILL.md",
          }),
          Object.assign(new File(["x"], "SKILL.md"), {
            webkitRelativePath: "p/.agents/skills/grill-me/SKILL.md",
          }),
        ],
      },
      { ...DEFAULT_LIMITS, maxEntries: 3 }
    )
    expect(picked.files, "a picker over its budget keeps three files").toHaveLength(3)
    expect(picked.truncated, "and reports the cut").toBe(true)
    expect(picked.files[0]?.path, "putting the agent root before the plain files").toBe(
      "p/.agents/skills/grill-me/SKILL.md"
    )
    expect(
      picked.files.filter((file) => file.path.includes("node_modules")),
      "and dropping the generated directories before it counts"
    ).toEqual([])
  })

  /* A walk stops at its budget instead of reading the rest of the tree. */
  const wide = dir(
    "wide",
    Array.from({ length: 40 }, (_, index) => entry(`f${index}.md`))
  )

  it("stops a walk at its entry budget", async () => {
    const walked = await walkEntries([wide], { ...DEFAULT_LIMITS, maxEntries: 7 })
    expect(walked.scanned, "a walk stops at its entry budget").toBe(7)
    expect(walked.truncated, "and says it was cut").toBe(true)
    expect(walked.files, "counting every entry it looked at, the root included").toHaveLength(6)
    expect(
      walked.files.filter((file) => typeof file.open !== "function"),
      "and never opening a file while walking"
    ).toEqual([])
  })

  /* A folder of bulky siblings must not spend the budget before the agent root. */
  it("reaches the agent root before the bulky siblings spend the budget", async () => {
    const bulky = dir("huge", [
      ...Array.from({ length: 50 }, (_, index) =>
        dir(`pkg${index}`, Array.from({ length: 5 }, (_, f) => entry(`f${f}.js`)))
      ),
      dir(".agents", [dir("skills", [dir("grill-me", [entry("SKILL.md")])])]),
    ])
    const narrowed = await walkEntries([bulky], { ...DEFAULT_LIMITS, maxEntries: 12 })
    expect(
      narrowed.files.map((file) => file.path),
      "the agent root is visited before its siblings"
    ).toContain("huge/.agents/skills/grill-me/SKILL.md")
    expect(narrowed.truncated, "so the skill survives the budget").toBe(true)
    expect(
      (await scanFolder(narrowed.files)).map((skill) => skill.name).join(","),
      "and the skill is the one the scan reports"
    ).toBe("grill-me")
  })

  /* An aborted walk stops where it stands. */
  it("stops an aborted walk at once", async () => {
    const aborted = new AbortController()
    aborted.abort()
    await expect(
      walkEntries([wide], DEFAULT_LIMITS, aborted.signal),
      "an aborted walk stops at once"
    ).rejects.toThrow()
  })
})

const file = (filePath: string, text: string) => ({
  path: filePath,
  base64: Buffer.from(text, "utf8").toString("base64"),
})

describe("writing the skills a folder read produced", () => {
  let home: string
  let root: string

  beforeAll(async () => {
    home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-import-"))
    root = path.join(home, "skills")
    await fs.mkdir(root, { recursive: true })
  })

  afterAll(async () => {
    await fs.rm(home, { recursive: true, force: true })
  })

  /* The whole library is one piece of state: the second import reads what the
     first one wrote, which is what proves a name is never replaced. */
  it("writes both skills, and refuses a name the library already holds", async () => {
    const imported = await importFolder(encoded, root)
    expect(imported.installed, "both skills are imported").toEqual(["code-review", "tdd"])
    expect(imported.failed, "nothing was refused").toEqual([])
    expect(
      await fs.readFile(path.join(root, "code-review", "SKILL.md"), "utf8"),
      "the manifest lands at the skill root"
    ).toContain("code-review")
    expect(
      await fs.readFile(path.join(root, "code-review", "reference.md"), "utf8"),
      "nested files keep their directories"
    ).toBe("ref")
    /* Only directories that carry a manifest or hold a skill are written. */
    expect(
      await fs.stat(path.join(root, "repo")).catch(() => null),
      "a folder without a manifest is never written"
    ).toBeNull()
    expect(
      await fs.stat(path.join(root, "node_modules")).catch(() => null),
      "nor is a folder the walk skipped"
    ).toBeNull()

    const again = await importFolder(encoded, root)
    expect(again.installed, "an import never replaces a name already in the library").toEqual([])
    expect(again.failed[0]?.name, "the refusal says which name is taken").toBe("code-review")
    expect(again.failed[0]?.reason, "and why").toContain("already in the library")
  })

  it("refuses a path that climbs out of the skill, leaving nothing behind", async () => {
    const escaping = await importFolder(
      [{ name: "escape", files: [file("SKILL.md", "x"), file("../outside.md", "x")] }],
      root
    )
    expect(escaping.installed, "a path that climbs out refuses the whole skill").toEqual([])
    expect(escaping.failed[0]?.reason, "and says why").toContain("unusable file path")
    expect(
      await fs.stat(path.join(root, "escape")).catch(() => null),
      "and leaves no half-written folder behind"
    ).toBeNull()
    expect(
      await fs.stat(path.join(home, "outside.md")).catch(() => null),
      "and nothing outside the library"
    ).toBeNull()
  })

  it("refuses a skill without a manifest", async () => {
    const nameless = await importFolder(
      [{ name: "no-manifest", files: [file("readme.md", "x")] }],
      root
    )
    expect(nameless.installed, "a skill without a manifest is refused").toEqual([])
    expect(nameless.failed[0]?.reason, "and says why").toContain("no SKILL.md")
  })

  it("writes a binary manifest byte for byte", async () => {
    const bytes = await importFolder(
      [
        {
          name: "binary",
          files: [
            { path: "SKILL.md", base64: Buffer.from([0x00, 0xff, 0x41]).toString("base64") },
            file("extra.bin", "x"),
          ],
        },
      ],
      root
    )
    expect(bytes.installed, "a binary manifest survives the round trip").toEqual(["binary"])
    expect(
      await fs.readFile(path.join(root, "binary", "SKILL.md")),
      "bytes are written as they were read"
    ).toEqual(Buffer.from([0x00, 0xff, 0x41]))
  })
})
