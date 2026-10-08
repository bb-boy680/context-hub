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
  /**
   * Where this skill's media comes from, in display order: either a remote URL
   * the hub only references, or a path relative to the hub home that the hub
   * owns and deletes with the skill.
   */
  assets: string[]
  /** ISO timestamp of the last recorded change. */
  updatedAt: string
}

/** One piece of media a skill references. */
export interface SkillAsset {
  /** The recorded reference: a remote URL, or a path relative to the hub home. */
  ref: string
  kind: "image" | "video"
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
  /** Keep only skills from this origin. */
  source?: SkillOrigin
  sort?: SkillSort
}

/** Rows per origin for the query's other filters, plus their sum. */
export interface SkillCounts extends Record<SkillOrigin, number> {
  all: number
}

/** One page of the catalog. */
export interface SkillPage {
  items: SkillSummary[]
  /** Rows matching the query, before paging. */
  total: number
  /**
   * Rows per origin, so a tab row can label every choice with its size. Counts
   * describe the tag and search filters, not the origin filter itself.
   */
  counts: SkillCounts
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

/** One skill a package offers, before anything is written to disk. */
export interface PackageSkill {
  name: string
  description: string
}

/** What one download or folder import put into the library, and what it refused. */
export interface SkillImport {
  /** Skills now in the library, under the name they took on disk. */
  installed: string[]
  /** Entries that did not land, each with a reason fit to show. */
  failed: { name: string; reason: string }[]
}

/** One file of a folder a person dropped, as their browser read it. */
export interface ImportedFile {
  /** Path relative to the dropped folder, `/`-separated; first segment is the skill. */
  path: string
  /** The file's bytes in base64, because the body carrying them is JSON. */
  base64: string
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
  /** Delete the skill: its directory, and every file the hub stores for it. */
  remove(id: string): Promise<void>
  /**
   * The skills a package offers, read without writing anything — what the
   * download list shows before a person picks.
   */
  listPackage(source: string): Promise<PackageSkill[]>
  /**
   * Download the named skills from a package into this library and index them.
   * An empty list takes everything the package holds.
   */
  installPackage(source: string, skills: string[]): Promise<SkillImport>
  /** Take over a dropped folder: its files, keyed by their path in the drop. */
  importFolder(files: ImportedFile[]): Promise<SkillImport>
  /** Read one text file inside the skill directory. */
  readFile(id: string, path: string): Promise<string>
  /** Replace one text file inside the skill directory. */
  writeFile(id: string, path: string, text: string): Promise<void>
  /** Take over one uploaded file, record it last, and answer with its reference. */
  putAsset(id: string, file: File): Promise<SkillAsset>
  /**
   * Add one pasted source. A remote address is recorded as it is; a `data:`
   * source is stored as a file the hub owns.
   */
  addAssetSource(id: string, source: string): Promise<SkillAsset>
  /** Drop one reference, deleting the stored file when the hub owns it. */
  deleteAsset(id: string, ref: string): Promise<void>
  /** The URL that shows one reference; a remote URL passes through unchanged. */
  assetUrl(ref: string): string
  /** Change notifications from directory watching; returns an unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Release the directory watcher. The store is unusable afterwards. */
  dispose(): void
}
