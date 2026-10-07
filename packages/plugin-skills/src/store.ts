/**
 * The skill library seam. One implementation reads and writes the disk
 * directly in the process that owns it; the browser and desktop forms only
 * carry the same calls over their own channel, so nothing here assumes a
 * transport.
 */

/** Where a skill came from: this machine, the hub build, or a registry. */
export type SkillOrigin = "local" | "builtin" | "registry"

/** One row of the catalog: the metadata the list renders, without file bodies. */
export interface SkillSummary {
  /** Directory name under the skills root; the skill's identity. */
  id: string
  name: string
  description: string
  tags: string[]
  source: SkillOrigin
  /** Whether the skill is active in this hub. */
  enabled: boolean
  /** Asset file names, in display order. */
  assets: string[]
  /** ISO timestamp of the last recorded change. */
  updatedAt: string
}

/** One asset of a skill. */
export interface SkillAsset {
  file: string
  kind: "image" | "video"
  bytes: number
}

/** One entry of a skill's file tree. */
export interface SkillFileEntry {
  path: string
  /** Nesting depth under the skill directory. */
  depth: number
  directory: boolean
  bytes: number
}

/** A skill with its body and files, loaded on demand. */
export interface SkillDetail extends SkillSummary {
  /** SKILL.md without its frontmatter. */
  body: string
  files: SkillFileEntry[]
  assetDetails: SkillAsset[]
}

/** Sort orders the catalog supports. */
export type SkillSort = "updated" | "name"

/** Catalog query; omitted fields mean "everything, in the default order". */
export interface SkillQuery {
  offset?: number
  limit?: number
  /** Case-insensitive match against name and description. */
  q?: string
  tag?: string
  /** Keep only enabled, or only disabled, skills. */
  enabled?: boolean
  sort?: SkillSort
}

/** One page of the catalog. */
export interface SkillPage {
  items: SkillSummary[]
  /** Rows matching the query, before paging. */
  total: number
  /** Bumped on every change, so callers can skip reloading unchanged data. */
  revision: number
  /** The root these rows came from, shown to a person; a browser cannot read
      `SkillStore.root` off the machine it is talking to. */
  root: string
}

/** Fields a new skill is created from. */
export interface SkillDraft {
  name: string
  description: string
  tags?: string[]
}

/** Mutable parts of an existing skill. */
export interface SkillPatch {
  description?: string
  tags?: string[]
  enabled?: boolean
}

/**
 * The skill library. Implementations own the files; callers never touch paths.
 * Every method rejects with an `Error` carrying a displayable message.
 */
export interface SkillStore {
  /** Where this store reads from, for display in settings and diagnostics. */
  readonly root: string
  /**
   * Rebuild the catalog by scanning the skills root. This is the only operation
   * that walks directories; everything else reads the catalog file it writes.
   */
  refresh(): Promise<void>
  /** Every category in use, sorted; feeds the page's filter row. */
  tags(): Promise<string[]>
  /** One page of the catalog, filtered and sorted, read from the catalog file. */
  list(query?: SkillQuery): Promise<SkillPage>
  /** Full detail for one skill: catalog row, body, and file tree. */
  get(id: string): Promise<SkillDetail>
  /** Create a skill directory with a starter SKILL.md, then index it. */
  create(draft: SkillDraft): Promise<SkillDetail>
  /** Change the mutable fields; omitted fields stay as they are. */
  update(id: string, patch: SkillPatch): Promise<SkillDetail>
  /** Delete the skill and everything under it. */
  remove(id: string): Promise<void>
  /** Read one text file inside the skill directory. */
  readFile(id: string, path: string): Promise<string>
  /** Replace one text file inside the skill directory. */
  writeFile(id: string, path: string, text: string): Promise<void>
  /** Store one uploaded asset; the name is made unique when taken. */
  putAsset(id: string, file: File): Promise<SkillAsset>
  /** Delete one asset and drop it from the recorded order. */
  deleteAsset(id: string, file: string): Promise<void>
  /** A URL that serves one asset; each form resolves it in its own way. */
  assetUrl(id: string, file: string): string
  /** Change notifications from directory watching; returns an unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Release the directory watcher. The store is unusable afterwards. */
  dispose(): void
}

/** Whether a source is a video, by mime type first and extension second. */
export function assetKind(
  file: string,
  contentType?: string
): "image" | "video" {
  if (contentType?.startsWith("video/")) return "video"
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(file) ? "video" : "image"
}
