/**
 * What a pack carries inside it: the skills it ships, the commands it ships, and
 * the MCP servers it declares.
 *
 * Nothing about this is recorded and nothing of it is derivable from the pack's
 * manifest, so the pack's own directory is asked — and only the three names a
 * pack follows are asked about: one directory per skill under `skills/`, one
 * markdown file per command under `commands/`, and a single `.mcp.json` at the
 * root. A pack carrying none of them answers with empty lists, which is what
 * tells a screen that the tab is not one to offer.
 *
 * The three are read the way the agents read them: a skill is only a skill if it
 * carries its `SKILL.md`, and a file's own frontmatter is what names it and
 * describes it. A file that says nothing about itself still appears — under the
 * name its directory or file gives — because the pack does carry it.
 *
 * This module runs in the process that owns the disk.
 */
import { promises as fs, type Dirent } from "node:fs"
import path from "node:path"

import type { PackContentItem, PackContents } from "../contract.ts"

/** The directory a pack keeps its skills in, one directory per skill. */
const SKILLS_DIR = "skills"

/** The directory a pack keeps its commands in, one markdown file per command. */
const COMMANDS_DIR = "commands"

/** The file a pack declares its MCP servers in. */
const MCP_FILE = ".mcp.json"

/** The file that makes a directory a skill, which is the only name an agent reads. */
const SKILL_FILE = "SKILL.md"

/** What one file's frontmatter says about itself, of the two fields a list shows. */
interface OwnWords {
  name?: string
  description?: string
}

/**
 * Read the two fields a skill or command names itself with.
 *
 * Only the block between the opening `---` and the next one is read, and only
 * these two keys: everything else in a file belongs to whoever wrote it, and a
 * key this does not know is not one it can show. A block that never closes is
 * not a block, so the file reads as one that says nothing rather than as one
 * whose first lines were mistaken for fields.
 *
 * A description is often written as a block scalar \u2014 `description: >` with the
 * sentence on the lines under it \u2014 which is how a long one is wrapped, so those
 * lines are read as the value rather than the indicator being read as it.
 */
function ownWords(text: string): OwnWords {
  /* Editors on Windows save a BOM, which must not hide the opening delimiter. */
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  if (!normalized.startsWith("---\n")) return {}
  const end = normalized.indexOf("\n---", "---\n".length)
  if (end < 0) return {}

  const lines = normalized.slice("---\n".length, end).split("\n")
  const words: OwnWords = {}
  for (let at = 0; at < lines.length; at += 1) {
    const match = /^(name|description)\s*:\s*(.*)$/.exec(lines[at] ?? "")
    if (match === null) continue
    let value = match[2].trim()
    if (value === "" || /^[>|][+-]?$/.test(value)) {
      /* The value on the lines under the key: a block scalar, or a plain one
         wrapped by hand. It runs until a line stops being indented past the key.
         Shown as one line, so the breaks become spaces \u2014 folded and literal
         differ only in where those breaks land, which a line of a list has no
         room for. */
      const block: string[] = []
      while (at + 1 < lines.length && /^\s|^$/.test(lines[at + 1] ?? "")) {
        at += 1
        const line = (lines[at] ?? "").trim()
        if (line !== "") block.push(line)
      }
      value = block.join(" ")
    }
    /* One layer of quotes goes, the way a person writing YAML would wrap either
       field to keep a colon of their own from ending it. */
    value = value.trim().replace(/^["']|["']$/g, "")
    if (value === "") continue
    if (match[1] === "name") words.name = value
    else words.description = value
  }
  return words
}

/** One file read as text, or null when it is not there or is not readable. */
function readText(file: string): Promise<string | null> {
  return fs.readFile(file, "utf8").catch(() => null)
}

/**
 * One directory read as a list of entries, or empty when it is not there.
 *
 * A pack need not carry the directory at all, which is the ordinary case rather
 * than a failure: what a caller reads from it is an empty list either way.
 */
function readDir(dir: string): Promise<Dirent[]> {
  return fs.readdir(dir, { withFileTypes: true }).catch(() => [])
}

/**
 * What one pack ships as skills: every directory under `skills/` that carries
 * its `SKILL.md`.
 *
 * A directory without one is not a skill — an agent would not read it as one —
 * so it is passed over rather than listed under a name nothing answers to.
 */
async function scanSkills(dir: string): Promise<PackContentItem[]> {
  const entries = await readDir(path.join(dir, SKILLS_DIR))
  const found: PackContentItem[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const text = await readText(path.join(dir, SKILLS_DIR, entry.name, SKILL_FILE))
    if (text === null) continue
    const words = ownWords(text)
    found.push({ title: words.name ?? entry.name, description: words.description ?? "" })
  }
  return found
}

/**
 * Every markdown file under one directory, `/`-separated paths relative to it.
 *
 * A pack nests its commands in directories to group them, so the walk goes all
 * the way down: stopping at the top level would hide most of a pack's commands
 * and leave a screen saying the pack ships none.
 */
async function markdownFiles(root: string, at = root): Promise<string[]> {
  const entries = await readDir(at)
  const found: string[] = []
  for (const entry of entries) {
    const full = path.join(at, entry.name)
    if (entry.isDirectory()) {
      found.push(...(await markdownFiles(root, full)))
      continue
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue
    found.push(path.relative(root, full).split(path.sep).join("/"))
  }
  return found
}

/** What one pack ships as commands: every markdown file under `commands/`. */
async function scanCommands(dir: string): Promise<PackContentItem[]> {
  const found: PackContentItem[] = []
  for (const relative of await markdownFiles(path.join(dir, COMMANDS_DIR))) {
    const text = await readText(path.join(dir, COMMANDS_DIR, relative))
    const words = text === null ? {} : ownWords(text)
    const base = relative.split("/").at(-1) ?? relative
    found.push({
      title: words.name ?? base.replace(/\.md$/i, ""),
      description: words.description ?? "",
    })
  }
  return found
}

/** Two items in the order a list reads them, which is the order this answers in. */
function byTitle(left: PackContentItem, right: PackContentItem): number {
  return left.title.localeCompare(right.title)
}

/**
 * Read what the pack in one directory carries.
 *
 * It takes a directory rather than a pack, because a pack the hub collected and
 * one an agent reads in place are read the same way — the difference is only
 * which directory they are in.
 *
 * @param dir — the pack's directory.
 * @returns its skills and commands in title order, and its `.mcp.json` as written.
 */
export async function readPackContents(dir: string): Promise<PackContents> {
  const [skills, commands, mcp] = await Promise.all([
    scanSkills(dir),
    scanCommands(dir),
    readText(path.join(dir, MCP_FILE)),
  ])
  return { skills: skills.sort(byTitle), commands: commands.sort(byTitle), mcp }
}
