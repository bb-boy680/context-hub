/**
 * Behaviour check for the disk-backed state store. It runs the store against a
 * temporary hub home and asserts the contract: one JSON document per name under
 * `<home>/state`, names that are file names, a read of an absent document that
 * is `null`, a malformed document that is an error rather than an empty value,
 * and an atomic write that leaves no temporary file behind.
 *
 * Run from the package: `node scripts/check-state.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { assertStateName } from "../src/state.ts"
import { createFsStateStore } from "../src/host/state-fs.ts"
import { TEMP_PREFIX } from "../src/host/atomic.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-state-"))
const store = createFsStateStore(home)
console.log(`home: ${home}`)

check("the store reports where it writes", store.root === path.join(home, "state"), store.root)
check("an empty home lists nothing", (await store.names()).length === 0)
check("an absent document reads as null", (await store.read("extensions")) === null)

/* A write lands as one pretty-printed JSON file under the state directory. */
await store.write("extensions", { skills: true, "zh-cn": false })
const file = path.join(home, "state", "extensions.json")
check("a written document is a JSON file named after it", (await fs.stat(file)).isFile())
check(
  "the file holds the value itself, not an encoded string",
  (await fs.readFile(file, "utf8")) ===
    `${JSON.stringify({ skills: true, "zh-cn": false }, null, 2)}\n`
)
check(
  "reading it back returns the value",
  JSON.stringify(await store.read("extensions")) === JSON.stringify({ skills: true, "zh-cn": false })
)

/* Values survive a new store over the same home, which is the point of the move. */
const reopened = createFsStateStore(home)
check(
  "a reopened store reads what the last one wrote",
  JSON.stringify(await reopened.read("extensions")) === JSON.stringify({ skills: true, "zh-cn": false })
)

/* Scalars and arrays are documents too; the locale is a bare string. */
await store.write("locale", "zh-CN")
check("a scalar document round-trips", (await store.read("locale")) === "zh-CN")
check("names lists every document, sorted", (await store.names()).join(",") === "extensions,locale", await store.names())

/* Names become file names, so anything else is refused before a path is built. */
const refused = ["..", "hub/locale", "Hub", ".hidden", "", "with space", "extensions.json"]
for (const name of refused) {
  let message = ""
  try {
    assertStateName(name)
  } catch (error) {
    message = error instanceof Error ? error.message : String(error)
  }
  check(`a name that is not a file name is refused: ${JSON.stringify(name)}`, message !== "", message)
}
let traversal = ""
try {
  await store.write("../escape", {})
} catch (error) {
  traversal = error instanceof Error ? error.message : String(error)
}
check("writing outside the state directory is refused", traversal !== "", traversal)
check("nothing was written outside", (await fs.stat(path.join(home, "escape.json")).catch(() => null)) === null)

/* A file that is not JSON is an error, so the caller can warn instead of guessing. */
await fs.writeFile(path.join(home, "state", "broken.json"), "{not json", "utf8")
let broken = ""
try {
  await store.read("broken")
} catch (error) {
  broken = error instanceof Error ? error.message : String(error)
}
check("a malformed document reports the file", broken.includes("broken.json"), broken)

/* Files that are not state documents stay out of the list and out of the way. */
await fs.writeFile(path.join(home, "state", "notes.md"), "kept", "utf8")
check("a foreign file is not listed", !(await store.names()).includes("notes"))
check("a foreign file is left alone", (await fs.readFile(path.join(home, "state", "notes.md"), "utf8")) === "kept")

/* The write is atomic: a reader never sees a temporary file, and none is left. */
await store.write("extensions", { skills: false })
check("the replaced document holds the new value", (await store.read("extensions"))?.skills === false)
check(
  "no temporary file survives a write",
  (await fs.readdir(path.join(home, "state"))).every((entry) => !entry.startsWith(TEMP_PREFIX)),
  await fs.readdir(path.join(home, "state"))
)

await fs.rm(home, { recursive: true, force: true })
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
