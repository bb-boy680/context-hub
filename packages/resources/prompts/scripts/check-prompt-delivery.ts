/**
 * Behaviour check for where a prompt actually lands on disk.
 *
 * The pieces are each checked on their own elsewhere — the file name, the
 * command file, the section markers — and this is the one that puts them
 * together through the real port, against a throwaway workspace. What it is
 * looking for is the mistakes a unit test cannot see: a directory that was
 * never created, a document that got overwritten instead of added to, a second
 * click that left two sections, a file whose newlines were rewritten.
 *
 * It never touches the form that runs it: the workspace is a temporary
 * directory, so `.agents/` and `AGENTS.md` here are nobody's real files.
 *
 * Run from the package: `node scripts/check-prompt-delivery.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { createFsPlaceFiles } from "@context-hub/core/host/place-files"

import { deliver, delivered, targetOf, undeliver } from "../src/deliver.ts"
import type { PromptPlace } from "../src/provider.ts"
import type { Prompt } from "../src/store.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

/** The temporary world this check runs in: a hub home and a project beside it. */
const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-delivery-home-"))
const project = await fs.mkdtemp(path.join(tmpdir(), "context-hub-delivery-ws-"))
/**
 * And somewhere for the machine-wide scope to read under.
 *
 * `userHome` is passed rather than left to default, because its default is the
 * person's real home — and this check writes. A global place under the real one
 * would put `.agents/rules/` in the middle of somebody's machine.
 */
const machine = await fs.mkdtemp(path.join(tmpdir(), "context-hub-delivery-user-"))
const files = createFsPlaceFiles({ home, folder: project, userHome: machine })

/** The place the prompts module registers, as it registers it. */
const WORKSPACE: PromptPlace = {
  id: "workspace",
  agent: "hub.prompt.catalog",
  labelKey: "prompts.location.workspace",
  icon: () => null,
  scope: "workspace",
  commandDir: ".agents/commands",
  ruleDir: ".agents/rules",
  documents: [
    { id: "agents", labelKey: "prompts.menu.document.agents", file: "AGENTS.md" },
    { id: "design", labelKey: "prompts.menu.document.design", file: "DESIGN.md" },
  ],
  generatedOnly: true,
  order: 0,
}

/** The same place in the machine-wide scope, where the roots differ. */
const GLOBAL: PromptPlace = { ...WORKSPACE, id: "workspace-global", scope: "global" }

/* The title and the description are deliberately different sentences with
   different file names: every assertion below about `code-review.md` is an
   assertion that the delivered file is named after the title. */
const prompt: Prompt = {
  name: "Code Review",
  description: "Reads the diff and says what it changes",
  prompt: "Review the diff.\nReport what it changes.",
  tags: [],
  updatedAt: "",
  assets: [],
}

const at = (...parts: string[]) => path.join(project, ...parts)
const read = (file: string) => fs.readFile(file, "utf8")
const exists = async (file: string) => (await fs.stat(file).catch(() => null)) !== null

/* --- the two directories -------------------------------------------------- */

check("nothing is written before a delivery", !(await exists(at(".agents"))))

await deliver(files, WORKSPACE, prompt, "commands")
const command = await read(at(".agents", "commands", "code-review.md"))
check("a command lands under .agents/commands, directory and all", command !== null)
check("and carries the block an agent reads", command.startsWith("---\nname:"), command.slice(0, 40))
check("with the prompt's own name in it", command.includes("name: Code Review"), command)
/* The block's description is the row's own, not the body's opening line cut to
   eighty characters — which is what a row with no description of its own falls
   back to. */
check(
  "and with its own description, not the body's first line",
  command.includes("description: Reads the diff and says what it changes"),
  command
)
check("and the prompt's own text", command.includes("Review the diff."), command)
check(
  "and the run is reported as delivered",
  (await delivered(files, WORKSPACE, prompt, "commands")) === true
)

await deliver(files, WORKSPACE, prompt, "rule")
const rule = await read(at(".agents", "rules", "code-review.md"))
check("a rule lands in a directory of its own", rule !== null)
check("without the frontmatter", !rule.startsWith("---"), rule.slice(0, 20))
check("but with the prompt's text", rule.includes("Report what it changes."), rule)

/* An install and a command are one file, not two: a second copy beside the
   first would be the one that goes stale. */
await deliver(files, WORKSPACE, prompt, "install")
const plain = await read(at(".agents", "commands", "code-review.md"))
check("an install writes the same file a command does", !plain.startsWith("---"), plain.slice(0, 20))
check(
  "and there is only one file in the directory",
  (await fs.readdir(at(".agents", "commands"))).join(" ") === "code-review.md",
  await fs.readdir(at(".agents", "commands"))
)

/* --- the documents -------------------------------------------------------- */

