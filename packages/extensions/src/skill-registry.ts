/**
 * The remote-registry contract: what a plugin that knows a skill catalog
 * (skills.sh, an internal registry, a marketplace) contributes so the skills
 * page can search it.
 *
 * The kernel owns this type because it is a contribution point, and a page
 * reads contributions without knowing which plugin made them. A registry only
 * reads; what a row installs is the hub library's own package path, which the
 * row names.
 */

/** One remote skill, as a search result row renders it. */
export interface RemoteSkill {
  /**
   * The skill's id in its own registry, which is also what the installer takes:
   * the hub library fetches it as the skill named inside {@link package}.
   */
  name: string
  /**
   * Where this skill is published: a GitHub repository as `owner/repo`, or a
   * domain for a well-known source. It is the row's provenance, which is what
   * tells two same-named skills from different repositories apart.
   */
  source?: string
  /** What the skill does, when the registry reports it. */
  description?: string
  /**
   * What the hub library is given to fetch exactly this skill, e.g.
   * `owner/repo`. Absent on a row that only previews, so there is nothing
   * behind it to install from.
   */
  package?: string
  /** How many times the registry has seen this skill installed. */
  installs?: number
  /** The registry's own category, which the row's icon tile is tinted by. */
  tag?: string
}

/** One page of a registry's answer. */
export interface RegistryPage {
  items: RemoteSkill[]
  /** Matches before paging, when the registry can count them. */
  total?: number
  /**
   * Whether asking for the page after this one would return anything; omitted
   * when the registry cannot say, which leaves the page control at this page.
   */
  hasMore?: boolean
}

/** What a page asks a registry for. */
export interface RegistryQuery {
  /** What the person typed. */
  query: string
  offset: number
  limit: number
}

/** One remote registry a plugin makes searchable. */
export interface SkillRegistry {
  /** Stable id, the contributing plugin's own. */
  id: string
  /**
   * Display name; the search field, the result header, and every `by @…` line
   * read it, so it names the registry, not the skill's author.
   */
  name: string
  /** Shortest query this registry answers; fewer characters show a hint instead. */
  minQuery?: number
  /**
   * Answer one page.
   *
   * @param request — the query and the window to return.
   * @throws {Error} when the registry cannot answer, with a message fit to show.
   */
  search(request: RegistryQuery): Promise<RegistryPage>
  /**
   * Fill in what the search answer left out, one row at a time.
   *
   * A registry whose search route carries only the bare identity reads the rest
   * from wherever it keeps it — skills.sh, for one, has no description in its
   * search response and reads each skill's own page. Implementations are asked
   * once per row on screen and should cache; a rejection leaves the row as it
   * was, because a missing detail is not a failed search.
   */
  describe?(skill: RemoteSkill): Promise<Partial<RemoteSkill>>
}
