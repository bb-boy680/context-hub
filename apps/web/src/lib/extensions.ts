/** Presentation helpers shared by the Extensions page and its detail dialog. */
import type { ExtensionCategoryId } from "@context-hub/extensions"

/** Glass card surface shared by the Extensions page and the market section. */
export const cardSurface =
  "rounded-lg bg-card p-5 ring-1 ring-glass-border shadow-glass backdrop-blur-glass"

/** Icon tile tint per category; borrows the skill tag palette so the modules read as one system. */
export const categoryTile: Record<ExtensionCategoryId, string> = {
  agent: "bg-chip-integrations",
  asset: "bg-chip-integrations",
  integration: "bg-chip-integrations",
  language: "bg-chip-documents",
  appearance: "bg-chip-design",
  source: "bg-chip-data",
  storage: "bg-chip-reliability",
}
