/** Presentation helpers shared by the Extensions page and its detail dialog. */
import type { ExtensionCategoryId } from "@workspace/extensions"

/** Catalog order of the sections; a category with no entries is skipped. */
export const categoryOrder: ExtensionCategoryId[] = [
  "integration",
  "language",
  "appearance",
  "source",
  "storage",
]

/** Icon tile tint per category; borrows the skill tag palette so the modules read as one system. */
export const categoryTile: Record<ExtensionCategoryId, string> = {
  integration: "bg-chip-integrations",
  language: "bg-chip-documents",
  appearance: "bg-chip-design",
  source: "bg-chip-data",
  storage: "bg-chip-reliability",
}
