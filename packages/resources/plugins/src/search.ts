/**
 * The plugin rows a global search offers.
 *
 * The fold from records and client answers to a row is the page's own — a pack
 * a client holds alone is a row there, so it is a result here — and the mark a
 * row carries is already a URL by the time it reaches this function.
 */
import { PlugIcon } from "lucide-react"

import { matchesQuery, searchPath } from "@context-hub/extensions"
import type { Context } from "@deepseek-ai/cordis"
import type { SearchContribution, SearchResult } from "@context-hub/extensions"

import type { PluginLibrary, PluginLibraryValue } from "./library-store.ts"
import { composeRows } from "./rows.ts"

/** The page every result opens. */
const PAGE = "/plugins"

/**
 * Build the provider the palette reads.
 *
 * @param ctx — the module's own context, for the active language and words.
 * @param library — the module's shared read.
 * @returns the provider, whose lifetime is the module's own `apply`.
 */
export function pluginSearch(ctx: Context, library: PluginLibrary): SearchContribution {
  return {
    labelKey: "search.group.plugins",
    icon: PlugIcon,
    search(query) {
      const value = library.state().value
      if (value === null) return []
      return searchPlugins(value, query, ctx.i18n.state.active, (key) => ctx.i18n.t(key))
    },
    subscribe: (listener) => library.subscribe(listener),
  }
}

/**
 * The packs matching one query.
 *
 * @param value — the shared library as last read.
 * @param query — what the person typed.
 * @param language — the active locale, used for the row's age words.
 * @param t — the active locale's lookup.
 * @returns the matching rows, in the library's own order.
 */
export function searchPlugins(
  value: PluginLibraryValue,
  query: string,
  language: string,
  t: (key: string) => string
): SearchResult[] {
  return composeRows(value.records, value.scanned, language, t)
    .filter((row) => matchesQuery(query, row.name, row.description, row.tags.join(" ")))
    .map((row) => ({
      id: row.id,
      title: row.name,
      ...(row.description === "" ? {} : { description: row.description }),
      ...(row.icon === undefined ? {} : { avatar: row.icon }),
      path: searchPath(PAGE, row.name),
    }))
}
