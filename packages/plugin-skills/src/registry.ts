/**
 * The registry the search dialog falls back to while no source plugin answers:
 * it searches the design's own rows, so the dialog has something to show
 * before anyone installs a registry plugin. None of these rows carries a
 * package, so a preview row can be marked in the dialog but nothing on this
 * machine can fetch it.
 *
 * The contract itself lives in the kernel, because a registry is a contribution
 * point and the page reads contributions without knowing which plugin made
 * them.
 */
import type { RemoteSkill, SkillRegistry } from "@workspace/extensions"

export type {
  RegistryPage,
  RegistryQuery,
  RemoteSkill,
  SkillRegistry,
} from "@workspace/extensions"

/** The rows the dialog previews: the design's own list, long enough to page through. */
const previewSkills: Omit<RemoteSkill, "package">[] = [
  {
    name: "tdd",
    description: "Write the failing test before the code",
    installs: 210_000,
    tag: "Engineering",
  },
  {
    name: "pdf-extract",
    description: "Pull text and tables out of PDF files",
    installs: 128_000,
    tag: "Documents",
  },
  {
    name: "commit-conventions",
    description: "Write commits that match the repo's style",
    installs: 96_400,
    tag: "Quality",
  },
  {
    name: "react-perf",
    description: "Profile and trim wasted React re-renders",
    installs: 61_200,
    tag: "Engineering",
  },
  {
    name: "sql-migrations",
    description: "Draft safe, reversible schema migrations",
    installs: 48_900,
    tag: "Data",
  },
  {
    name: "changelog-writer",
    description: "Turn merged pull requests into a changelog",
    installs: 33_500,
    tag: "Docs",
  },
  {
    name: "code-review",
    description: "Review a diff against the repo's own standards",
    installs: 27_800,
    tag: "Quality",
  },
  {
    name: "doc-audit",
    description: "Check that every page still matches the code",
    installs: 24_100,
    tag: "Docs",
  },
  {
    name: "api-design",
    description: "Shape endpoints and payloads before coding",
    installs: 19_600,
    tag: "Engineering",
  },
  {
    name: "test-reliability",
    description: "Find the tests that fail only under load",
    installs: 16_300,
    tag: "Reliability",
  },
  {
    name: "release-notes",
    description: "Turn merged work into release notes",
    installs: 12_400,
    tag: "Docs",
  },
  {
    name: "legacy-jira-sync",
    description: "Keep Jira tickets in step with the repo",
    installs: 9_800,
    tag: "Integrations",
  },
  {
    name: "data-migration",
    description: "Plan schema changes that can roll back",
    installs: 7_200,
    tag: "Data",
  },
  {
    name: "onboarding-guide",
    description: "Write the tour a new contributor reads first",
    installs: 5_600,
    tag: "Documents",
  },
  {
    name: "perf-profiling",
    description: "Read a profile and name the real bottleneck",
    installs: 4_100,
    tag: "Engineering",
  },
  {
    name: "brand-voice",
    description: "Keep product copy in one voice",
    installs: 2_900,
    tag: "Marketing",
  },
  {
    name: "incident-postmortem",
    description: "Draft the timeline and the follow-ups",
    installs: 1_800,
    tag: "Reliability",
  },
  {
    name: "schema-explorer",
    description: "Ask questions of a database you did not design",
    installs: 900,
    tag: "Data",
  },
]

export const previewRegistry: SkillRegistry = {
  id: "preview",
  name: "skills.sh",
  async search({ query, offset, limit }) {
    const needle = query.trim().toLowerCase()
    const matches =
      needle === ""
        ? previewSkills
        : previewSkills.filter(
            (skill) =>
              skill.name.toLowerCase().includes(needle) ||
              (skill.description ?? "").toLowerCase().includes(needle)
          )
    return { items: matches.slice(offset, offset + limit), total: matches.length }
  },
}
