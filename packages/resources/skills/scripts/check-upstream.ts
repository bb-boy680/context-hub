/**
 * Behaviour check for reading what a skill was installed from, and the one
 * hash this hub computes itself.
 *
 * Everything a check compares comes from the skills CLI: it hashes the
 * directory when it installs and records the result in `skills-lock.json`, and
 * a fresh install of the same source gives the number to compare against. The
 * one thing the CLI never says is whether the files on disk were edited after
 * the install, so `skillFolderHash` repeats its algorithm for that — and the
 * golden value below is the CLI's own number for this fixture, taken once from
 * skills@1.7.1 (`skills add <fixture> -a universal --copy -y --json`), so a
 * drift here is caught rather than trusted.
 *
 * Run from the package: `node scripts/check-upstream.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { readLockedUpstream, skillFolderHash } from "../src/host/upstream.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-upstream-"))
console.log(`home: ${home}`)

/* The fixture the golden value was measured on, byte for byte: a manifest, a
   file at the root, and one nested a directory deeper, so path order counts. */
const skill = path.join(home, "fixture-skill")
await fs.mkdir(path.join(skill, "notes"), { recursive: true })
await fs.writeFile(
  path.join(skill, "SKILL.md"),
  "---\nname: fixture-skill\ndescription: A fixture for the hash check\n---\n\n# Fixture\n"
)
await fs.writeFile(path.join(skill, "alpha.txt"), "alpha\n")
await fs.writeFile(path.join(skill, "notes", "deep.md"), "deep\n")

const GOLDEN = "9db1546341e6034e133aab54bff2169c383758c78333607d4243eb104941c177"
const hash = await skillFolderHash(skill)
check("the hash matches the CLI's own number for this fixture", hash === GOLDEN, hash)

/* One byte anywhere under the skill is a different revision. */
await fs.writeFile(path.join(skill, "notes", "deep.md"), "deeper\n")
check("a changed file gives a different hash", (await skillFolderHash(skill)) !== GOLDEN)
await fs.writeFile(path.join(skill, "notes", "deep.md"), "deep\n")
check("and changing it back gives the first one again", (await skillFolderHash(skill)) === GOLDEN)

/* A file the CLI skips is not part of the skill's revision. */
await fs.mkdir(path.join(skill, "node_modules", "x"), { recursive: true })
await fs.writeFile(path.join(skill, "node_modules", "x", "index.js"), "module\n")
await fs.mkdir(path.join(skill, ".git"), { recursive: true })
await fs.writeFile(path.join(skill, ".git", "HEAD"), "ref: refs/heads/main\n")
check("node_modules and .git stay out of the hash", (await skillFolderHash(skill)) === GOLDEN)

/* The lock the CLI writes, keyed by the name it installed. */
await fs.writeFile(
  path.join(home, "skills-lock.json"),
  `${JSON.stringify(
    {
      version: 1,
      skills: {
        "fixture-skill": {
          source: "mattpocock/skills",
          sourceType: "github",
          skillPath: "skills/productivity/fixture-skill/SKILL.md",
          computedHash: GOLDEN,
        },
      },
    },
    null,
    2
  )}\n`
)
const found = await readLockedUpstream(home, "fixture-skill")
check("the lock's record is read back", found?.source === "mattpocock/skills", found)
check("with the package's kind", found?.sourceType === "github", found?.sourceType)
check("the manifest's path in the package", found?.skillPath === "skills/productivity/fixture-skill/SKILL.md", found?.skillPath)
check("and the recorded hash", found?.hash === GOLDEN, found?.hash)

/* A lock written under another display name is still this skill's record. */
await fs.writeFile(
  path.join(home, "skills-lock.json"),
  `${JSON.stringify({
    version: 1,
    skills: {
      "Fixture Skill": {
        source: "mattpocock/skills",
        sourceType: "github",
        skillPath: "skills/productivity/fixture-skill/SKILL.md",
        computedHash: GOLDEN,
      },
    },
  })}\n`
)
check(
  "a record under another display name is found by its path",
  (await readLockedUpstream(home, "fixture-skill"))?.hash === GOLDEN
)

/* What the hub cannot trust, it refuses rather than half-reads. */
await fs.writeFile(
  path.join(home, "skills-lock.json"),
  `${JSON.stringify({ version: 1, skills: { "fixture-skill": { source: "../source", sourceType: "local", computedHash: GOLDEN } } })}\n`
)
check(
  "a record with no manifest path is not an upstream",
  (await readLockedUpstream(home, "fixture-skill")) === null
)
await fs.writeFile(
  path.join(home, "skills-lock.json"),
  `${JSON.stringify({ version: 1, skills: { "fixture-skill": { source: "../source", sourceType: "local", skillPath: "fixture-skill/SKILL.md", computedHash: GOLDEN } } })}\n`
)
check(
  "and a folder on this machine is no upstream to ask",
  (await readLockedUpstream(home, "fixture-skill")) === null
)
await fs.writeFile(path.join(home, "skills-lock.json"), "{ not json")
check("an unreadable lock is no record", (await readLockedUpstream(home, "fixture-skill")) === null)
await fs.rm(path.join(home, "skills-lock.json"))
check(
  "a missing lock is no record",
  (await readLockedUpstream(home, "fixture-skill")) === null
)
check(
  "and a name the lock never mentions is no record",
  (await readLockedUpstream(home, "someone-else")) === null
)

await fs.rm(home, { recursive: true, force: true })
console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
