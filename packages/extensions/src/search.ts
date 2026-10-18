/**
 * The small shared pieces every search provider uses: how a result's address is
 * built, and what "matches" means.
 *
 * Matching is deliberately the same everywhere — case-insensitive substring over
 * the fields a page's own filter already reads — so a search result and the page
 * it opens cannot disagree about why a row matched.
 */

/**
 * Address one page with a search query, plus any parameters the page reads.
 *
 * The query is trimmed; an empty one writes no `q` at all. Parameters keep the
 * order given, so the address a provider writes is the address a person sees.
 *
 * @param path — the page's route, without a query or hash.
 * @param query — what the person typed.
 * @param extra — further parameters the page reads, e.g. `view`.
 * @returns the route with its query string, or the route alone.
 */
export function searchPath(
  path: string,
  query: string,
  extra: Readonly<Record<string, string>> = {}
): string {
  const params = new URLSearchParams()
  const text = query.trim()
  if (text !== "") params.set("q", text)
  for (const [key, value] of Object.entries(extra)) params.set(key, value)
  const queryString = params.toString()
  return queryString === "" ? path : `${path}?${queryString}`
}

/**
 * Whether any field contains the query, ignoring case and surrounding space.
 *
 * An empty query matches nothing: the palette shows its own hint rather than
 * asking every provider for its whole library.
 *
 * @param query — what the person typed.
 * @param fields — the fields the page's own filter reads.
 * @returns true when one field holds the query.
 */
export function matchesQuery(
  query: string,
  ...fields: readonly (string | undefined | null)[]
): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === "") return false
  return fields.some(
    (field) => field !== undefined && field !== null && field.toLowerCase().includes(needle)
  )
}
