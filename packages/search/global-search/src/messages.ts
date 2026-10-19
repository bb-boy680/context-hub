/**
 * English defaults for the global search palette and the two shell modules it
 * searches for.
 *
 * The table travels with the package, so a language pack can translate the
 * `globalSearch.*` and `search.group.*` keys without depending on it; a key no
 * pack covers keeps the English here.
 */
export const globalSearchMessages: Record<string, string> = {
  /* The two shell pages are not extensions, so their search providers and
     group names live in this package. */
  "search.group.settings": "Settings",
  "search.group.extensions": "Extensions",

  "globalSearch.label": "Search Context Hub",
  "globalSearch.description": "Search every module and open the page that holds the result.",
  "globalSearch.filter.all": "All",
  "globalSearch.inputLabel": "Search query",
  "globalSearch.placeholder": "Search anything…",
  "globalSearch.empty": "Type to search across Context Hub.",
  "globalSearch.noResults": "No results for “{query}”.",
  "globalSearch.resultCount": "{count} results",
  "globalSearch.hint.navigate": "↑↓ Navigate",
  "globalSearch.hint.open": "↵ Open",
  "globalSearch.hint.close": "Esc Close",
}
