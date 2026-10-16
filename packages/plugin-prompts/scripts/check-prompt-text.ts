/**
 * Behaviour check for the three functions that turn a prompt into text on
 * disk: the file name, the command file, and the section added to an
 * instruction file.
 *
 * These are the parts of the module that can be checked without a disk, a
 * browser or a kernel, and they are also the parts where a wrong answer is
 * quiet — a name that escapes its directory, a frontmatter line that stops
 * being YAML, a second click that adds a second section. So each case below
 * pairs a name or a file that must work with one that must not, and the two
 * are asserted together.
 *
 * Run from the package: `node scripts/check-prompt-text.ts`
 */
import { commandFile, describeBody } from "../src/command-file.ts"
import { slugOf } from "../src/slug.ts"
import { withSection } from "../src/instruction.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

/* ── The file name ──────────────────────────────────────────────────────────
   The dangerous names are the point: everything downstream splits the name on
   `/` to check it, so a backslash, a drive letter or a leading dot has to have
   been settled here. Each one is paired with a name that must survive intact. */
console.log("slugOf")

const dangerous: [string, string][] = [
  ["a path separator", "../../etc/passwd"],
  ["a backslash traversal", "..\\..\\windows\\system32"],
  ["a drive letter", "C:\\Users\\me\\.claude"],
  ["a bare parent", ".."],
  ["a bare dot", "."],
  ["a leading dot", ".hidden"],
  ["a comment marker", "<!-- context-hub:x -->"],
  ["a colon", "note: read this"],
  ["a wildcard", "a*b?c"],
  ["a newline", "first\nsecond"],
]
for (const [what, name] of dangerous) {
  const slug = slugOf(name)
  const ok =
    slug !== "" &&
    !slug.includes("/") &&
    !slug.includes("\\") &&
    !slug.includes("..") &&
    !slug.includes(":") &&
    !slug.startsWith(".") &&
    /^[\p{L}\p{N}-]+$/u.test(slug)
  check(`refuses to carry ${what}`, ok, slug)
}

for (const [name, expected] of [
  ["Code Review", "code-review"],
  ["  PDF Extract  ", "pdf-extract"],
  ["a  b", "a-b"],
  ["CON", null],
  ["com1", null],
  ["!!!", null],
] as const) {
  const slug = slugOf(name)
  if (expected === null) {
    check(`"${name}" does not become a device name`, slug !== "con" && slug !== "com1", slug)
    continue
  }
  check(`"${name}" becomes ${expected}`, slug === expected, slug)
}

/* CJK survives: a name written in Chinese should read as itself, not collapse
   into the digest fallback or an empty string. */
check("a Chinese name keeps its characters", slugOf("代码审查") === "代码审查", slugOf("代码审查"))
check("two Chinese names differ", slugOf("代码审查") !== slugOf("数据查询"), null)
/* The fallback is stable: the same name reaches the same file every time. */
check("an unusable name falls back deterministically", slugOf("!!!") === slugOf("!!!"))
check("long names are clipped to a usable length", slugOf("x".repeat(200)).length <= 64)
check(
  "clipping does not leave a trailing separator",
  !slugOf(`${"x".repeat(62)} tail`).endsWith("-"),
  slugOf(`${"x".repeat(62)} tail`)
)

/* ── The command file ─────────────────────────────────────────────────────── */
console.log("commandFile")

const plain = commandFile({ name: "Code Review", body: "Review the diff.\n", frontmatter: false })
check("install writes the prompt as it stands", plain === "Review the diff.\n", plain)

const crlf = commandFile({
  name: "Code Review",
  body: "line one\r\nline two\r\n",
  frontmatter: false,
})
check("a Windows body lands as LF", crlf === "line one\nline two\n", crlf)

const bom = commandFile({ name: "x", body: "\uFEFF# Title\n", frontmatter: false })
check("a BOM is not carried into the file", bom === "# Title\n", bom)

const described = commandFile({
  name: "Code Review",
  body: "Review the diff.",
  frontmatter: true,
})
check(
  "a generated command opens with a block",
  described.startsWith("---\nname: Code Review\n") && described.includes("\n---\n\n"),
  described
)
check(
  "the block is closed exactly once",
  described.split("\n").filter((line) => line === "---").length === 2,
  described
)

/* A description is one bare scalar, so the characters that mean something to a
   YAML reader have to be quoted — otherwise the agent reads a broken block. */
const quoted = commandFile({
  name: "Note",
  description: "Use: this, then #that",
  body: "body",
  frontmatter: true,
})
check("a colon in the description is quoted", quoted.includes('description: "Use: this'), quoted)

const leading = commandFile({ name: "-dash", body: "body", frontmatter: true })
check("a leading indicator is quoted", leading.includes('name: "-dash"'), leading)

