/**
 * Coverage check for the stylesheet's source globs: every package's `src` must
 * be reachable by at least one `@source` in `globals.css`.
 *
 * This exists because losing that coverage is silent. Tailwind generates only
 * the classes it finds, so a package outside every glob produces no error, no
 * warning and no missing file — the page it belongs to simply renders without
 * its layout. That happened when packages moved a level deeper into groups,
 * and the only signal was a person noticing a broken screen.
 *
 * The check carries its own proof: it asserts that the glob set as it stood
 * before the move would be reported as insufficient, so a passing run means the
 * matcher can tell the two apart rather than agreeing with whatever it is
 * given.
 *
 * Run from the package: `node scripts/check-sources.ts`
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../../..")
const stylesheet = path.join(repo, "packages/shadcn-ui/src/styles/globals.css")

/**
 * A stand-in for the double-star sequence while a glob becomes an expression.
 *
 * It is a private-use character rather than a control one: a control character
 * inside a regular expression is refused by the linter, and this is only ever a
 * marker to be replaced again before the expression is used.
 */
const SENTINEL = "\uE000"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

/** Every `@source "<glob>"` the stylesheet declares, in order. */
function sourceGlobs(text: string): string[] {
  return [...text.matchAll(/@source\s+"([^"]+)"/g)].map((match) => match[1] as string)
}

/**
 * Whether one relative path is matched by a glob.
 *
 * Only the two forms this stylesheet uses: `*` for one path segment and `**`
 * for any run of them. A brace set `{ts,tsx}` is split so each alternative is
 * tried, because a path either ends in one of them or it does not.
 */
function matches(glob: string, target: string): boolean {
  const expand = (pattern: string): string =>
    pattern.replace(/\{([^}]*)\}/g, (_whole, group: string) => `(${group.split(",").join("|")})`)
  const expression = expand(glob)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\|/g, "|")
    /* A double star spans any number of segments; a single star exactly one.
       (Do not write the two-character sequence that closes a comment here.) */
    .replace(/\*\*\//g, SENTINEL)
    .replace(/\*/g, "[^/]*")
    .replace(new RegExp(SENTINEL, "g"), "(?:.*/)?")
  return new RegExp(`^${expression}$`).test(target)
}

/**
 * Whether any glob reaches a target path, both relative to the stylesheet.
 *
 * Globs are written with forward slashes whatever the platform, so a path built
 * with `path.join` has to be converted before it can be compared.
 */
function covered(globs: readonly string[], target: string): boolean {
  const posix = target.split(path.sep).join("/")
  return globs.some((glob) => matches(glob, posix))
}

const text = readFileSync(stylesheet, "utf8")
const globs = sourceGlobs(text)
console.log(`stylesheet: ${path.relative(repo, stylesheet)}`)
console.log(`globs: ${globs.join("  ")}\n`)

/* Proof first: the matcher must tell a reached path from an unreached one, and
   must agree with the glob set as it stood before packages were grouped. */
const oneLevel = "../../../*/src/**/*.{ts,tsx}"
const twoLevel = "../../../*/*/src/**/*.{ts,tsx}"
check(
  "a one-level glob reaches a package directly under packages/",
  matches(oneLevel, "../../../core/src/page.tsx")
)
check(
  "and does not reach one inside a group",
  !matches(oneLevel, "../../../resources/skills/src/page.tsx")
)
check(
  "a two-level glob reaches it",
  matches(twoLevel, "../../../resources/skills/src/page.tsx")
)
check(
  "the glob set as it stood before the move is reported as insufficient",
  !covered([oneLevel, "../../../apps/*/src/**/*.{ts,tsx}"], "../../../resources/skills/src/page.tsx")
)

/** Every package directory, one level down inside a group or directly under packages/. */
function packageDirs(): string[] {
  const packages = path.join(repo, "packages")
  const found: string[] = []
  for (const first of readdirSync(packages)) {
    const top = path.join(packages, first)
    if (!statSync(top).isDirectory()) continue
    if (statSync(path.join(top, "package.json"), { throwIfNoEntry: false }) !== undefined) {
      found.push(top)
      continue
    }
    for (const second of readdirSync(top)) {
      const inner = path.join(top, second)
      if (!statSync(inner).isDirectory()) continue
      if (statSync(path.join(inner, "package.json"), { throwIfNoEntry: false }) !== undefined) {
        found.push(inner)
      }
    }
  }
  return found
}

const stylesDir = path.dirname(stylesheet)
const uncovered: string[] = []
for (const dir of packageDirs()) {
  const source = path.join(dir, "src")
  if (statSync(source, { throwIfNoEntry: false }) === undefined) continue
  /* The package that owns the stylesheet needs no `@source`: Tailwind detects
     sources from the CSS file outward, so only the rest has to be declared. */
  if (stylesheet.startsWith(source + path.sep)) continue
  /* One representative file: the globs are directory scopes, not file lists. */
  const sample = path.join(path.relative(stylesDir, source), "index.ts")
  if (!covered(globs, sample)) uncovered.push(path.relative(repo, source))
}

check(
  `every package's src is reached by a glob (${packageDirs().length} packages)`,
  uncovered.length === 0,
  uncovered
)

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
