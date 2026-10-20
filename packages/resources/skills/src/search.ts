/**
 * The skills module's one search function.
 *
 * It reads the same shared library the page draws, so a result and the page it
 * opens cannot disagree about which skills exist. A place's own rows that the
 * library has not taken in are searched too — the page shows them, so the
 * palette must find them.
 */
import { SparklesIcon } from "lucide-react"

import { matchesQuery, searchPath } from "@context-hub/extensions"
import type { SearchContribution, SearchResult } from "@context-hub/extensions"

import type { SkillLibrary, SkillLibraryValue } from "./library-store.ts"

/** The page every result opens. */
const PAGE = "/skills"

/**
 * Build the provider the palette reads.
 *
 * @param library — the module's shared read.
 * @returns the provider, whose lifetime is the module's own `apply`.
 */
export function skillSearch(library: SkillLibrary): SearchContribution {
  return {
    labelKey: "search.group.skills",
    icon: SparklesIcon,
    search(query) {
      const value = library.state().value
      if (value === null) return []
      return searchSkills(
        value,
        query,
        (ref) => library.store()?.assetUrl(ref) ?? null
      )
    },
    subscribe: (listener) => library.subscribe(listener),
  }
}

/**
 * The rows matching one query.
 *
 * @param value — the shared library as last read.
 * @param query — what the person typed.
 * @param assetUrl — resolves a stored picture reference, or `null` when the
 *   form has no store to resolve it with.
 * @returns the matching rows, library rows first and each name once.
 */
export function searchSkills(
  value: SkillLibraryValue,
  query: string,
  assetUrl: (ref: string) => string | null
): SearchResult[] {
  const seen = new Set<string>()
  const results: SearchResult[] = []

  const push = (
    name: string,
    description: string,
    avatar?: string | null
  ): void => {
    seen.add(name)
    results.push({
      id: name,
      title: name,
      ...(description === "" ? {} : { description }),
      ...(avatar === undefined || avatar === null ? {} : { avatar }),
      path: searchPath(PAGE, name),
    })
  }

  for (const item of value.page?.items ?? []) {
    if (!matchesQuery(query, item.name, item.description, item.tags.join(" "))) continue
    const ref = item.assets[0]
    push(item.name, item.description, ref === undefined ? null : assetUrl(ref))
  }

  for (const view of Object.values(value.held)) {
    for (const skill of view?.skills ?? []) {
      if (seen.has(skill.name)) continue
      if (!matchesQuery(query, skill.name, skill.description)) continue
      push(skill.name, skill.description)
    }
  }

  return results
}
