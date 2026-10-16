/**
 * Coverage check for the Chinese pack: every key the interface can render must
 * be in it, so a translated screen never falls back to English in the middle of
 * a sentence.
 *
 * The English side is every table that ships keys — the kernel's locked base
 * pack and each plugin's own defaults — because a key only one package knows
 * about is exactly the one a translator misses.
 *
 * Run from the package: `node scripts/check-messages.ts`
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
/* Four levels up: this file sits at packages/<group>/<leaf>/scripts. */
const root = path.resolve(here, "../../../..")
const packages = path.join(root, "packages")

/** The pack being checked; every other table is a source of keys it must carry. */
const CHINESE = path.join(packages, "i18n/zh-cn/src/messages.ts")

/** Every `"key": "value"` a TypeScript source declares, whatever its namespace. */
const KEYS = /"([a-zA-Z][A-Za-z0-9]*\.?[A-Za-z0-9.]*)":\s*"/g

function keysOf(file: string): Set<string> {
  const text = readFileSync(file, "utf8")
  return new Set([...text.matchAll(KEYS)].map((match) => match[1] as string))
}

/**
 * Every `src/messages.ts` a package directory holds: the package's own, or —
 * for a grouping directory like `resources` — one per package inside it, so a
 * table packed one level deeper is still a source of keys.
 */
function messageTables(dir: string): { name: string; file: string }[] {
  const own = path.join(dir, "src/messages.ts")
  if (existsSync(own)) return [{ name: path.basename(dir), file: own }]
  return readdirSync(dir)
    .map((child) => ({ name: child, file: path.join(dir, child, "src/messages.ts") }))
    .filter((table) => existsSync(table.file))
}

/** The English tables: the kernel's base pack, then each package's own defaults. */
function englishTables(): { name: string; keys: Set<string> }[] {
  const tables: { name: string; keys: Set<string> }[] = [
    {
      name: "extensions",
      keys: keysOf(path.join(packages, "extensions/src/builtin/locale-en.ts")),
    },
  ]
  for (const name of readdirSync(packages).sort()) {
    for (const table of messageTables(path.join(packages, name))) {
      /* The pack under check is the thing being filled, not a source for it:
         skip it by where it is, so moving the pack needs no edit here. */
      if (path.resolve(table.file) === path.resolve(CHINESE)) continue
      tables.push({ name: table.name, keys: keysOf(table.file) })
    }
  }
  return tables
}

const chinese = keysOf(CHINESE)
let missing = 0
let checked = 0
const declared = new Set<string>()

for (const table of englishTables()) {
  checked += table.keys.size
  for (const key of table.keys) declared.add(key)
  const absent = [...table.keys].filter((key) => !chinese.has(key))
  missing += absent.length
  console.log(
    `${absent.length === 0 ? "ok  " : "MISS"} ${table.name}: ${table.keys.size} keys` +
      (absent.length === 0 ? "" : ` — missing ${absent.join(", ")}`)
  )
}

/* A key no table declares is one nobody renders any more. */
const stale = [...chinese].filter((key) => !declared.has(key))
if (stale.length > 0) console.log(`\nno source declares: ${stale.join(", ")}`)

console.log(`\n${checked - missing}/${checked} keys are in the Chinese pack (${chinese.size} keys there)`)
if (missing > 0) process.exitCode = 1
