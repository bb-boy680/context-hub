/**
 * The skill library seam. One implementation reads and writes the disk
 * directly in the process that owns it; the browser and desktop forms only
 * carry the same calls over their own channel, so nothing here assumes a
 * transport.
 */

/** Where a skill came from: this machine, the hub build, or a registry. */
export type SkillOrigin = "local" | "builtin" | "registry"

/**
 * The upstream a skill was installed from, as the skills CLI records it in
 * `skills-lock.json`. It is the only thing that makes an update askable: the
 * `hash` is what the CLI computed over the skill's files at install time, so a
 * later run over the same source tells whether the upstream moved, and a run
 * over the local copy tells whether the files here were changed by hand.
 */
export interface SkillUpstream {
  /** The package the CLI was given: `owner/repo`, or a git URL. */
  source: string
  /** How the CLI classified it: `github`, `git`, or a local path. */
  sourceType: string
  /** The manifest's path inside that package, forward slashes. */
  skillPath: string
  /** Directory hash of the installed revision; what updates are measured against. */
  hash: string
}
/**
 * One check's answer, kept on the row: what the source held when it was asked,
 * and what the files here held at that same moment. Both are a record of that
 * check, not a claim about now, which is why the `at` time travels with them.
 */
export interface SkillCheck {
  /** When the source was asked. */
  at: string
  /** The source's revision hash as of then. */
  latest: string
  /** The directory hash of the local files as of then. */
  currentHash: string
}
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
  /**
   * The directory this entry is a link to, absolute, when the hub linked the
   * skill in from somewhere else rather than holding the files itself. The
   * files belong to wherever this points.
   */
  link?: string
  /** Where the files came from, when anything recorded it; absent on a skill
      written here or copied in by hand, which is why it cannot be checked. */
  upstream?: SkillUpstream
  /** The last time a source was asked about this skill, and what it held. */
  checked?: SkillCheck
  /**
   * ISO timestamp of the last recorded change to the hub's own copy, empty for
   * a linked skill: the hub has changed nothing about files it does not hold,
   * so it has no date to report and the row sorts among the undated ones.
   */
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
  /** What each landed skill came from, by name; absent for what it does not know. */
  records?: Record<string, SkillUpstream>
}

/** One skill measured against its upstream. */
export interface SkillUpdateCheck {
  /** The directory hash recorded when the skill was installed or last updated. */
  recordedHash: string
  /** The directory hash of the files on disk now. */
  currentHash: string
  /** The upstream revision's directory hash. */
  latestHash: string
  /** The upstream holds a revision this copy does not have. */
  outdated: boolean
  /** The files on disk differ from the recorded revision. */
  modified: boolean
}

/** What one batch check found across the library. */
export interface SkillUpdateSummary {
  /** Skills whose source answered and whose answer was recorded. */
  checked: number
  /** Of those, how many the source has moved past. */
  outdated: number
  /** Skills whose source could not be read, each with the reason; the rest
      still ran, so one unreachable package does not silence the others. */
  failed: { name: string; reason: string }[]
}

/** One file of a folder read, relative to the skill directory it belongs to. */
export interface ImportedFile {
  path: string
  /** The file's bytes in base64, because the body carrying them is JSON. */
  base64: string
}

/** One skill a folder read produced, ready for the host to write. */
export interface ImportedSkill {
  /** The directory name the skill takes in the library. */
  name: string
  /** Everything under it, manifest included. */
  files: ImportedFile[]
}

/** Where a skill in a workspace came from. */
export type WorkspaceSkillOrigin =
  /** Installed from the library by this hub, as a link into it. */
  | "hub"
  /** The project's own directory; the hub reads it and leaves it alone. */
  | "own"
  /** A link into the library whose skill is gone; only cleanup can follow. */
  | "stale"

/** One skill the current workspace holds, as `<workspace>/.agents/skills` has it. */
export interface WorkspaceSkill {
  /** Directory name under the workspace's skills root. */
  id: string
  name: string
  description: string
  origin: WorkspaceSkillOrigin
  /** Where a link points, for a skill this workspace holds as one. */
  link?: string
}

/** The skills of one workspace, read without changing anything. */
export interface WorkspaceSkillsView {
  /** The workspace's own skills directory, absolute. */
  root: string
  /** The same path as a person reads it. */
  display: string
  skills: WorkspaceSkill[]
}

/** One workspace skill with its files, read where it lives. */
export interface WorkspaceSkillDetail {
  /** Directory name under the workspace's skills root. */
  id: string
  name: string
  description: string
  /** SKILL.md as it is written on disk, frontmatter included. */
  text: string
  files: SkillFileEntry[]
}

/** How an install landed: as a link, or as a copy the workspace now owns. */
export type WorkspaceInstall = "link" | "copy"

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
  /** Take over the skills a folder read produced, writing each into the library. */
  importFolder(skills: ImportedSkill[]): Promise<SkillImport>
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
  /**
   * The skills the current workspace holds, or `null` when none is selected or
   * the selected one has no folder path to read.
   */
  workspaceSkills(): Promise<WorkspaceSkillsView | null>
  /**
   * One skill the current workspace holds, read where it lives; `null` when the
   * folder holds no such skill. A workspace skill is not in the library, so this
   * is the only way to show its own manifest and files.
   */
  workspaceSkill(id: string): Promise<WorkspaceSkillDetail | null>
  /**
   * One text file of a skill the current workspace holds, read where it lives.
   * A linked skill's files belong to the library, but they are read through
   * this too: the path is the one the workspace sees.
   */
  workspaceFile(id: string, path: string): Promise<string>
  /** Put one library skill into the current workspace; answers how it landed. */
  installToWorkspace(id: string): Promise<WorkspaceInstall>
  /**
   * Link one skill the current workspace holds into the library; the workspace
   * keeps its own directory. Answers how it landed: a link, or a copy where the
   * filesystem cannot hold one.
   */
  importFromWorkspace(id: string): Promise<WorkspaceInstall>
  /**
   * Delete one skill from the current workspace folder, its directory included.
   * This is the destructive one; `removeFromWorkspace` only takes back a link.
   */
  deleteWorkspaceSkill(id: string): Promise<void>
  /** Take one library-installed skill out of the current workspace. */
  removeFromWorkspace(id: string): Promise<void>
  /**
   * Measure one skill against the upstream it was installed from. Reads the
   * source over the network, so it is asked for, never automatic. The answer
   * is recorded on the row, where a badge and the detail dialog read it back.
   */
  checkUpdate(id: string): Promise<SkillUpdateCheck>
  /**
   * Measure every skill that records a source against it — one CLI run per
   * source, so a package holding several skills is cloned once, not once per
   * skill. Reads over the network, so it is asked for, never automatic; a
   * source that fails is reported without stopping the rest.
   */
  checkUpdates(): Promise<SkillUpdateSummary>
  /**
   * Install the upstream's current revision over the skill's files, wherever
   * they live, and record the new hash. Refuses when nothing recorded a source.
   */
  updateFromUpstream(id: string): Promise<void>
  /** Change notifications from directory watching; returns an unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Release the directory watcher. The store is unusable afterwards. */
  dispose(): void
}
