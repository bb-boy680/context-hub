/**
 * Coverage check for the Chinese pack: every key the interface can render must be
 * in it, so a translated screen never falls back to English in the middle of a
 * sentence.
 *
 * The English side is every table that ships keys — the kernel's locked base pack
 * and each package's own defaults — because a key only one package knows about is
 * exactly the one a translator misses.
 *
 * This is the one check that had no `check()` to convert: it is a report, one
 * line per table, and it fails on the same single condition it always did. A key
 * that no table declares any more is printed rather than failed on — a dead key
 * is untidy, but it is not a screen falling back to English, which is what this
 * file exists to catch.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const here = path.dirname(fileURLToPath(import.meta.url))
/* Four levels up from `__test__`, which is where `scripts` sat: the repo root. */
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
 * Every `src/messages.ts` a package directory holds: the package's own, or — for
 * a grouping directory like `resources` — one per package inside it, so a table
 * packed one level deeper is still a source of keys.
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
      /* The pack under check is the thing being filled, not a source for it: skip
         it by where it is, so moving the pack needs no edit here. */
      if (path.resolve(table.file) === path.resolve(CHINESE)) continue
      tables.push({ name: table.name, keys: keysOf(table.file) })
    }
  }
  return tables
}

const chinese = keysOf(CHINESE)
const tables = englishTables()
const declared = new Set(tables.flatMap((table) => [...table.keys]))
/** A key no table declares is one nobody renders any more. */
const stale = [...chinese].filter((key) => !declared.has(key))

describe("the Chinese pack", () => {
  it.each(tables)("carries every key $name declares", (table) => {
    const absent = [...table.keys].filter((key) => !chinese.has(key))
    expect(absent, `${table.name} keys with no translation`).toEqual([])
  })

  it("covers every key the interface can render", () => {
    const absent = [...declared].filter((key) => !chinese.has(key))
    if (stale.length > 0) console.log(`no table declares: ${stale.join(", ")}`)
    expect(absent, `not in the pack: ${absent.join(", ")}`).toEqual([])
    /* A pack holding fewer keys than are declared would pass the line above only
       by having lost one it never had. */
    expect(chinese.size).toBeGreaterThanOrEqual(declared.size)
  })
})
