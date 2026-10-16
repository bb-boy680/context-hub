/**
 * Behaviour check for the update check: what one "Check updates" run measures,
 * what it records on the rows, and what a source that cannot be read leaves
 * behind.
 *
 * The upstream is a small git repository on this machine, cloned through the
 * skills CLI exactly as a real source would be, so the whole chain — one CLI
 * run per package, the CLI's own hashes, the recorded answer — is exercised
 * without a network. `git` must be on PATH.
 *
 * Run from the package: `node scripts/check-updates.ts`
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"

import { fetchUpstreamRecords } from "../src/host/skills-cli.ts"
import { createFsSkillStore } from "../src/host/skills-fs.ts"

const run = promisify(execFile)

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

async function rejects(what: string, work: Promise<unknown>, pattern: RegExp) {
  try {
    await work
    check(what, false, "it resolved")
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : String(failure)
    check(what, pattern.test(message), message)
  }
}

const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-updates-"))
const source = await fs.mkdtemp(path.join(tmpdir(), "context-hub-source-"))
console.log(`home: ${home}`)
console.log(`source: ${source}`)

/** Write one skill into the fixture repository, replacing whatever was there. */
async function writeSkill(id: string, body: string) {
  const dir = path.join(source, "skills", id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${id}\ndescription: ${body}\n---\n\n# ${id}\n\n${body}\n`
  )
}

async function commit(message: string) {
  await run("git", ["add", "-A"], { cwd: source })
  await run(
    "git",
    ["-c", "user.email=check@localhost", "-c", "user.name=check", "commit", "-q", "-m", message],
    { cwd: source }
  )
}

await run("git", ["init", "-q"], { cwd: source })
await writeSkill("alpha", "Alpha body")
await writeSkill("beta", "Beta body")
await commit("first")

const url = pathToFileURL(source).href
const store = await createFsSkillStore({ home })

type Library = Awaited<ReturnType<typeof createFsSkillStore>>

/** One row of a store's current catalog, read fresh. */
const row = async (library: Library, id: string) =>
  (await library.list()).items.find((item) => item.id === id)

/* Both skills arrive from one source, and the install records the revision the
   CLI hashed, which is what a check later compares against. */
const imported = await store.installPackage(url, ["alpha", "beta"])
check("both skills install from the fixture", imported.installed.length === 2, imported)
const installed = await row(store, "alpha")
check("the install records the source", installed?.upstream?.source === url, installed?.upstream)
check("and the CLI's own hash", installed?.upstream?.hash.length === 64, installed?.upstream?.hash)
check("no check has run yet", installed?.checked === undefined, installed?.checked)

/* One batch check asks each source once and records every answer. */
const first = await store.checkUpdates()
check("a batch check measures both skills", first.checked === 2, first)
check("nothing is outdated at the installed revision", first.outdated === 0, first)
check("and nothing failed", first.failed.length === 0, first.failed)
const checked = await row(store, "alpha")
check("the answer is recorded on the row", checked?.checked?.latest !== undefined, checked?.checked)
check(
  "with what this copy held at the same moment",
  checked?.checked?.currentHash === checked?.checked?.latest,
  checked?.checked
)

/* The source moves on: one skill changes, the other does not. */
await writeSkill("alpha", "Alpha body, second revision")
await commit("second")
const second = await store.checkUpdates()
check("a moved source is outdated", second.outdated === 1, second)
check("while the other skill is still measured", second.checked === 2, second)
const advanced = await row(store, "alpha")
check(
  "the row still records what was installed",
  advanced?.upstream?.hash !== advanced?.checked?.latest,
  advanced?.upstream
)
check(
  "and what is on disk matches that, not the source",
  advanced?.checked?.currentHash === advanced?.upstream?.hash,
  advanced?.checked
)

/* One skill asked on its own answers the same question. */
const single = await store.checkUpdate("beta")
check("a single check of an unmoved skill is current", single.outdated === false, single)
check("with nothing modified by hand", single.modified === false, single)
check(
  "and the source's hash as the latest",
  single.latestHash === (await row(store, "beta"))?.upstream?.hash
)

/* A hand-edited copy is visible without cloning anything. */
await fs.writeFile(
  path.join(home, "skills", "beta", "SKILL.md"),
  "---\nname: beta\ndescription: Beta body\n---\n\n# beta\n\nEdited by hand\n"
)
const modified = await store.checkUpdate("beta")
check("a hand-edited copy reports modified", modified.modified === true, modified)
check("without becoming outdated", modified.outdated === false, modified)

/* Updating installs the source's revision over the copy and records it. */
await store.updateFromUpstream("alpha")
const updated = await row(store, "alpha")
check("an update records the new revision", updated?.upstream?.hash === updated?.checked?.latest, updated)
check("as what is on disk", updated?.checked?.currentHash === updated?.checked?.latest, updated)
check(
  "and the files are that revision",
  (
    await fs.readFile(path.join(home, "skills", "alpha", "SKILL.md"), "utf8")
  ).includes("second revision")
)
const settled = await store.checkUpdates()
check("nothing is outdated after the update", settled.outdated === 0, settled)

/* A fresh process reads the recorded answers back from the catalog, so the
   badge and the dialog survive a reload. */
store.dispose()
const catalogPath = path.join(home, "skills", "index.json")
const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8")) as {
  skills: Record<string, Record<string, unknown>>
}
const missing = `${url}-missing`
catalog.skills["ghost-test"] = {
  name: "ghost-test",
  description: "The source for this one cannot be read",
  tags: [],
  enabled: true,
  source: "registry",
  assets: [],
  mtimeMs: 1,
  updatedAt: "",
  upstream: {
    source: missing,
    sourceType: "git",
    skillPath: "skills/ghost-test/SKILL.md",
    hash: "0".repeat(64),
  },
}
await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
await fs.mkdir(path.join(home, "skills", "ghost-test"), { recursive: true })
await fs.writeFile(
  path.join(home, "skills", "ghost-test", "SKILL.md"),
  "---\nname: ghost-test\ndescription: The source for this one cannot be read\n---\n\n# ghost\n"
)
const store2 = await createFsSkillStore({ home })
const carried = await row(store2, "alpha")
check("a new store still sees the recorded check", carried?.checked?.latest !== undefined, carried?.checked)
const ghost = await row(store2, "ghost-test")
check("a row written by hand keeps its source", ghost?.upstream?.source === missing, ghost?.upstream)

/* One unreachable source is named, and the others still answer. */
const mixed = await store2.checkUpdates()
check("the readable source still answers", mixed.checked === 2, mixed)
check(
  "and the unreachable one is named with a reason",
  mixed.failed.length === 1 &&
    mixed.failed[0]?.name === "ghost-test" &&
    mixed.failed[0].reason.length > 0,
  mixed.failed
)

/* What cannot be answered says so rather than guessing. */
await rejects("an unknown skill is refused", store2.checkUpdate("nope"), /unknown skill/)
const created = await store2.create({ name: "No Source", description: "Written here" })
await rejects(
  "a skill with no recorded source is refused",
  store2.checkUpdate(created.id),
  /no recorded source/
)
const none = await fetchUpstreamRecords(url, [])
check("asking about no skills touches nothing", none.records.size === 0 && none.failed.size === 0, none)

store2.dispose()
await fs.rm(home, { recursive: true, force: true })
await fs.rm(source, { recursive: true, force: true })
console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
