/**
 * The environment-variable names a global search offers.
 *
 * Only names and groups are indexed, never values: the library deliberately
 * keeps secrets out of the index, and a search result is not a place to leak
 * them. The group is the note under a name, because it is what the page shows
 * beside it.
 */
import { VariableIcon } from "lucide-react"

import { matchesQuery, searchPath } from "@context-hub/extensions"
import type { SearchContribution, SearchResult } from "@context-hub/extensions"

import type { VariableLibrary } from "./library-store.ts"
import type { VariableDocument } from "./store.ts"

/** The page every result opens. */
const PAGE = "/variables"

/**
 * Build the provider the palette reads.
 *
 * @param library — the module's shared read.
 * @returns the provider, whose lifetime is the module's own `apply`.
 */
export function variableSearch(library: VariableLibrary): SearchContribution {
  return {
    labelKey: "search.group.variables",
    icon: VariableIcon,
    search(query) {
      const document = library.state().value?.document ?? null
      return document === null ? [] : searchVariables(document, query)
    },
    subscribe: (listener) => library.subscribe(listener),
  }
}

/**
 * The variables matching one query.
 *
 * @param document — the shared library as last read.
 * @param query — what the person typed.
 * @returns the matching rows; a value is never read or returned.
 */
export function searchVariables(
  document: VariableDocument,
  query: string
): SearchResult[] {
  return document.variables
    .filter((variable) => matchesQuery(query, variable.name, variable.group))
    .map((variable) => ({
      id: variable.name,
      title: variable.name,
      ...(variable.group === "" ? {} : { description: variable.group }),
      path: searchPath(PAGE, variable.name),
    }))
}