const multiline = commandFile({
  name: "x",
  description: "first\nsecond",
  body: "body",
  frontmatter: true,
})
check(
  "a description with a newline stays one line",
  multiline.split("\n").filter((line) => line.startsWith("description:")).length === 1 &&
    multiline.includes("description: first second"),
  multiline
)

check(
  "a missing description falls back to the first line",
  commandFile({ name: "x", body: "## Do the thing\nmore", frontmatter: true }).includes(
    "description: Do the thing"
  ),
  commandFile({ name: "x", body: "## Do the thing\nmore", frontmatter: true })
)
check("describeBody ignores blank and marked lines", describeBody("\n\n> real\n") === "real")
check("describeBody of an empty body is empty", describeBody("   \n\n") === "")
check(
  "a long first line is clipped",
  describeBody("y".repeat(300)).length <= 80,
  describeBody("y".repeat(300)).length
)

/* ── The instruction file section ─────────────────────────────────────────── */
console.log("withSection")

const one = withSection(null, { slug: "code-review", title: "Code Review", body: "Review it." })
check("an absent file becomes just the section", one.includes("## Code Review"), one)
check("the section is marked", one.includes("<!-- context-hub:code-review -->"), one)
check(
  "the file ends with one newline",
  one.endsWith("<!-- /context-hub:code-review -->\n") && !one.endsWith("\n\n"),
  JSON.stringify(one)
)

/* The idempotency that matters: the second click must not add a second copy. */
const twice = withSection(one, { slug: "code-review", title: "Code Review", body: "Review it." })
check("a second click changes nothing", twice === one, { once: one, twice })
check(
  "a second click leaves one heading",
  twice.split("## Code Review").length === 2,
  twice
)

/* Editing the prompt replaces the section rather than adding another. */
const edited = withSection(one, { slug: "code-review", title: "Code Review", body: "Review it twice." })
check("an edited prompt replaces its section", edited.includes("twice"), edited)
check("the old text is gone", !edited.includes("Review it.\n"), edited)
check(
  "replacing keeps one section",
  edited.split("<!-- context-hub:code-review -->").length === 2,
  edited
)

/* Somebody else's file comes back whole. */
const theirs = "# My rules\n\nAlways use tabs.\n"
const appended = withSection(theirs, { slug: "code-review", title: "Code Review", body: "Review it." })
check("the file's own text is untouched", appended.startsWith(theirs), appended)
check("the section lands at the end", appended.trimEnd().endsWith("<!-- /context-hub:code-review -->"), appended)
check(
  "adding to a file leaves one section after a second click",
  withSection(appended, { slug: "code-review", title: "Code Review", body: "Review it." }) === appended,
  appended
)

/* A file written on Windows stays a Windows file. */
const crlfFile = "# My rules\r\n\r\nAlways use tabs.\r\n"
const crlfOut = withSection(crlfFile, { slug: "r", title: "R", body: "line\nline" })
check("a CRLF file keeps CRLF", crlfOut.includes("Always use tabs.\r\n"), JSON.stringify(crlfOut))
check("the added section uses CRLF too", !/[^\r]\n/.test(crlfOut), JSON.stringify(crlfOut))

/* A section already there is replaced where it stands, keeping what follows. */
const middle = withSection(
  `top\n\n${withSection(null, { slug: "s", title: "S", body: "old" }).trimEnd()}\n\nbottom`,
  { slug: "s", title: "S", body: "new" }
)
check("a section in the middle is replaced in place", middle.startsWith("top\n\n"), middle)
check("what followed it survives", middle.includes("bottom"), middle)
check("the replacement is the new text", middle.includes("new") && !middle.includes("old"), middle)
check(
  "replacing in the middle is idempotent",
  withSection(middle, { slug: "s", title: "S", body: "new" }) === middle,
  middle
)

/* A hand-deleted closing marker must not start a second section. */
const half = `top\n\n<!-- context-hub:s -->\n## S\n\nold\n`
const healed = withSection(half, { slug: "s", title: "S", body: "new" })
check("a half-marked section is replaced, not doubled", healed.includes("new") && !healed.includes("old"), healed)
check("healing keeps one opening marker", healed.split("<!-- context-hub:s -->").length === 2, healed)

/* Two prompts in one file are two sections, and neither disturbs the other. */
const pair = withSection(one, { slug: "other", title: "Other", body: "Other body." })
check("a second prompt is its own section", pair.includes("## Code Review") && pair.includes("## Other"), pair)
check(
  "each prompt is idempotent on its own",
  withSection(pair, { slug: "other", title: "Other", body: "Other body." }) === pair,
  pair
)
check("the first prompt is still there once", pair.split("<!-- context-hub:code-review -->").length === 2, pair)

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`)
process.exitCode = failures === 0 ? 0 : 1
