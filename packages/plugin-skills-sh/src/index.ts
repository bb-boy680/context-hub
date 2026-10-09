/**
 * skills.sh as a skill registry.
 *
 * The skills page's search dialog asks this extension for a page of skills, and
 * each row it answers can be installed through the hub library, which runs
 * `npx skills add <repo> --skill <id>` on the host and files the result under
 * `<home>/skills`.
 *
 * Two facts about the site decide how this is written:
 *
 * - The documented `/api/v1` routes need a Vercel OIDC token, which an installed
 *   extension has no way to hold. The unauthenticated `/api/search` route is the
 *   one it uses; it answers with the skill's repository, its id and its install
 *   count, and nothing else.
 * - A description is not in any public API. It is in the skill's own page, as
 *   the document's meta description, which is the skill's own SKILL.md summary.
 *   {@link SkillRegistry.describe} reads that page for the rows on screen.
 *
 * Both go through the host's network port, because the site serves no CORS
 * header and a page cannot read the responses itself.
 */
import { StoreIcon } from "lucide-react"

import type { ExtensionDefinition, RemoteSkill, SkillRegistry } from "@workspace/extensions"

/** The public search route. */
const ENDPOINT = "https://skills.sh/api/search"

/** The site root a skill's own page hangs off. */
const SITE = "https://www.skills.sh"

/** Most results the search route returns, however large a `limit` asks for. */
const MAX_RESULTS = 200

/** Shortest query the route accepts; anything shorter is refused with 400. */
const MIN_QUERY = 2

/** One entry of the search response, as the route writes it. */
interface SearchEntry {
  /** `{source}/{skillId}`; the site's own path for the skill. */
  id?: unknown
  /** The publishing repository, `owner/repo`. */
  source?: unknown
  skillId?: unknown
  name?: unknown
  installs?: unknown
}

/**
 * Turn a refusal into something worth showing.
 *
 * @param status — the HTTP status the route answered with.
 * @param body — the response body, which carries `{ error }` when it refused.
 * @returns the route's own message, or the status when there is none.
 */
function refusal(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown }
    if (typeof parsed.error === "string" && parsed.error !== "") return parsed.error
  } catch {
    /* A body that is not JSON says nothing; the status is the answer. */
  }
  return `skills.sh answered ${status}`
}

/**
 * Read one row out of a search entry.
 *
 * @param entry — one entry of the search response.
 * @returns the row, or `null` for an entry the install path could not use.
 */
function rowOf(entry: SearchEntry): RemoteSkill | null {
  const name = typeof entry.skillId === "string" ? entry.skillId : entry.name
  const source = typeof entry.source === "string" ? entry.source : undefined
  if (typeof name !== "string" || name === "" || source === undefined) return null
  return {
    name,
    source,
    package: source,
    ...(typeof entry.installs === "number" ? { installs: entry.installs } : {}),
  }
}

/** The meta description of a skill's page, or `null` when the page is not one. */
function descriptionOf(html: string): string | null {
  const found = /<meta name="description" content="([^"]*)"/.exec(html)
  if (found === null || found[1] === "") return null
  /* The page escapes its own copy: a description with quotes arrives as entities. */
  return found[1]
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

export const skillsShExtension: ExtensionDefinition = {
  manifest: {
    id: "hub.skill.registry.skills-sh",
    name: "skills.sh",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "source",
    description:
      "Search the public skills.sh catalog and install a result into this hub.",
    icon: StoreIcon,
    defaultEnabled: true,
    permissions: ["network"],
  },

  activate(scope) {
    const net = scope.host.net
    if (net === null) {
      /* Without a network the dialog keeps its own preview rather than failing a search. */
      scope.host.log(
        "warn",
        "skills.sh: this form cannot reach the network, so the registry stays out"
      )
      return
    }

    /** Descriptions already read, keyed by `source/skill`; a page may be revisited. */
    const known = new Map<string, string | null>()

    const registry: SkillRegistry = {
      id: "skills.sh",
      name: "skills.sh",
      minQuery: MIN_QUERY,

      async search({ query, offset, limit }) {
        /* The route takes no offset, so one row past the window is asked for and
           is the evidence that a next page exists. */
        const want = Math.min(offset + limit + 1, MAX_RESULTS)
        const reply = await net.request(
          `${ENDPOINT}?q=${encodeURIComponent(query)}&limit=${want}`
        )
        if (reply.status !== 200) throw new Error(refusal(reply.status, reply.body))
        const parsed = JSON.parse(reply.body) as { skills?: unknown }
        const entries = Array.isArray(parsed.skills) ? (parsed.skills as SearchEntry[]) : []
        const rows = entries.map(rowOf).filter((row): row is RemoteSkill => row !== null)
        return {
          items: rows.slice(offset, offset + limit),
          hasMore: rows.length > offset + limit,
        }
      },

      async describe(skill) {
        const source = skill.source
        if (source === undefined) return {}
        const key = `${source}/${skill.name}`
        const remembered = known.get(key)
        if (remembered !== undefined) {
          return remembered === null ? {} : { description: remembered }
        }
        const reply = await net.request(`${SITE}/${key}`)
        if (reply.status !== 200) throw new Error(refusal(reply.status, reply.body))
        const description = descriptionOf(reply.body)
        known.set(key, description)
        return description === null ? {} : { description }
      },
    }

    scope.contribute("skillRegistry", registry)
  },
}
