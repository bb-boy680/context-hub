/**
 * Behaviour check for taking skills in from outside. Three pieces are exercised
 * without a network: reading the Package field back into a source and a set of
 * pinned skills, reading the `skills add --list` text into rows, and writing a
 * dropped folder into a library root.
 *
 * Run from the package: `node scripts/check-package.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { importFolder } from "../src/host/folder-import.ts"
import { parsePackageList } from "../src/host/skills-cli.ts"
import { readFolderFiles, scanFolder } from "../src/folder-scan.ts"
import { parsePackageRequest } from "../src/package-source.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

function same(what: string, actual: unknown, expected: unknown) {
  check(what, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected })
}

/* --- the Package field ------------------------------------------------- */

same("a bare shorthand is the source", parsePackageRequest("mattpocock/skills"), {
  source: "mattpocock/skills",
  skills: [],
})

same("an @ pin splits off the skill", parsePackageRequest("mattpocock/skills@grill-me"), {
  source: "mattpocock/skills",
  skills: ["grill-me"],
})

same(
  "a URL keeps its @, which is a credential separator there",
  parsePackageRequest("https://github.com/mattpocock/skills@grill-me"),
  { source: "https://github.com/mattpocock/skills@grill-me", skills: [] }
)

same(
  "a pasted command gives up its source and its --skill flags",
  parsePackageRequest(
    "npx skills add https://github.com/mattpocock/skills --skill grill-me"
  ),
  { source: "https://github.com/mattpocock/skills", skills: ["grill-me"] }
)

same(
  "a versioned command, short flags, and repeats all read the same",
  parsePackageRequest(
    "npx skills@1.7.1 add mattpocock/skills -s tdd -s code-review -a universal --copy -y"
  ),
  { source: "mattpocock/skills", skills: ["tdd", "code-review"] }
)

same(
  "an inline --skill=value is read too",
  parsePackageRequest("mattpocock/skills --skill=tdd"),
  { source: "mattpocock/skills", skills: ["tdd"] }
)

same(
  "the same skill twice is one pick",
  parsePackageRequest("mattpocock/skills@tdd --skill tdd"),
  { source: "mattpocock/skills", skills: ["tdd"] }
)

same("an empty field asks for nothing", parsePackageRequest("   "), {
  source: "",
  skills: [],
})

same(
  "a global flag does not become the source",
  parsePackageRequest("-g mattpocock/skills"),
  { source: "mattpocock/skills", skills: [] }
)

/* --- the --list report ------------------------------------------------- */

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
check("the listing yields every skill once", rows.length === 3, rows)
same(
  "names and descriptions keep their order and pairing",
  rows.map((row) => row.name),
  ["ask-matt", "code-review", "prototype"]
)
check(
  "a description is attached to the skill above it",
  rows[1]?.description === "Review the changes since a fixed point, along two axes: standards and spec.",
  rows[1]
)
check(
  "a group title is not a skill",
  !rows.some((row) => row.name === "General" || row.name === "Mattpocock Skills")
)
check(
  "the footer is not a skill",
  !rows.some((row) => row.name.includes("Use --skill"))
)
check("a report with no listing yields nothing", parsePackageList("◇  Cloning repository…").length === 0)

/* --- reading a dropped folder ------------------------------------------ */

const droppedFiles = [
  {
    path: "docs-writer/SKILL.md",
    file: new File(
      ["---\nname: docs-writer\ndescription: Turn notes into a docs page.\n---\n\nBody\n"],
      "SKILL.md"
    ),
  },
  { path: "docs-writer/references/guide.md", file: new File(["guide"], "guide.md") },
  { path: "notes/readme.md", file: new File(["notes"], "readme.md") },
]

const scanned = await scanFolder(droppedFiles)
same("a folder yields one skill per SKILL.md", scanned.map((skill) => skill.name), [
  "docs-writer",
])
check(
  "the skill carries its description and its files",
  scanned[0]?.description === "Turn notes into a docs page." &&
    scanned[0]?.files.length === 2,
  scanned[0]
)
check(
  "a folder without a manifest is not a candidate",
  !scanned.some((skill) => skill.name === "notes")
)
check(
  "a file at the drop's root belongs to no skill",
  (await scanFolder([{ path: "SKILL.md", file: new File(["x"], "SKILL.md") }])).length === 0
)

const encoded = await readFolderFiles(scanned)
check(
  "a folder is encoded with its paths",
  encoded.length === 2 &&
    encoded.map((file) => file.path).join(",") ===
      "docs-writer/SKILL.md,docs-writer/references/guide.md",
  encoded.map((file) => file.path)
)

/* --- writing a dropped folder ------------------------------------------ */

const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-import-"))
const root = path.join(home, "skills")
await fs.mkdir(root, { recursive: true })
console.log(`home: ${home}`)

const file = (filePath: string, text: string) => ({
  path: filePath,
  base64: Buffer.from(text, "utf8").toString("base64"),
})

const dropped = [
  file("docs-writer/SKILL.md", "---\nname: docs-writer\n---\n\nBody\n"),
  file("docs-writer/references/guide.md", "guide"),
  file("notes/readme.md", "not a skill"),
  { path: "../escape/SKILL.md", base64: Buffer.from("x").toString("base64") },
]

const imported = await importFolder(dropped, root)
same("only the folder with a SKILL.md is imported", imported.installed, ["docs-writer"])
check("a folder without a SKILL.md is not reported as a failure", imported.failed.length === 0, imported.failed)
check(
  "the manifest lands at the skill root",
  (await fs.readFile(path.join(root, "docs-writer", "SKILL.md"), "utf8")).includes("docs-writer")
)
check(
  "nested files keep their directories",
  (await fs.readFile(path.join(root, "docs-writer", "references", "guide.md"), "utf8")) === "guide"
)
check(
  "a folder without a manifest is not written",
  (await fs.stat(path.join(root, "notes")).catch(() => null)) === null
)
check(
  "a path that climbs out writes nothing",
  (await fs.stat(path.join(home, "escape")).catch(() => null)) === null &&
    (await fs.stat(path.join(root, "escape")).catch(() => null)) === null
)

const again = await importFolder(dropped, root)
same("an import never replaces a name already in the library", again.installed, [])
check(
  "the refusal says which name is taken",
  again.failed[0]?.name === "docs-writer" &&
    again.failed[0]?.reason.includes("already in the library"),
  again.failed
)

const bytes = await importFolder(
  [
    { path: "binary/SKILL.md", base64: Buffer.from([0x00, 0xff, 0x41]).toString("base64") },
    file("binary/extra.bin", "x"),
  ],
  root
)
same("a binary manifest survives the round trip", bytes.installed, ["binary"])
check(
  "bytes are written as they were read",
  (await fs.readFile(path.join(root, "binary", "SKILL.md"))).equals(Buffer.from([0x00, 0xff, 0x41]))
)

await fs.rm(home, { recursive: true, force: true })

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} checks failed`)
process.exit(failures === 0 ? 0 : 1)
