/**
 * Turn conventional commits into a Markdown changelog section.
 *
 * The release workflow uses the same section for the GitHub Release notes and
 * for the CHANGELOG.md that rides along with the version sync pull request.
 *
 * Usage:
 *   node scripts/changelog.mjs --from v1.1.0 --to v1.2.0 --repo owner/repo
 *   node scripts/changelog.mjs --from v1.1.0 --to v1.2.0 --repo owner/repo \
 *     --changelog CHANGELOG.md
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const GROUPS = [
  ["feat", "Features"],
  ["fix", "Bug Fixes"],
  ["perf", "Performance"],
  ["refactor", "Refactoring"],
  ["docs", "Documentation"],
  ["test", "Tests"],
  ["build", "Build"],
  ["ci", "CI"],
  ["chore", "Chores"],
]

const GROUP_NAME = new Map(GROUPS)
const CONVENTIONAL = /^([a-zA-Z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/

export function parseCommit(subject) {
  const line = subject.trim()
  const match = CONVENTIONAL.exec(line)
  if (!match) return { type: "other", scope: "", subject: line, breaking: false }
  return {
    type: match[1].toLowerCase(),
    scope: match[2] ?? "",
    subject: match[4].trim(),
    breaking: Boolean(match[3]),
  }
}

export function isSkipped(subject) {
  const line = subject.trim()
  return line.startsWith("Merge ") || /^chore\(release\)/.test(line)
}

/** Parse the record format `hash\x1fsubject\x1fbody\x1e`. */
export function parseLog(raw) {
  return raw
    .split("\x1e")
    .map((record) => record.replace(/^\n+/, "").trim())
    .filter(Boolean)
    .map((record) => {
      const [hash = "", subject = "", body = ""] = record.split("\x1f")
      return { hash: hash.trim(), subject: subject.trim(), body }
    })
}

export function buildSection({ commits, tag, previousTag = "", repo, date }) {
  const grouped = new Map()
  for (const commit of commits) {
    if (!commit.subject || isSkipped(commit.subject)) continue
    const parsed = parseCommit(commit.subject)
    const breaking = parsed.breaking || /^BREAKING[ -]CHANGE:/m.test(commit.body ?? "")
    const title = breaking ? "Breaking Changes" : (GROUP_NAME.get(parsed.type) ?? "Other")
    if (!grouped.has(title)) grouped.set(title, [])
    const prefix = parsed.scope ? `**${parsed.scope}:** ` : ""
    const suffix = commit.hash
      ? ` ([${commit.hash.slice(0, 7)}](https://github.com/${repo}/commit/${commit.hash}))`
      : ""
    grouped.get(title).push(`- ${prefix}${parsed.subject}${suffix}`)
  }

  const order = ["Breaking Changes", ...GROUPS.map(([, title]) => title), "Other"]
  const lines = [`## ${tag} (${date})`, ""]
  for (const title of order) {
    const items = grouped.get(title)
    if (!items || items.length === 0) continue
    lines.push(`### ${title}`, "", ...items, "")
  }
  if (previousTag) {
    lines.push(`**Full Changelog**: https://github.com/${repo}/compare/${previousTag}...${tag}`, "")
  }
  return lines.join("\n").trimEnd() + "\n"
}

export function prependChangelog(existing, section) {
  const firstLine = section.split("\n")[0]
  if (firstLine && existing.includes(firstLine)) return existing

  const header = "# Changelog\n\n"
  const body = existing.startsWith(header)
    ? existing.slice(header.length).trimStart()
    : existing.trimStart()
  return `${header}${section}\n${body}`.trimEnd() + "\n"
}

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key.startsWith("--") || value === undefined) {
      throw new Error(`expected --name value, got ${key}`)
    }
    options[key.slice(2)] = value
  }
  return options
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.to) throw new Error("--to <tag> is required")
  if (!args.repo) throw new Error("--repo <owner/repo> is required")

  const range = args.from ? `${args.from}..${args.to}` : args.to
  const raw = execFileSync("git", ["log", "--format=%H%x1f%s%x1f%b%x1e", range], {
    encoding: "utf8",
  })
  const section = buildSection({
    commits: parseLog(raw),
    tag: args.to,
    previousTag: args.from ?? "",
    repo: args.repo,
    date: args.date ?? new Date().toISOString().slice(0, 10),
  })

  if (args.changelog) {
    const existing = existsSync(args.changelog)
      ? readFileSync(args.changelog, "utf8")
      : "# Changelog\n\n"
    writeFileSync(args.changelog, prependChangelog(existing, section))
  } else {
    process.stdout.write(section)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
