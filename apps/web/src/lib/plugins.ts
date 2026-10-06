/** Claude Code plugin: a bundle of skills, commands, agents and hooks installed as one unit. */
export type PluginMarketplace = "official" | "acme-internal" | "local"

export type PluginCategory =
  | "engineering"
  | "refactoring"
  | "docs"
  | "writing"
  | "frontend"
  | "build"
  | "design"
  | "tokens"
  | "data"
  | "sql"
  | "security"
  | "audit"
  | "release"
  | "ci"
  | "testing"
  | "marketing"
  | "content"
  | "research"
  | "sourcing"
  | "platform"
  | "infra"
  | "legacy"
  | "migration"
  | "cloud"
  | "editorial"
  | "analytics"
  | "reporting"

export type Plugin = {
  name: string
  version: string
  description: string
  marketplace: PluginMarketplace
  categories: PluginCategory[]
  skills: number
  commands: number
  agents: number
  hooks: number
  size: string
  enabled: boolean
  /* Absent when the plugin has no uploaded cover: the card then renders its README. */
  cover?: string
}

const photo = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=560&h=200&q=70`

/* The nine photo covers the design assigns to the first nine plugins. */
const photos = [
  photo("photo-1560278609-1f6401730daf"),
  photo("photo-1691494106784-87369219b500"),
  photo("photo-1654610285929-a1b63280dd60"),
  photo("photo-1554825959-e9a6670d4f18"),
  photo("photo-1680080338746-594deef576c9"),
  photo("photo-1490365728022-deae76380607"),
  photo("photo-1605493666596-f605022f28ce"),
  photo("photo-1643855217717-4be7dddced68"),
  photo("photo-1777160422885-2c9ba49b700d"),
  photo("photo-1618388810903-840bb0d15ea5"),
  photo("photo-1599727277643-b0c9cfb7705d"),
  photo("photo-1516849841032-87cbac4d88f7"),
]

export const plugins: Plugin[] = [
  {
    name: "engineering-kit",
    version: "2.1.0",
    description: "Everyday engineering skills",
    marketplace: "official",
    categories: ["engineering", "refactoring"],
    skills: 12,
    commands: 6,
    agents: 3,
    hooks: 5,
    size: "1.2 MB",
    enabled: true,
    cover: photos[0],
  },
  {
    name: "docs-studio",
    version: "1.8.3",
    description: "Docs writing and review",
    marketplace: "official",
    categories: ["docs", "writing"],
    skills: 8,
    commands: 4,
    agents: 2,
    hooks: 0,
    size: "0.8 MB",
    enabled: true,
    cover: photos[1],
  },
  {
    name: "frontend-pack",
    version: "3.0.1",
    description: "Frontend build toolkit",
    marketplace: "official",
    categories: ["frontend", "build"],
    skills: 15,
    commands: 5,
    agents: 4,
    hooks: 1,
    size: "2.1 MB",
    enabled: true,
    cover: photos[2],
  },
  {
    name: "design-system",
    version: "1.2.0",
    description: "Design tokens and UI",
    marketplace: "acme-internal",
    categories: ["design", "tokens"],
    skills: 9,
    commands: 3,
    agents: 2,
    hooks: 0,
    size: "0.6 MB",
    enabled: true,
  },
  {
    name: "data-toolkit",
    version: "2.4.2",
    description: "Data pipelines and SQL",
    marketplace: "official",
    categories: ["data", "sql"],
    skills: 11,
    commands: 4,
    agents: 3,
    hooks: 1,
    size: "1.4 MB",
    enabled: true,
    cover: photos[3],
  },
  {
    name: "security-suite",
    version: "1.5.0",
    description: "Security scanning",
    marketplace: "acme-internal",
    categories: ["security", "audit"],
    skills: 7,
    commands: 2,
    agents: 1,
    hooks: 1,
    size: "0.9 MB",
    enabled: true,
    cover: photos[4],
  },
  {
    name: "release-ops",
    version: "1.9.4",
    description: "Release automation",
    marketplace: "acme-internal",
    categories: ["release", "ci"],
    skills: 10,
    commands: 3,
    agents: 2,
    hooks: 2,
    size: "1.1 MB",
    enabled: true,
    cover: photos[5],
  },
  {
    name: "testing-lab",
    version: "2.2.7",
    description: "Test authoring and CI",
    marketplace: "official",
    categories: ["testing", "ci"],
    skills: 13,
    commands: 6,
    agents: 3,
    hooks: 1,
    size: "1.6 MB",
    enabled: true,
    cover: photos[6],
  },
  {
    name: "marketing-kit",
    version: "0.8.1",
    description: "Marketing content",
    marketplace: "local",
    categories: ["marketing", "content"],
    skills: 6,
    commands: 2,
    agents: 1,
    hooks: 0,
    size: "0.4 MB",
    enabled: true,
  },
  {
    name: "research-pack",
    version: "1.4.0",
    description: "Research and sourcing",
    marketplace: "official",
    categories: ["research", "sourcing"],
    skills: 9,
    commands: 3,
    agents: 2,
    hooks: 0,
    size: "1.0 MB",
    enabled: false,
  },
  {
    name: "platform-core",
    version: "3.1.2",
    description: "Platform primitives",
    marketplace: "acme-internal",
    categories: ["platform", "infra"],
    skills: 14,
    commands: 5,
    agents: 4,
    hooks: 2,
    size: "1.9 MB",
    enabled: true,
    cover: photos[7],
  },
  {
    name: "legacy-bridge",
    version: "0.3.0",
    description: "Legacy migrations",
    marketplace: "local",
    categories: ["legacy", "migration"],
    skills: 5,
    commands: 1,
    agents: 1,
    hooks: 0,
    size: "0.3 MB",
    enabled: true,
    cover: photos[8],
  },
  {
    name: "infra-pack",
    version: "1.1.5",
    description: "Infrastructure provisioning",
    marketplace: "acme-internal",
    categories: ["infra", "cloud"],
    skills: 8,
    commands: 3,
    agents: 2,
    hooks: 1,
    size: "1.2 MB",
    enabled: false,
    cover: photos[9],
  },
  {
    name: "content-forge",
    version: "0.6.2",
    description: "Content generation workflows",
    marketplace: "local",
    categories: ["content", "editorial"],
    skills: 7,
    commands: 2,
    agents: 1,
    hooks: 0,
    size: "0.5 MB",
    enabled: false,
    cover: photos[10],
  },
  {
    name: "analytics-plus",
    version: "0.4.0",
    description: "Analytics and reporting",
    marketplace: "local",
    categories: ["analytics", "reporting"],
    skills: 4,
    commands: 1,
    agents: 0,
    hooks: 0,
    size: "0.2 MB",
    enabled: false,
    cover: photos[11],
  },
]

export const marketplaceLabel: Record<PluginMarketplace, string> = {
  official: "official",
  "acme-internal": "acme-internal",
  local: "local",
}

export const marketplaceChip: Record<PluginMarketplace, string> = {
  official: "bg-chip-official text-marketplace-official",
  "acme-internal": "bg-chip-internal text-marketplace-internal",
  local: "bg-chip-local text-marketplace-local",
}

/* Categories borrow the skill tag palette, so the two modules read as one colour system. */
const categoryPalette: Record<PluginCategory, string> = {
  engineering: "engineering",
  refactoring: "engineering",
  build: "engineering",
  platform: "engineering",
  infra: "engineering",
  legacy: "engineering",
  migration: "engineering",
  docs: "docs",
  writing: "docs",
  content: "docs",
  editorial: "docs",
  frontend: "integrations",
  cloud: "integrations",
  design: "design",
  tokens: "design",
  data: "data",
  sql: "data",
  analytics: "data",
  reporting: "data",
  security: "reliability",
  audit: "reliability",
  release: "quality",
  ci: "quality",
  testing: "quality",
  marketing: "marketing",
  research: "documents",
  sourcing: "documents",
}

/** Chip classes for one category, e.g. `bg-chip-engineering text-tag-engineering`. */
export function categoryChip(category: PluginCategory): string {
  const palette = categoryPalette[category]
  return `bg-chip-${palette} text-tag-${palette}`
}

/** Tile tint for a plugin's icon, taken from its first category like the design's detail dialog. */
export function categoryTile(category: PluginCategory): string {
  return `bg-chip-${categoryPalette[category]}`
}

/** Uploaded cover images; the design fills the Configuration gallery from the module's photo pool. */
export function pluginGallery(plugin: { cover?: string }): string[] {
  if (!plugin.cover) return []
  const start = photos.indexOf(plugin.cover)
  return [0, 1, 2].map((offset) => photos[(start + offset) % photos.length])
}

export const marketplaceCount = "48 plugins across 3 marketplaces"
