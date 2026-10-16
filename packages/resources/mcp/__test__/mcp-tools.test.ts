/**
 * Behaviour of the MCP toolkit the kernel hands to agent extensions: the two
 * format editors, the declaration both sides agree on, and the failure shape
 * their errors travel in.
 *
 * The point of these editors is what they leave alone, so most of what follows
 * is a client file with comments, other tables and other keys that must come out
 * of an edit byte-identical.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { parse } from "smol-toml"
import { describe, expect, it } from "vitest"

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
import type { McpRemoteDeclaration, McpStdioDeclaration } from "../src/contract.ts"

describe("declaration", () => {
  /* Written with the declaration's own type rather than `as const`: a readonly
     `args` is not the `string[]` a declaration promises. */
  const stdio: McpStdioDeclaration = {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@x/y"],
    env: { TOKEN: "a b" },
  }
  const remote: McpRemoteDeclaration = {
    transport: "http",
    url: "https://x/mcp",
    headers: { Authorization: "Bearer k" },
  }

  it("names the server from a command line or a URL", () => {
    expect(declarationLine(stdio), "a command line names the server").toBe("npx -y @x/y")
    expect(declarationLine(remote), "a URL names it too").toBe("https://x/mcp")
  })

  it("writes an entry in the shape a client file holds, dropping the keys it has none of", () => {
    expect(writeDeclaration(stdio), "a written stdio entry holds the command first").toEqual({
      command: "npx",
      args: ["-y", "@x/y"],
      env: { TOKEN: "a b" },
    })
    expect(
      writeDeclaration({ ...stdio, args: [] }),
      "an entry with no arguments drops the key"
    ).toEqual({ command: "npx", env: { TOKEN: "a b" } })
    expect(writeDeclaration({ ...stdio, env: {} }), "an entry with no pairs drops the key").toEqual({
      command: "npx",
      args: ["-y", "@x/y"],
    })
    expect(writeDeclaration(remote), "a written remote entry carries its headers").toEqual({
      url: "https://x/mcp",
      headers: { Authorization: "Bearer k" },
    })
  })

  it("reads back what it wrote", () => {
    expect(readDeclaration(writeDeclaration(stdio)), "what was written reads back the same").toEqual(
      stdio
    )
    expect(readDeclaration(writeDeclaration(remote)), "a remote entry reads back the same").toEqual(
      remote
    )
  })

  it("reads nothing from an entry that names no server", () => {
    expect(readDeclaration({ env: {} }), "an entry with neither key reads as nothing").toBeNull()
    expect(readDeclaration("npx x"), "a string is not an entry").toBeNull()
    expect(readDeclaration({}), "an empty entry reads as nothing").toBeNull()
  })

  it("takes a hand-written type as the transport, and http otherwise", () => {
    expect(
      readDeclaration({ url: "https://x", type: "sse" })?.transport,
      "a hand-written `type: sse` entry is remote"
    ).toBe("sse")
    expect(readDeclaration({ url: "https://x" })?.transport, "a plain entry is http").toBe("http")
  })

  it("splits a written command line, quotes and all", () => {
    expect(splitArguments("-y --root /tmp"), "arguments split on spaces").toEqual([
      "-y",
      "--root",
      "/tmp",
    ])
    expect(splitArguments('-y --name "a b"'), "quotes group a run with spaces").toEqual([
      "-y",
      "--name",
      "a b",
    ])
    expect(splitArguments("--name 'a b'"), "single quotes group too").toEqual(["--name", "a b"])
    expect(splitArguments("   "), "an empty line holds no arguments").toHaveLength(0)
  })
})

