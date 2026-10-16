/**
 * Coverage check for the stylesheet's source globs: every package's `src` must
 * be reachable by at least one `@source` in `globals.css`.
 *
 * This exists because losing that coverage is silent. Tailwind generates only
 * the classes it finds, so a package outside every glob produces no error, no
 * warning and no missing file — the page it belongs to simply renders without
 * its layout. That happened when packages moved a level deeper into groups, and
 * the only signal was a person noticing a broken screen.
 *
 * The matcher is proved before it is used: a case below asserts that the glob set
 * as it stood before the move is reported as insufficient, so a passing run means
 * the matcher can tell the two apart rather than agreeing with whatever it is
 * given.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const here = path.dirname(fileURLToPath(import.meta.url))
/* Two levels up from `__test__`, which is where `scripts` sat: the repo root. */
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

const globs = sourceGlobs(readFileSync(stylesheet, "utf8"))
const stylesDir = path.dirname(stylesheet)

/** Every `src` directory no glob reaches, relative to the repo. */
function uncoveredSources(): string[] {
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
  return uncovered
}

/* The glob set as it stood before packages were grouped, which is what the
   matcher has to be able to call insufficient. */
const ONE_LEVEL = "../../../*/src/**/*.{ts,tsx}"
const TWO_LEVEL = "../../../*/*/src/**/*.{ts,tsx}"

describe("the glob matcher", () => {
  it("tells a one-level glob from a two-level one, and calls the old set insufficient", () => {
    expect(
      matches(ONE_LEVEL, "../../../core/src/page.tsx"),
      "a one-level glob reaches a package directly under packages/"
    ).toBe(true)
    expect(
      matches(ONE_LEVEL, "../../../resources/skills/src/page.tsx"),
      "and does not reach one inside a group"
    ).toBe(false)
    expect(matches(TWO_LEVEL, "../../../resources/skills/src/page.tsx")).toBe(true)
    expect(
      covered(
        [ONE_LEVEL, "../../../apps/*/src/**/*.{ts,tsx}"],
        "../../../resources/skills/src/page.tsx"
      ),
      "the glob set as it stood before the move"
    ).toBe(false)
  })
})

describe("the stylesheet's coverage", () => {
  it("reaches every package's src", () => {
    const uncovered = uncoveredSources()
    expect(uncovered, `no @source reaches ${uncovered.join(", ")}`).toEqual([])
    expect(packageDirs().length, "packages walked").toBeGreaterThan(0)
  })
})
