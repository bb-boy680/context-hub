/**
 * What the hub knows about a server's branding, and nothing more: three brands
 * whose artwork the web form ships. A server is a command or a URL, not a
 * brand, so a mark without artwork is drawn as a glyph by the caller — which is
 * why the catalog carries a name rather than an image.
 */
import type { McpMark } from "./types.ts"

/** The images a mark names, served from the web form's public directory. */
const IMAGES: Partial<Record<McpMark, string>> = {
  github: "/mcp-icons/github.png",
  linear: "/mcp-icons/linear.png",
  postgresql: "/mcp-icons/postgresql.png",
}

/** The image a mark names, or null when it is drawn as a glyph instead. */
export function markImage(mark: McpMark): string | null {
  return IMAGES[mark] ?? null
}