describe("jsonc", () => {
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

  it("writes the entry where it was asked for, keeping the file's own text", () => {
    expect(withServer, "a write keeps the comment above it").toContain(
      "// what this project uses"
    )
    expect(withServer, "a write keeps the keys beside it").toContain('"theme": "dark"')
    expect(withServer, "a write keeps the trailing comma of the file").toContain('},\n  "theme"')
    expect(
      valueAt(parseJsonc(withServer), ["projects", "D:/ws", "mcpServers", "ctx", "url"]),
      "the written entry is where it was asked for"
    ).toBe("https://x/mcp")
    expect(
      valueAt(parseJsonc(withServer), ["projects", "D:/ws", "other"]),
      "the sibling of that entry is untouched"
    ).toBe(true)
  })

  it("removes an entry leaving the comment, no trace of the name, and a readable file", () => {
    const withoutServer = editJson(withServer, ["projects", "D:/ws", "mcpServers", "ctx"], undefined)
    expect(withoutServer, "removing it leaves the comment").toContain("// what this project uses")
    expect(withoutServer, "removing it leaves no trace of the name").not.toContain("ctx")
    expect(readJsonObject(withoutServer), "removing it leaves the file readable").not.toBeNull()
  })

  it("reads an absent path as undefined and an entry's lines as its span", () => {
    expect(
      valueAt(parseJsonc(CLAUDE), ["projects", "nope"]),
      "an absent path reads as undefined"
    ).toBeUndefined()
    expect(jsonValueLines(CLAUDE, ["projects"]), "an entry's lines span its text").toEqual([3, 5])
    expect(jsonValueLines(CLAUDE, ["missing"]), "no path means no lines").toBeNull()
  })

  it("holds no object for an empty file, and refuses one it cannot read", () => {
    expect(readJsonObject(null), "an empty file holds no object").toBeNull()
    expect(readJsonObject("  "), "and neither does whitespace").toBeNull()
    expect(() => parseJsonc("{ bad"), "a broken file refuses").toThrow(/InvalidSymbol/)
    expect(() => editJson("{ bad", ["a"], 1), "a write to a broken file refuses").toThrow()
    expect(() => readJsonObject("[1]"), "a file holding a list is not an object").toThrow()
  })

  it("makes an absent file an object holding what was written", () => {
    const EMPTY = editJson(null, ["mcpServers", "ctx"], { command: "npx" })
    expect(parseJsonc(EMPTY), "an absent file becomes an object").toEqual({
      mcpServers: { ctx: { command: "npx" } },
    })
  })
})

/** A TOML document parsed the way a client's own reader would see it. */
function parseLiteral(text: string): Record<string, unknown> {
  return parse(text) as Record<string, unknown>
}

