/* Categories are read from their names: the design spends its one accent on
   actions, so every chip is neutral and the chip geometry carries the meaning. */
const tone = {
  chip: "bg-secondary",
  label: "text-copy",
  dot: "bg-muted-foreground",
}

/** Categories the design authors, in the order it lists them. */
export const seedTags = [
  "Documents",
  "Engineering",
  "Docs",
  "Data",
  "Design",
  "Integrations",
  "Quality",
  "Reliability",
  "Marketing",
] as const

/** The three classes a category chip renders with. */
export function tagTone() {
  return tone
}
