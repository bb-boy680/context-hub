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
  { label: "Memory", path: "~/.claude/CLAUDE.md" },
  { label: "MCP servers", path: "~/.claude.json" },
  { label: "Hooks", path: "~/.claude/settings.json" },
]

/** What Claude Code reads inside a project folder, where this hub installs. */
export const PROJECT_LOCATIONS: ClaudeCodeLocation[] = [
  { label: "Skills", path: ".claude/skills/<name>/SKILL.md" },
]

/** The asset kinds Claude Code accepts, in the order a panel lists them. */
export const SUPPORTS = ["skill", "mcp", "memory", "hook"] as const