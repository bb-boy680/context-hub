/**
 * Behaviour check for the MCP toolkit the kernel hands to agent extensions: the
 * two format editors, the declaration both sides agree on, and the failure
 * shape their errors travel in.
 *
 * The point of these editors is what they leave alone, so most of what follows
 * is a client file with comments, other tables and other keys that must come out
 * of an edit byte-identical.
 *
 * Run from the package: `node scripts/check-mcp-tools.ts`
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { parse } from "smol-toml"

import {
  McpError,
  clearTomlEntry,
  declarationLine,
  editJson,
  isBareKey,
  jsonValueLines,
  mcpFailure,
  parseJsonc,
  readDeclaration,
  readJsonObject,
  setTomlEntry,
  setTomlField,
  splitArguments,
  tomlEntryLines,
  valueAt,
  writeDeclaration,
  writeTomlKey,
} from "../src/contract.ts"

let failures = 0
let checked = 0

function check(what: string, ok: boolean, detail?: unknown) {
  checked += 1
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

/** The message one call refused with, or null when it did not refuse. */
function refusalOf(call: () => unknown): string | null {
  try {
    call()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return null
}

console.log("declaration")

const stdio = { transport: "stdio", command: "npx", args: ["-y", "@x/y"], env: { TOKEN: "a b" } } as const
const remote = { transport: "http", url: "https://x/mcp", headers: { Authorization: "Bearer k" } } as const

check("a command line names the server", declarationLine(stdio) === "npx -y @x/y")
check("a URL names it too", declarationLine(remote) === "https://x/mcp")
check("a written stdio entry holds the command first", JSON.stringify(writeDeclaration(stdio)) === '{"command":"npx","args":["-y","@x/y"],"env":{"TOKEN":"a b"}}', writeDeclaration(stdio))
check("an entry with no arguments drops the key", !("args" in writeDeclaration({ ...stdio, args: [] })))
check("an entry with no pairs drops the key", !("env" in writeDeclaration({ ...stdio, env: {} })))
check("a written remote entry carries its headers", JSON.stringify(writeDeclaration(remote)) === '{"url":"https://x/mcp","headers":{"Authorization":"Bearer k"}}')
check("what was written reads back the same", JSON.stringify(readDeclaration(writeDeclaration(stdio))) === JSON.stringify(stdio), readDeclaration(writeDeclaration(stdio)))
check("a remote entry reads back the same", JSON.stringify(readDeclaration(writeDeclaration(remote))) === JSON.stringify(remote))
check("an entry with neither key reads as nothing", readDeclaration({ env: {} }) === null)
check("a string is not an entry", readDeclaration("npx x") === null)
check("an empty entry reads as nothing", readDeclaration({}) === null)
check("a hand-written `type: sse` entry is remote", readDeclaration({ url: "https://x", type: "sse" })?.transport === "sse")
check("a plain entry is http", readDeclaration({ url: "https://x" })?.transport === "http")
check("arguments split on spaces", JSON.stringify(splitArguments("-y --root /tmp")) === '["-y","--root","/tmp"]')
check("quotes group a run with spaces", JSON.stringify(splitArguments('-y --name "a b"')) === '["-y","--name","a b"]')
check("single quotes group too", JSON.stringify(splitArguments("--name 'a b'")) === '["--name","a b"]')
check("an empty line holds no arguments", splitArguments("   ").length === 0)

console.log("jsonc")

const CLAUDE = `{
  // what this project uses
  "projects": {
    "D:/ws": { "mcpServers": {}, "other": true },
  },
  "theme": "dark",
}`
const withServer = editJson(CLAUDE, ["projects", "D:/ws", "mcpServers", "ctx"], {
  url: "https://x/mcp",
})

check("a write keeps the comment above it", withServer.includes("// what this project uses"))
check("a write keeps the keys beside it", withServer.includes('"theme": "dark"'))
check("a write keeps the trailing comma of the file", withServer.includes("},\n  \"theme\""))
check("the written entry is where it was asked for", valueAt(parseJsonc(withServer), ["projects", "D:/ws", "mcpServers", "ctx", "url"]) === "https://x/mcp")
check("the sibling of that entry is untouched", valueAt(parseJsonc(withServer), ["projects", "D:/ws", "other"]) === true)

const withoutServer = editJson(withServer, ["projects", "D:/ws", "mcpServers", "ctx"], undefined)
check("removing it leaves the comment", withoutServer.includes("// what this project uses"))
check("removing it leaves no trace of the name", !withoutServer.includes("ctx"))
check("removing it leaves the file readable", readJsonObject(withoutServer) !== null)

check("an absent path reads as undefined", valueAt(parseJsonc(CLAUDE), ["projects", "nope"]) === undefined)
check("an entry's lines span its text", JSON.stringify(jsonValueLines(CLAUDE, ["projects"])) === "[3,5]", jsonValueLines(CLAUDE, ["projects"]))
check("no path means no lines", jsonValueLines(CLAUDE, ["missing"]) === null)
check("an empty file holds no object", readJsonObject(null) === null && readJsonObject("  ") === null)
check("a broken file refuses", (refusalOf(() => parseJsonc("{ bad")) ?? "").includes("InvalidSymbol"), refusalOf(() => parseJsonc("{ bad")))
check("a write to a broken file refuses", refusalOf(() => editJson("{ bad", ["a"], 1)) !== null)
check("a file holding a list is not an object", refusalOf(() => readJsonObject("[1]")) !== null)

const EMPTY = editJson(null, ["mcpServers", "ctx"], { command: "npx" })
check("an absent file becomes an object", JSON.stringify(parseJsonc(EMPTY)) === '{"mcpServers":{"ctx":{"command":"npx"}}}', EMPTY)

console.log("toml")

const CODEX = `# Codex config
model = "gpt-5"

[mcp_servers.node_repl]
command = 'node'
args = ["repl.js"]

[other]
keep = "me"
`
const installed = setTomlEntry(CODEX, "mcp_servers", "ctx", {
  command: "npx",
  args: ["-y", "@x/y"],
  env: { TOKEN: "abc" },
})

check("the header comment survives", installed.startsWith("# Codex config"))
check("the unrelated table survives", installed.includes('[other]\nkeep = "me"'))
check("the file's own quoting survives", installed.includes("command = 'node'"))
check("the new entry sits under the same table", installed.includes("[mcp_servers.ctx]"))
check("its nested table is written too", installed.includes("[mcp_servers.ctx.env]\nTOKEN = \"abc\""))
check("the entry's arguments survive a round trip", JSON.stringify(valueAt(parseLiteral(installed), ["mcp_servers", "ctx", "args"])) === '["-y","@x/y"]')
check("the sibling entry is untouched", valueAt(parseLiteral(installed), ["mcp_servers", "node_repl", "command"]) === "node")

const replaced = setTomlEntry(installed, "mcp_servers", "node_repl", { command: "node", args: ["new.js"] })
check("replacing keeps the other entry", valueAt(parseLiteral(replaced), ["mcp_servers", "ctx", "command"]) === "npx")
check("replacing drops what the entry no longer holds", valueAt(parseLiteral(replaced), ["mcp_servers", "node_repl", "env"]) === undefined)
check("the unrelated table is still there", valueAt(parseLiteral(replaced), ["other", "keep"]) === "me")

const cleared = clearTomlEntry(replaced, "mcp_servers", "ctx")
check("clearing takes the entry out", valueAt(parseLiteral(cleared), ["mcp_servers", "ctx"]) === undefined)
check("clearing leaves its sibling", valueAt(parseLiteral(cleared), ["mcp_servers", "node_repl", "command"]) === "node")
check("clearing leaves the rest of the file", cleared.includes('[other]\nkeep = "me"'))

const off = setTomlField(replaced, "mcp_servers", "ctx", "enabled", false)
check("a field is written into the entry", valueAt(parseLiteral(off), ["mcp_servers", "ctx", "enabled"]) === false)
check("writing a field keeps the entry's command", valueAt(parseLiteral(off), ["mcp_servers", "ctx", "command"]) === "npx")
check("writing a field keeps its nested table", valueAt(parseLiteral(off), ["mcp_servers", "ctx", "env", "TOKEN"]) === "abc")
const on = setTomlField(off, "mcp_servers", "ctx", "enabled", true)
check("flipping it back replaces the field", valueAt(parseLiteral(on), ["mcp_servers", "ctx", "enabled"]) === true)
check("flipping it back leaves one field", (off.match(/enabled/g) ?? []).length === 1 && (on.match(/enabled/g) ?? []).length === 1)
check("a field on an entry that is not there refuses", refusalOf(() => setTomlField(replaced, "mcp_servers", "nope", "enabled", false)) !== null)
check("an entry's lines are known", tomlEntryLines(installed, "mcp_servers", "ctx") !== null)
check("an entry that is not there has no lines", tomlEntryLines(installed, "mcp_servers", "nope") === null)
check("an edit into a file that is not there adds the table", valueAt(parseLiteral(setTomlEntry("", "mcp_servers", "ctx", { command: "npx" })), ["mcp_servers", "ctx", "command"]) === "npx")
check("an edit that would break the file refuses", refusalOf(() => setTomlField("model = \n", "mcp_servers", "ctx", "enabled", false)) !== null)
check("a key with a dash stays bare", isBareKey("node-repl") && writeTomlKey("node-repl") === "node-repl")
check("a key with a space is quoted", writeTomlKey("a b") === '"a b"')

console.log("leaving the rest alone")

const FORMATTED = `{
  "mcpServers": {
    "shared": { "command": "npx", "args": ["-y", "@x/shared"] }
  },
  "theme": "dark"
}
`
const written = editJson(FORMATTED, ["mcpServers", "ctx"], { command: "npx", args: ["-y", "@x/ctx"] })
check("a value added to a block object gets its own lines", written.includes('\n    "ctx": {\n      "command": "npx"'), written)
check("the entry that was there keeps its own line", written.includes('"shared": { "command": "npx", "args": ["-y", "@x/shared"] }'))
check("the settings beside it stay", written.endsWith('  "theme": "dark"\n}\n'))
check("taking it back out leaves the file byte for byte", editJson(written, ["mcpServers", "ctx"], undefined) === FORMATTED)

const INLINE = '{"mcpServers": {"shared": {"command": "npx"}}}\n'
const inline = editJson(INLINE, ["mcpServers", "ctx"], { command: "npx", args: ["-y", "@x/ctx"] })
check("a value added to a one-line object stays on one line", inline.split("\n").length === 2, inline)
check("and parses", valueAt(parseJsonc(inline), ["mcpServers", "ctx", "args", "0"]) === "-y")
check("taking it back out leaves that file byte for byte", editJson(inline, ["mcpServers", "ctx"], undefined) === INLINE)

const PRETTY = `{
  "mcpServers": {
    "one": {
      "command": "a"
    },
    "two": {
      "command": "b"
    }
  }
}
`
const trimmed = editJson(PRETTY, ["mcpServers", "one"], undefined)
check("the first property leaves without its comma", !trimmed.includes('"one"') && trimmed.includes('"two"'), trimmed)
check(
  "and without leaving its indented line behind",
  trimmed === `{\n  "mcpServers": {\n    "two": {\n      "command": "b"\n    }\n  }\n}\n`,
  JSON.stringify(trimmed)
)
check("and the rest parses", valueAt(parseJsonc(trimmed), ["mcpServers", "two", "command"]) === "b")

const only = editJson(`{\n  "mcpServers": {\n    "one": {\n      "command": "a"\n    }\n  }\n}\n`, ["mcpServers", "one"], undefined)
check(
  "the last property of an object leaves the object clean",
  only === `{\n  "mcpServers": {\n  }\n}\n`,
  JSON.stringify(only)
)

const refilled = editJson(only, ["mcpServers", "three"], { command: "c" })
check(
  "filling that empty object back in indents from the line, not from the brace's column",
  refilled === `{\n  "mcpServers": {\n    "three": {\n      "command": "c"\n    }\n  }\n}\n`,
  JSON.stringify(refilled)
)
check(
  "taking it back out returns the empty box",
  editJson(refilled, ["mcpServers", "three"], undefined) === only
)

const grown = editJson(PRETTY, ["mcpServers", "three"], { command: "c" })
check("a value added to a block object gets its own lines", grown.includes('\n    "three": {\n      "command": "c"\n    }\n'), grown)
check("it sits inside the object it was added to", valueAt(parseJsonc(grown), ["mcpServers", "three", "command"]) === "c")
check("and the entries above it keep their layout", grown.slice(grown.indexOf('"three"')).length < grown.length && grown.indexOf('"two": {') > 0)

const rewritten = editJson(PRETTY, ["mcpServers", "two"], { command: "b2" })
check("replacing one value keeps its key", rewritten.includes('"two": {\n      "command": "b2"\n    }'), rewritten)
check("and its siblings", rewritten.includes('"one": {\n      "command": "a"\n    }'))

check("a level the file does not have yet is created", valueAt(parseJsonc(editJson(PRETTY, ["projects", "x", "y"], 1)), ["projects", "x", "y"]) === 1)
check("removing a path that is not there changes nothing", editJson(PRETTY, ["mcpServers", "nope"], undefined) === PRETTY)

console.log("failure")

check("a named failure carries its key", mcpFailure(new McpError("x.error", { file: "a" }), "fallback").key === "x.error")
check("it carries its placeholders", mcpFailure(new McpError("x.error", { file: "a" }), "fallback").params?.file === "a")
check("an unnamed failure falls back", mcpFailure(new Error("boom"), "fallback").key === "fallback")
check("the fallback keeps what was thrown", mcpFailure(new Error("boom"), "fallback").detail === "boom")
check("a thrown string still lands somewhere", mcpFailure("boom", "fallback").detail === "boom")

console.log("surface")

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MODULE_DIR = path.resolve(HERE, "../src")
/* `src/host` is the half that runs in the process owning the disk, so only the
   files beside it are the surface a browser reads. */
const files = readdirSync(MODULE_DIR).filter((file) =>
  statSync(path.join(MODULE_DIR, file)).isFile()
)
check(
  "the module has no Node built-in in it",
  files.every((file) => !readFileSync(path.join(MODULE_DIR, file), "utf8").includes('from "node:'))
)

console.log(`\n${checked - failures}/${checked} checks passed`)
if (failures > 0) process.exitCode = 1

/** A TOML document parsed the way a client's own reader would see it. */
function parseLiteral(text: string): Record<string, unknown> {
  return parse(text) as Record<string, unknown>
}
