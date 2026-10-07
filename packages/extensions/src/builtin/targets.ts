/**
 * Agent target extensions: one per coding agent Context Hub can deliver
 * assets to. Each registers its consumption contract on activation; actually
 * writing those paths needs a form with filesystem capability, so the web
 * form reports that gap instead of pretending to inject.
 */
import { PuzzleIcon, SquareTerminalIcon, TerminalIcon } from "lucide-react"

import type { ExtensionDefinition } from "../types.ts"

/** Claude Code: skills and memory as files under `~/.claude`, MCP and hooks as JSON. */
export const claudeCodeTarget: ExtensionDefinition = {
  manifest: {
    id: "hub.target.claude-code",
    name: "Claude Code",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Deliver skills, memory and MCP servers to Claude Code.",
    icon: TerminalIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "filesystem"],
  },
  activate(scope) {
    scope.contribute("target", {
      id: "hub.target.claude-code", 
      displayName: "Claude Code",
      supports: ["skill", "mcp", "memory", "hook"],
      locations: [
        { label: "Skills", path: "~/.claude/skills/<name>/SKILL.md" },
        { label: "Memory", path: "~/.claude/CLAUDE.md" },
        { label: "MCP servers", path: "~/.claude.json" },
        { label: "Hooks", path: "~/.claude/settings.json" },
      ],
      format: "Markdown with YAML frontmatter; JSON for MCP servers and hooks",
    })
  },
}

/** Codex: one instructions file plus a TOML config for MCP. */
export const codexTarget: ExtensionDefinition = {
  manifest: {
    id: "hub.target.codex",
    name: "Codex",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Deliver skills, memory and MCP servers to Codex.",
    icon: SquareTerminalIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "filesystem"],
  },
  activate(scope) {
    scope.contribute("target", {
      id: "hub.target.codex",
      displayName: "Codex",
      supports: ["skill", "mcp", "memory"],
      locations: [
        { label: "Instructions", path: "~/.codex/AGENTS.md" },
        { label: "Config", path: "~/.codex/config.toml" },
      ],
      format: "Markdown instructions; TOML for configuration and MCP servers",
    })
  },
}

/** Copilot: repository-scoped instruction and prompt files. */
export const copilotTarget: ExtensionDefinition = {
  manifest: {
    id: "hub.target.copilot",
    name: "GitHub Copilot",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Deliver instructions and prompt files to Copilot workspaces.",
    icon: PuzzleIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "filesystem"],
  },
  activate(scope) {
    scope.contribute("target", {
      id: "hub.target.copilot",
      displayName: "GitHub Copilot",
      supports: ["skill", "memory"],
      locations: [
        { label: "Repository instructions", path: ".github/copilot-instructions.md" },
        { label: "Prompt files", path: ".github/prompts/<name>.prompt.md" },
      ],
      format: "Markdown and reusable .prompt.md files",
    })
  },
}
