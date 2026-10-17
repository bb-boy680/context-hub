/**
 * The facts this integration is built on: what Claude Code reads, where, and
 * which of those places Context Hub delivers into.
 *
 * Claude Code keeps one global directory per machine and one project directory
 * per folder, the second named `.claude` rather than the `.agents` the skills
 * CLI shares. Both are listed here so the descriptor, the page and the skills
 * module read the same strings.
 */
/** This integration's id; the kernel matches it against the manifest. */
export const CLAUDE_CODE_ID = "hub.target.claude-code"

/**
 * The skills directory Claude Code reads, relative to the workspace and to the
 * home directory alike: `.claude/skills` under a project, `~/.claude/skills`
 * outside one.
 */
export const CLAUDE_CODE_SKILL_DIR = ".claude/skills"

/**
 * The MCP file Claude Code reads at a project's root. It is the project's own
 * document, separate from the settings below: a server declared here is shared
 * with whoever opens the project.
 */
export const CLAUDE_CODE_MCP_FILE = ".mcp.json"

/**
 * The MCP file Claude Code reads outside any project. It is Claude Code's own
 * top-level document — the same file that records its projects and machine-wide
 * settings — so a write touches this node and nothing beside it.
 */
export const CLAUDE_CODE_GLOBAL_MCP_FILE = ".claude.json"

/** The key declarations live under, in both files. */
export const CLAUDE_CODE_MCP_KEY = "mcpServers"

/**
 * Where Claude Code records that a declared server should not be connected: one
 * `disabledMcpServers` list per project, in its own top-level document, keyed
 * by the project's path. Both places share that list, because a project can
 * disable a server either scope declared.
 */
export const CLAUDE_CODE_DISABLED_KEY = "disabledMcpServers"

/**
 * Where Claude Code records which plugins it has switched on, under both roots
 * alike: its own directory for the machine, `.claude` inside a project.
 *
 * The two are one file name because the two roots are the two directories, and
 * the record inside is keyed by plugin id alone — one answer for a pack, not one
 * per file. Which is why a hub that may speak for both files reads them.
 */
export const CLAUDE_CODE_SETTINGS_FILE = ".claude/settings.json"

/** The node that file keeps the switches under, keyed by plugin id. */
export const CLAUDE_CODE_ENABLED_KEY = "enabledPlugins"

/**
 * Where Claude Code reads slash commands, relative to the workspace and to the
 * home directory alike: `.claude/commands` under a project, `~/.claude/commands`
 * outside one. Each command is its own Markdown file, and the file's name is
 * the command's name — which is why a prompt delivered here becomes a file
 * named after the prompt.
 */
export const CLAUDE_CODE_COMMAND_DIR = ".claude/commands"

/**
 * Where Claude Code reads standing rules, under the same two roots. A rule is
 * its own file rather than a line in a larger one, so writing one here adds a
 * document instead of editing somebody's.
 */
export const CLAUDE_CODE_RULE_DIR = ".claude/rules"

/**
 * Where Claude Code reads agent definitions, under the same two roots. Written
 * the same way a command is — one file per name — for the same reason: the
 * file's name is what the agent is called.
 */
export const CLAUDE_CODE_AGENT_DIR = ".claude/agents"

/**
 * The instruction file Claude Code reads outside every project — its own memory
 * file, which is only ever the person's. It is named here as where a prompt is
 * added when it is added to a memory file; the project-side `CLAUDE.md` is a
 * shared file and is not written by that action.
 */
export const CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE = ".claude/CLAUDE.md"

/** One place either scope reads assets from. */
export interface ClaudeCodeLocation {
  /** What the path holds, e.g. "Skills". */
  label: string
  /** The path as a person reads it. */
  path: string
}

/** What Claude Code reads outside any project. */
export const GLOBAL_LOCATIONS: ClaudeCodeLocation[] = [
  { label: "Skills", path: "~/.claude/skills/<name>/SKILL.md" },
  { label: "Commands", path: "~/.claude/commands/<name>.md" },
  { label: "Rules", path: "~/.claude/rules/<name>.md" },
  { label: "Memory", path: "~/.claude/CLAUDE.md" },
  { label: "MCP servers", path: "~/.claude.json" },
  { label: "Hooks", path: "~/.claude/settings.json" },
]

/** What Claude Code reads inside a project folder, where this hub installs. */
export const PROJECT_LOCATIONS: ClaudeCodeLocation[] = [
  { label: "Skills", path: ".claude/skills/<name>/SKILL.md" },
  { label: "Commands", path: ".claude/commands/<name>.md" },
  { label: "Rules", path: ".claude/rules/<name>.md" },
  { label: "Memory", path: "CLAUDE.md" },
]

/** The asset kinds Claude Code accepts, in the order a panel lists them. */
export const SUPPORTS = ["skill", "mcp", "memory", "hook"] as const

/**
 * A folder compared the way Claude Code spells it: forward slashes, no trailing
 * one, and no case — the same folder is written its own way in its own records,
 * and both a project's key and its record name it that way.
 *
 * @param value — a folder path, as either side wrote it.
 * @returns the form two spellings of one folder agree on.
 */
export function normalizeProjectPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
}