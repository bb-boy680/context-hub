/** The three rankings skills.sh publishes. */
export type MarketView = "all-time" | "trending" | "hot"

/** One row of a ranking page. */
export interface MarketRankRow {
  source: string
  skillId: string
  name: string
  installs: number
  /** All-time rows carry eight weekly points; other views usually do not. */
  weeklyInstalls?: number[]
  isOfficial?: boolean
}

/** One ranking page, as the API answered it. */
export interface MarketRankPage {
  view: MarketView
  page: number
  hasMore: boolean
  /** The API's rolling total; display only, never a pagination key. */
  total: number
  rows: MarketRankRow[]
}

/** One search result. */
export interface MarketSearchRow {
  /** `${source}/${skillId}`, or the API's own id when it supplied one. */
  id: string
  source: string
  skillId: string
  name: string
  installs: number
}

/** The list a search answered with. */
export interface MarketSearchPage {
  query: string
  rows: MarketSearchRow[]
  /** The API caps one answer at 200 rows; this says it reached the cap. */
  truncated: boolean
}

/** One file from the public preview endpoint. */
export interface MarketFile {
  path: string
  contents: string
}

/** The files and revision of a skill, read without writing anything. */
export interface MarketBundle {
  files: MarketFile[]
  /** The source revision; kept for display only, never a version or cache key. */
  hash: string
}

/** One audit provider's answer. */
export interface MarketAuditEntry {
  provider: string
  slug: string
  status: string
  summary: string
  auditedAt: string
  /** An open set; the UI treats unknown values as neutral. */
  riskLevel?: string
  categories?: string[]
}

/** The audit report for one skill. */
export interface MarketAudit {
  id: string
  source: string
  slug: string
  audits: MarketAuditEntry[]
}
