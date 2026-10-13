/**
 * The rows the screen draws until the catalog reads real packs. They exist so
 * the two views, the filter bar and the pager are exercised with rows of
 * different lengths; the module that reads a plugin's own directory replaces
 * this file outright, and nothing here is a fallback for a read that failed.
 */
import type { PluginFileEntry, PluginRow } from "./types.ts"

/**
 * A stand-in for a pack's own picture, at a given ratio. Flat bands, no text:
 * what it is here for is the ratio, because the card takes its cover's ratio
 * and that is what makes the grid a waterfall rather than a table of boxes.
 */
function flatCover(width: number, height: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="100%" height="100%" fill="#e3e7ee"/>` +
    `<rect y="${Math.round(height * 0.62)}" width="100%" height="${Math.round(height * 0.38)}" fill="#eef0f4"/>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const samplePlugins: PluginRow[] = [
  {
    id: "engineering-kit",
    name: "engineering-kit",
    version: "2.4.0",
    description:
      "Scaffolds a feature end to end: a plan, the files, the tests, and the review checklist.",
    tags: ["engineering", "frontend"],
    source: "marketplace",
    updated: "2 days ago",
    cover: flatCover(640, 480),
    bundle: { skills: 12, commands: 6 },
  },
  {
    id: "docs-writer",
    name: "docs-writer",
    version: "1.9.3",
    description: "Writes and rewrites reference pages from the code they describe.",
    tags: ["docs"],
    source: "marketplace",
    updated: "6 hours ago",
    bundle: { skills: 4, commands: 3 },
  },
  {
    id: "test-harness",
    name: "test-harness",
    version: "0.8.1",
    description:
      "Turns a failing run into a reproducible case, then keeps the case in the suite that failed.",
    tags: ["testing", "quality"],
    source: "marketplace",
    updated: "3 weeks ago",
    cover: flatCover(640, 360),
    bundle: { skills: 6, commands: 2 },
  },
  {
    id: "git-flow",
    name: "git-flow",
    version: "3.0.2",
    description: "Branch, rebase and land changes through the flow this repository declares.",
    tags: ["git"],
    source: "builtin",
    updated: "5 days ago",
    bundle: { skills: 3, commands: 8 },
  },
  {
    id: "data-lab",
    name: "data-lab",
    version: "1.2.0",
    description:
      "Profiles a dataset, then writes the query that answers the question it was opened for.",
    tags: ["data"],
    source: "marketplace",
    updated: "1 day ago",
    cover: flatCover(640, 640),
    bundle: { skills: 5, commands: 4 },
  },
  {
    id: "review-bot",
    name: "review-bot",
    version: "0.5.7",
    description: "Reads a pull request the way this repository's review notes ask for.",
    tags: ["review", "quality"],
    source: "marketplace",
    updated: "9 hours ago",
    bundle: { skills: 2, commands: 5 },
  },
  {
    id: "security-audit",
    name: "security-audit",
    version: "1.1.4",
    description: "Walks the OWASP list over a diff and reports what it can prove.",
    tags: ["security"],
    source: "marketplace",
    updated: "4 days ago",
    cover: flatCover(640, 320),
    bundle: { skills: 7, commands: 2 },
  },
  {
    id: "api-toolkit",
    name: "api-toolkit",
    version: "2.0.0-rc.3",
    description: "Keeps a client and its contract in step, from the schema to the tests.",
    tags: ["backend", "engineering"],
    source: "local",
    updated: "20 minutes ago",
    bundle: { skills: 9, commands: 7 },
  },
  {
    id: "design-tokens",
    name: "design-tokens",
    version: "1.6.1",
    description: "Reads a token table and writes the surfaces every platform renders from it.",
    tags: ["frontend", "design"],
    source: "local",
    updated: "2 months ago",
    cover: flatCover(480, 640),
    bundle: { skills: 4, commands: 1 },
  },
  {
    id: "release-manager",
    name: "release-manager",
    version: "0.9.0",
    description: "Cuts a version, writes its notes, and lands it on the branch it came from.",
    tags: ["release"],
    source: "builtin",
    updated: "11 days ago",
    bundle: { skills: 3, commands: 9 },
  },
  {
    id: "accessibility-scan",
    name: "accessibility-scan",
    version: "1.3.5",
    description: "Checks a screen against the contrast and focus rules it declares.",
    tags: ["frontend", "quality"],
    source: "marketplace",
    updated: "1 week ago",
    bundle: { skills: 5, commands: 3 },
  },
]

/** The packs the sample catalog starts out holding, by id. */
export const sampleInstalled: string[] = [
  "engineering-kit",
  "git-flow",
  "data-lab",
  "api-toolkit",
  "release-manager",
  "accessibility-scan",
]

/**
 * The files one pack holds. The listing is built from the row itself, so the
 * names and the counts agree with what the card says — it stands in for reading
 * a pack's own directory until that read exists.
 */
export function sampleFiles(plugin: PluginRow): PluginFileEntry[] {
  const files: PluginFileEntry[] = [
    {
      path: "plugin.json",
      directory: false,
      text: `${JSON.stringify(
        {
          name: plugin.name,
          version: plugin.version,
          description: plugin.description,
          skills: plugin.bundle.skills,
          commands: plugin.bundle.commands,
        },
        null,
        2
      )}\n`,
    },
    {
      path: "README.md",
      directory: false,
      text: `# ${plugin.name}\n\n${plugin.description}\n\n**Version** ${plugin.version}\n`,
    },
    { path: "skills", directory: true },
    /* Every level is listed, the way a directory walk reports it: a folder whose
       parent is missing would leave its children unreachable in the tree. */
    { path: "skills/review-checklist", directory: true },
    {
      path: "skills/review-checklist/SKILL.md",
      directory: false,
      text:
        `---\nname: review-checklist\ndescription: The list this pack reviews a change against.\n---\n\n` +
        `# Review checklist\n\n1. Read what the change says it does.\n2. Check it against ${plugin.name}'s own rules.\n3. Name anything the change leaves untested.\n`,
    },
    { path: "commands", directory: true },
    {
      path: "commands/run.md",
      directory: false,
      text: `Run ${plugin.name} over the current repository.\n\n\`\`\`sh\n${plugin.name} run\n\`\`\`\n`,
    },
  ]
  return files
}