describe("toml", () => {
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
  const replaced = setTomlEntry(installed, "mcp_servers", "node_repl", {
    command: "node",
    args: ["new.js"],
  })
  const cleared = clearTomlEntry(replaced, "mcp_servers", "ctx")
  const off = setTomlField(replaced, "mcp_servers", "ctx", "enabled", false)
  const on = setTomlField(off, "mcp_servers", "ctx", "enabled", true)

  it("keeps the header comment, the unrelated table and the file's own quoting", () => {
    expect(installed, "the header comment survives").toMatch(/^# Codex config/)
    expect(installed, "the unrelated table survives").toContain('[other]\nkeep = "me"')
    expect(installed, "the file's own quoting survives").toContain("command = 'node'")
  })

  it("writes the new entry and its nested table under the same table", () => {
    expect(installed, "the new entry sits under the same table").toContain("[mcp_servers.ctx]")
    expect(installed, "its nested table is written too").toContain(
      '[mcp_servers.ctx.env]\nTOKEN = "abc"'
    )
    expect(
      valueAt(parseLiteral(installed), ["mcp_servers", "ctx", "args"]),
      "the entry's arguments survive a round trip"
    ).toEqual(["-y", "@x/y"])
    expect(
      valueAt(parseLiteral(installed), ["mcp_servers", "node_repl", "command"]),
      "the sibling entry is untouched"
    ).toBe("node")
  })

  it("replaces an entry, dropping what it no longer holds", () => {
    expect(
      valueAt(parseLiteral(replaced), ["mcp_servers", "ctx", "command"]),
      "replacing keeps the other entry"
    ).toBe("npx")
    expect(
      valueAt(parseLiteral(replaced), ["mcp_servers", "node_repl", "env"]),
      "replacing drops what the entry no longer holds"
    ).toBeUndefined()
    expect(
      valueAt(parseLiteral(replaced), ["other", "keep"]),
      "the unrelated table is still there"
    ).toBe("me")
  })

  it("clears an entry, leaving its sibling and the rest of the file", () => {
    expect(
      valueAt(parseLiteral(cleared), ["mcp_servers", "ctx"]),
      "clearing takes the entry out"
    ).toBeUndefined()
    expect(
      valueAt(parseLiteral(cleared), ["mcp_servers", "node_repl", "command"]),
      "clearing leaves its sibling"
    ).toBe("node")
    expect(cleared, "clearing leaves the rest of the file").toContain('[other]\nkeep = "me"')
  })

  it("writes a field into an entry and flips it back, keeping one field and the rest", () => {
    expect(
      valueAt(parseLiteral(off), ["mcp_servers", "ctx", "enabled"]),
      "a field is written into the entry"
    ).toBe(false)
    expect(
      valueAt(parseLiteral(off), ["mcp_servers", "ctx", "command"]),
      "writing a field keeps the entry's command"
    ).toBe("npx")
    expect(
      valueAt(parseLiteral(off), ["mcp_servers", "ctx", "env", "TOKEN"]),
      "writing a field keeps its nested table"
    ).toBe("abc")
    expect(
      valueAt(parseLiteral(on), ["mcp_servers", "ctx", "enabled"]),
      "flipping it back replaces the field"
    ).toBe(true)
    expect(off.match(/enabled/g) ?? [], "flipping it back leaves one field").toHaveLength(1)
    expect(on.match(/enabled/g) ?? [], "and not a second one").toHaveLength(1)
  })

  it("refuses a field on an entry that is not there, and an edit that would break the file", () => {
    expect(
      () => setTomlField(replaced, "mcp_servers", "nope", "enabled", false),
      "a field on an entry that is not there refuses"
    ).toThrow()
    expect(
      () => setTomlField("model = \n", "mcp_servers", "ctx", "enabled", false),
      "an edit that would break the file refuses"
    ).toThrow()
  })

  it("knows an entry's lines, and gives none for an entry that is not there", () => {
    expect(tomlEntryLines(installed, "mcp_servers", "ctx"), "an entry's lines are known").not.toBeNull()
    expect(
      tomlEntryLines(installed, "mcp_servers", "nope"),
      "an entry that is not there has no lines"
    ).toBeNull()
  })

  it("adds the table to a file that is not there", () => {
    expect(
      valueAt(parseLiteral(setTomlEntry("", "mcp_servers", "ctx", { command: "npx" })), [
        "mcp_servers",
        "ctx",
        "command",
      ]),
      "an edit into a file that is not there adds the table"
    ).toBe("npx")
  })

  it("keeps a dashed key bare and quotes one with a space", () => {
    expect(isBareKey("node-repl"), "a key with a dash stays bare").toBe(true)
    expect(writeTomlKey("node-repl"), "and is written bare").toBe("node-repl")
    expect(writeTomlKey("a b"), "a key with a space is quoted").toBe('"a b"')
  })
})

describe("leaving the rest alone", () => {
  const FORMATTED = `{
  "mcpServers": {
    "shared": { "command": "npx", "args": ["-y", "@x/shared"] }
  },
  "theme": "dark"
}
`
  const written = editJson(FORMATTED, ["mcpServers", "ctx"], {
    command: "npx",
    args: ["-y", "@x/ctx"],
  })

  const INLINE = '{"mcpServers": {"shared": {"command": "npx"}}}\n'
  const inline = editJson(INLINE, ["mcpServers", "ctx"], { command: "npx", args: ["-y", "@x/ctx"] })

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
  const only = editJson(
    `{\n  "mcpServers": {\n    "one": {\n      "command": "a"\n    }\n  }\n}\n`,
    ["mcpServers", "one"],
    undefined
  )
  const refilled = editJson(only, ["mcpServers", "three"], { command: "c" })
  const grown = editJson(PRETTY, ["mcpServers", "three"], { command: "c" })
  const rewritten = editJson(PRETTY, ["mcpServers", "two"], { command: "b2" })

  it("gives a value added to a block object its own lines", () => {
    expect(written, "a value added to a block object gets its own lines").toContain(
      '\n    "ctx": {\n      "command": "npx"'
    )
    expect(written, "the entry that was there keeps its own line").toContain(
      '"shared": { "command": "npx", "args": ["-y", "@x/shared"] }'
    )
    expect(written, "the settings beside it stay").toMatch(/ {2}"theme": "dark"\n\}\n$/)
    expect(
      editJson(written, ["mcpServers", "ctx"], undefined),
      "taking it back out leaves the file byte for byte"
    ).toBe(FORMATTED)
  })

  it("keeps a value added to a one-line object on one line", () => {
    expect(inline.split("\n"), "a value added to a one-line object stays on one line").toHaveLength(
      2
    )
    expect(valueAt(parseJsonc(inline), ["mcpServers", "ctx", "args", "0"]), "and parses").toBe("-y")
    expect(
      editJson(inline, ["mcpServers", "ctx"], undefined),
      "taking it back out leaves that file byte for byte"
    ).toBe(INLINE)
  })

  it("takes the first property out without its comma or its indented line", () => {
    expect(trimmed, "the first property leaves without its comma").not.toContain('"one"')
    expect(trimmed, "leaving the one below it").toContain('"two"')
    expect(trimmed, "and without leaving its indented line behind").toBe(
      `{\n  "mcpServers": {\n    "two": {\n      "command": "b"\n    }\n  }\n}\n`
    )
    expect(
      valueAt(parseJsonc(trimmed), ["mcpServers", "two", "command"]),
      "and the rest parses"
    ).toBe("b")
  })

  it("leaves the last property's object clean", () => {
    expect(only, "the last property of an object leaves the object clean").toBe(
      `{\n  "mcpServers": {\n  }\n}\n`
    )
  })

  it("indents a refilled empty object from the line, not from the brace's column", () => {
    expect(
      refilled,
      "filling that empty object back in indents from the line, not from the brace's column"
    ).toBe(`{\n  "mcpServers": {\n    "three": {\n      "command": "c"\n    }\n  }\n}\n`)
    expect(
      editJson(refilled, ["mcpServers", "three"], undefined),
      "taking it back out returns the empty box"
    ).toBe(only)
  })

  it("adds a value to a block object inside the object it was added to", () => {
    expect(grown, "a value added to a block object gets its own lines").toContain(
      '\n    "three": {\n      "command": "c"\n    }\n'
    )
    expect(
      valueAt(parseJsonc(grown), ["mcpServers", "three", "command"]),
      "it sits inside the object it was added to"
    ).toBe("c")
    expect(
      grown.slice(grown.indexOf('"three"')).length,
      "and the entries above it keep their layout"
    ).toBeLessThan(grown.length)
    expect(grown.indexOf('"two": {'), "with the entry above still there").toBeGreaterThan(0)
  })

  it("keeps the key and the siblings of a replaced value", () => {
    expect(rewritten, "replacing one value keeps its key").toContain(
      '"two": {\n      "command": "b2"\n    }'
    )
    expect(rewritten, "and its siblings").toContain('"one": {\n      "command": "a"\n    }')
  })

  it("creates a level the file does not have yet", () => {
    expect(
      valueAt(parseJsonc(editJson(PRETTY, ["projects", "x", "y"], 1)), ["projects", "x", "y"]),
      "a level the file does not have yet is created"
    ).toBe(1)
  })

  it("changes nothing when the path is not there", () => {
    expect(
      editJson(PRETTY, ["mcpServers", "nope"], undefined),
      "removing a path that is not there changes nothing"
    ).toBe(PRETTY)
  })
})

