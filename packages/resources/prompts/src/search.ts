/**
 * The prompt rows a global search offers.
 *
 * The page's filter reads the body as well as the title and description, so a
 * search does too: a prompt whose text says "changelog" is exactly the one a
 * person is looking for when they type it. The note under a result stays the
 * description — the body is the page's material, not a one-line annotation.
 */
import { FileTextIcon } from "lucide-react"

import { matchesQuery, searchPath } from "@context-hub/extensions"
import type { SearchContribution, SearchResult } from "@context-hub/extensions"

import type { PromptLibrary, PromptLibraryValue } from "./library-store.ts"

/** The page every result opens. */
const PAGE = "/prompts"

/**
 * Build the provider the palette reads.
 *
 * @param library — the module's shared read.
 * @returns the provider, whose lifetime is the module's own `apply`.
 */
export function promptSearch(library: PromptLibrary): SearchContribution {
  return {
    labelKey: "search.group.prompts",
    icon: FileTextIcon,
    search(query) {
      const value = library.state().value
      if (value === null) return []
      return searchPrompts(
        value,
        query,
        (ref) => library.store()?.assetUrl(ref) ?? null
      )
    },
    subscribe: (listener) => library.subscribe(listener),
  }
}

/**
 * The prompts matching one query.
 *
 * @param value — the shared library as last read.
 * @param query — what the person typed.
 * @param assetUrl — resolves a stored picture reference, or `null` when the
 *   form has no store to resolve it with.
 * @returns the matching rows, in the library's own order.
 */
export function searchPrompts(
  value: PromptLibraryValue,
  query: string,
  assetUrl: (ref: string) => string | null
): SearchResult[] {
  return value.rows
    .filter((row) =>
      matchesQuery(query, row.name, row.description, row.prompt, row.tags.join(" "))
    )
    .map((row) => {
      const ref = row.assets[0]
      const avatar = ref === undefined ? null : assetUrl(ref)
      return {
        id: row.id,
        title: row.name,
        ...(row.description === "" ? {} : { description: row.description }),
        ...(avatar === null ? {} : { avatar }),
        path: searchPath(PAGE, row.name),
      }
    })
}