/* A project file that already says something of its own, CRLF and all. */
const HAND = "# House rules\r\n\r\nNobody writes to main.\r\n"
await fs.writeFile(at("AGENTS.md"), HAND)

await deliver(files, WORKSPACE, prompt, "instructions", "agents")
const added = await read(at("AGENTS.md"))
check("the person's own text is still there", added.includes("Nobody writes to main."), added)
check("and still on its own line endings", added.includes("\r\n"), JSON.stringify(added.slice(0, 60)))
check("no stray LF was introduced", !/[^\r]\n/.test(added.replace(/\r\n/g, "")), JSON.stringify(added))
check("the section is fenced with this hub's markers", added.includes("<!-- context-hub:code-review -->"), added)
check("and the closing one", added.includes("<!-- /context-hub:code-review -->"), added)
check("under a heading with the prompt's name", added.includes("## Code Review"), added)
check(
  "and the delivery is reported as done",
  (await delivered(files, WORKSPACE, prompt, "instructions", "agents")) === true
)

/* The whole point of the marker: clicking twice leaves one section. */
await deliver(files, WORKSPACE, prompt, "instructions", "agents")
const twice = await read(at("AGENTS.md"))
check(
  "delivering twice leaves one section",
  twice.split("<!-- context-hub:code-review -->").length === 2,
  twice
)
check("and the person's text is still there once", twice.split("Nobody writes to main.").length === 2, twice)

/* The same prompt in the other document, without touching the first. */
await deliver(files, WORKSPACE, prompt, "instructions", "design")
const design = await read(at("DESIGN.md"))
check("the second document gets its own section", design.includes("<!-- context-hub:code-review -->"), design)
check(
  "and the first document is not disturbed",
  (await read(at("AGENTS.md"))) === twice,
  "AGENTS.md changed when DESIGN.md was written"
)
check(
  "each document answers for itself",
  (await delivered(files, WORKSPACE, prompt, "instructions", "agents")) === true &&
    (await delivered(files, WORKSPACE, prompt, "instructions", "design")) === true
)

/* A prompt that was never added to a document is not reported as delivered. */
const other: Prompt = { ...prompt, name: "Something Else", prompt: "Else." }
check(
  "a prompt that was never delivered is not reported as delivered",
  (await delivered(files, WORKSPACE, other, "instructions", "agents")) === false
)

/* --- taking things back --------------------------------------------------- */

let refused: unknown = null
const beforeUndeliver = await read(at("AGENTS.md"))
await undeliver(files, WORKSPACE, prompt, "instructions", "agents").catch((failure: unknown) => {
  refused = failure
})
check("a document's section cannot be taken back from here", refused instanceof Error, refused)
check(
  "and the refusal changed nothing",
  (await read(at("AGENTS.md"))) === beforeUndeliver
)

check("a rule can be taken back", (await undeliver(files, WORKSPACE, prompt, "rule")) === true)
check("and its file is gone", !(await exists(at(".agents", "rules", "code-review.md"))))
check("taking back what is not there reports nothing done", (await undeliver(files, WORKSPACE, prompt, "rule")) === false)

/* --- a path a place cannot name ------------------------------------------- */

/* Nothing but the two scopes and a relative path gets through, which is what
   keeps a document name from reaching anywhere but the workspace root. */
const climbing: PromptPlace = {
  ...WORKSPACE,
  documents: [{ id: "bad", labelKey: "x", file: "../outside.md" }],
}
let climbed: unknown = null
await deliver(files, climbing, prompt, "instructions", "bad").catch((failure: unknown) => {
  climbed = failure
})
check("a document that climbs out of its scope is refused", climbed instanceof Error, climbed)
check("and nothing was written beside the workspace", !(await exists(path.join(project, "..", "outside.md"))))

/* --- the machine-wide root ------------------------------------------------ */

await deliver(files, GLOBAL, prompt, "rule")
check(
  "a global place writes under the machine-wide root, not the workspace",
  (await exists(path.join(machine, ".agents", "rules", "code-review.md"))) &&
    !(await exists(at(".agents", "rules", "code-review.md"))),
  await fs.readdir(path.join(machine, ".agents", "rules")).catch(() => null)
)
check(
  "and reads its own documents there",
  targetOf(GLOBAL, prompt, "instructions", "agents").scope === "global"
)
await deliver(files, GLOBAL, prompt, "instructions", "design")
check(
  "writing a document of the machine-wide scope",
  await exists(path.join(machine, "DESIGN.md")),
  await fs.readdir(machine)
)

await fs.rm(home, { recursive: true, force: true })
await fs.rm(project, { recursive: true, force: true })
await fs.rm(machine, { recursive: true, force: true })

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`)
process.exitCode = failures === 0 ? 0 : 1
