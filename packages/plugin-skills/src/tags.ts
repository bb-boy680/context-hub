/**
 * Category tints. The design seeds nine of them; a category the user adds
 * afterwards hashes into the same set, so a new type still gets a colour.
 */
const tones = [
  { chip: "bg-chip-documents", label: "text-tag-documents", dot: "bg-tag-documents" },
  { chip: "bg-chip-engineering", label: "text-tag-engineering", dot: "bg-tag-engineering" },
  { chip: "bg-chip-docs", label: "text-tag-docs", dot: "bg-tag-docs" },
  { chip: "bg-chip-data", label: "text-tag-data", dot: "bg-tag-data" },
  { chip: "bg-chip-design", label: "text-tag-design", dot: "bg-tag-design" },
  { chip: "bg-chip-integrations", label: "text-tag-integrations", dot: "bg-tag-integrations" },
  { chip: "bg-chip-quality", label: "text-tag-quality", dot: "bg-tag-quality" },
  { chip: "bg-chip-reliability", label: "text-tag-reliability", dot: "bg-tag-reliability" },
  { chip: "bg-chip-marketing", label: "text-tag-marketing", dot: "bg-tag-marketing" },
]

/** Categories the design authors, in its tone order. */
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

const seeded = new Map<string, number>(
  seedTags.map((tag, index) => [tag, index])
)

/** The three classes one category name renders with. */
export function tagTone(tag: string) {
  const seededIndex = seeded.get(tag)
  if (seededIndex !== undefined) return tones[seededIndex]
  let hash = 0
  for (const char of tag) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 4096
  return tones[hash % tones.length]
}