describe("failure", () => {
  it("carries the key and the placeholders of a named failure", () => {
    expect(
      mcpFailure(new McpError("x.error", { file: "a" }), "fallback").key,
      "a named failure carries its key"
    ).toBe("x.error")
    expect(
      mcpFailure(new McpError("x.error", { file: "a" }), "fallback").params?.file,
      "it carries its placeholders"
    ).toBe("a")
  })

  it("falls back for an unnamed failure, keeping what was thrown", () => {
    expect(mcpFailure(new Error("boom"), "fallback").key, "an unnamed failure falls back").toBe(
      "fallback"
    )
    expect(
      mcpFailure(new Error("boom"), "fallback").detail,
      "the fallback keeps what was thrown"
    ).toBe("boom")
    expect(mcpFailure("boom", "fallback").detail, "a thrown string still lands somewhere").toBe(
      "boom"
    )
  })
})

describe("surface", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url))
  const MODULE_DIR = path.resolve(HERE, "../src")
  /* `src/host` is the half that runs in the process owning the disk, so only the
     files beside it are the surface a browser reads. */
  const files = readdirSync(MODULE_DIR).filter((file) =>
    statSync(path.join(MODULE_DIR, file)).isFile()
  )

  it("has no Node built-in in it", () => {
    const imported = files.filter((file) =>
      readFileSync(path.join(MODULE_DIR, file), "utf8").includes('from "node:')
    )
    expect(imported, "the module has no Node built-in in it").toEqual([])
  })
})
