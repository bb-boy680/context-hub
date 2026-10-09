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
