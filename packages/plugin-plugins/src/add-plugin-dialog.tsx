/**
 * The Add-plugin dialog: two ways in, one list — the same shape the skills
 * module offers, because both ask the same question.
 *
 * An address is typed and collected at once: this hub takes one pack per address,
 * so there is nothing to choose between and nothing to look up first. A folder is
 * dropped or chosen instead, and this page reads it: a browser is told nothing
 * about where a folder sits, only what is inside it, so the folder travels to the
 * host as its files and the pack's identity comes from the manifest the host
 * reads there. Either way the library is read again once a pack is in.
 *
 * A folder is not one pack: it may be a pack itself, or a repository of them.
 * Which one it is comes from where the manifests sit, and every pack found is
 * offered on its own row, because each is collected separately — one pack per
 * address, and a folder of them is not an address.
 */
import {
  FolderIcon,
  FolderOpenIcon,
  FolderUpIcon,
  PackageIcon,
  PlusIcon,
  ScrollTextIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import { assetKind, assetLimit } from "@workspace/core"
import type { ExtensionIcon } from "@workspace/extensions"
import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Spinner } from "@workspace/ui/components/spinner"

import { PLUGIN_MANIFESTS } from "./contract.ts"
import { dataUrlOf } from "./library.ts"
import type { PackUploadFile, PluginCollected } from "./library.ts"
import { bestPicture, pictureOf } from "./pictures.ts"
import type { PackPicture } from "./pictures.ts"

/** Which way the dialog takes plugins in. */
export type AddPluginTab = "address" | "local"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

/**
 * How far below the chosen folder a pack may sit and still be looked for.
 *
 * Packs are kept beside each other at a repository's top level, or under one
 * directory that groups them; a depth that covers both, without walking a whole
 * checkout to its leaves.
 */
const SCAN_DEPTH = 4

const segments: { value: AddPluginTab; labelKey: string; icon: ExtensionIcon }[] = [
  { value: "address", labelKey: "plugins.add.segment.address", icon: PackageIcon },
  { value: "local", labelKey: "plugins.add.segment.local", icon: FolderIcon },
]

/**
 * One row the list draws: what this pack says it is, and its own action. A row
 * that has already been acted on keeps its place but offers nothing further.
 */
interface Row {
  /** What this row is known by, which is not its name: two packs may share one. */
  key: string
  name: string
  detail: string
  /** The picture the pack ships, as a URL, or `null` when it ships none this hub would keep. */
  picture: string | null
  /** What this row's own action does, or `null` when the row has already been acted on. */
  add: (() => Promise<void>) | null
}

/** A folder this page has read, and the packs the scan found in it. */
interface ChosenFolder {
  name: string
  /** Every file the page read, for what the header says was looked at. */
  read: number
  packs: readonly Candidate[]
}

/** One file inside a chosen folder, before it is read. */
interface ReadFile {
  path: string
  file: File
}

/**
 * One pack a scan found, with what its own files say about it.
 *
 * A pack is a directory carrying a manifest, and it owns everything below it, so
 * the files travel with it rather than being re-gathered when it is added.
 */
interface Candidate {
  /** What is recorded as where it came from: the chosen folder's name, and the path under it. */
  from: string
  /** What the pack calls itself, or the directory's own name when its manifest gives none. */
  name: string
  /** What the pack says about itself, or `""`. */
  about: string
  /** The picture it ships, as a URL a row can draw, or `null`. */
  picture: string | null
  /** Every file under it, with the path each keeps inside the pack. */
  files: readonly ReadFile[]
}

/** One directory of a chosen folder, as the scan reads it. */
interface TreeNode {
  /** Its path inside the chosen folder, `""` at the root. */
  dir: string
  /** The files directly inside it. */
  files: ReadFile[]
  /** The directories directly inside it, by name. */
  children: Map<string, TreeNode>
}

/**
 * The two ways in, as one trough with a raised chip on it. The chip is the
 * canvas colour, not ink: this control selects, it does not act.
 */
function SegmentRow({
  tab,
  onTabChange,
}: {
  tab: AddPluginTab
  onTabChange: (tab: AddPluginTab) => void
}) {
  const { t } = useI18n()

  return (
    <div className="px-5 pb-4">
      <div className="flex h-9 gap-1 rounded-full bg-surface-raised p-[3px]">
        {segments.map((segment) => (
          <button
            key={segment.value}
            type="button"
            role="tab"
            aria-selected={tab === segment.value}
            onClick={() => onTabChange(segment.value)}
            className={`flex h-[30px] flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] transition-colors ${
              tab === segment.value
                ? "bg-card font-semibold text-foreground ring-1 ring-border"
                : "font-medium text-copy hover:text-foreground"
            }`}
          >
            <segment.icon className="size-3.5 shrink-0" aria-hidden />
            {t(segment.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * One candidate: what it is called, what it holds, and its own install action.
 * The row shape serves both segments, because both ask the same question.
 */
function InstallRow({
  row,
  working,
  onAdd,
}: {
  row: Row
  /** This row's own action is running, which the button says by turning. */
  working: boolean
  onAdd: () => void
}) {
  const { t } = useI18n()

  return (
    <li className="flex h-[68px] items-center gap-3.5 border-b border-border px-5 last:border-b-0">
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-surface-raised ring-1 ring-border ring-inset">
        {row.picture === null ? (
          <ScrollTextIcon className="size-[17px] text-copy" aria-hidden />
        ) : (
          /* The row already says the pack's name, so the picture is decoration. */
          <img src={row.picture} alt="" className="size-full object-cover" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate font-mono text-[13.5px] leading-[18px] font-semibold">
          {row.name}
        </span>
        {row.detail === "" ? null : (
          <span className="truncate text-[12px] leading-[15px] text-muted-foreground">
            {row.detail}
          </span>
        )}
      </div>
      {row.add === null ? null : (
        <Button
          type="button"
          variant="outline"
          disabled={working}
          aria-label={`${t("plugins.action.install")} ${row.name}`}
          onClick={onAdd}
          className="h-[30px] shrink-0 gap-1.5 rounded-full bg-secondary px-3.5 text-[12.5px] font-semibold text-foreground hover:bg-accent"
        >
          {working ? (
            <Spinner className="size-[13px]" />
          ) : (
            <PlusIcon className="size-[13px]" />
          )}
          {t("plugins.action.install")}
        </Button>
      )}
    </li>
  )
}

/**
 * The one line a list shows instead of rows: what to do to get some, or that
 * there were none to find.
 */
function ListState({ text, icon: Icon }: { text: string; icon?: ExtensionIcon }) {
  return (
    <div className="flex items-center gap-2 px-5 py-7 text-[12px]">
      {Icon === undefined ? null : <Icon className="size-3.5 text-muted-soft" aria-hidden />}
      <span className="text-muted-foreground">{text}</span>
    </div>
  )
}

/** One file's bytes, as the base64 the request body carries. */
async function base64Of(file: File): Promise<string> {
  return (await dataUrlOf(file)).split(",")[1] ?? ""
}

/** One entry's own File, which the entry API answers with asynchronously. */
function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

/** Every entry directly inside one directory; the reader answers in batches, and an empty one is the end. */
function childrenOf(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = entry.createReader()
    const found: FileSystemEntry[] = []
    const more = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(found)
          return
        }
        found.push(...batch)
        more()
      }, reject)
    }
    more()
  })
}

/**
 * Every file under one entry, with the path it keeps inside the folder. `.git`
 * and `node_modules` are left out, which is the rule the host already applies
 * when it copies a directory: neither is part of a pack.
 */
async function walk(entry: FileSystemEntry, prefix: string, into: ReadFile[]): Promise<void> {
  if (entry.name === ".git" || entry.name === "node_modules") return
  const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`
  if (entry.isFile) {
    into.push({ path, file: await fileOf(entry as FileSystemFileEntry) })
    return
  }
  for (const child of await childrenOf(entry as FileSystemDirectoryEntry)) {
    await walk(child, path, into)
  }
}

/**
 * Read a dropped folder, keeping the folder itself apart from what is in it: its
 * name is what the packs found inside are named from, and its files travel
 * relative to it.
 *
 * @returns the folder, or `null` when what was dropped was not one folder — loose files have no folder to scan.
 */
async function readDropped(transfer: DataTransfer): Promise<ChosenFolder | null> {
  const roots = [...transfer.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null)
  /* A form without the entry API still reports a dropped folder as its files,
     each named by its path from that folder; the picker's rule reads those. */
  if (roots.length === 0) return readChosen([...transfer.files])
  const only = roots.length === 1 ? roots[0] : undefined
  if (only === undefined || !only.isDirectory) return null
  const read: ReadFile[] = []
  for (const child of await childrenOf(only as FileSystemDirectoryEntry)) {
    await walk(child, "", read)
  }
  return read.length === 0 ? null : found(only.name, read)
}

/**
 * Read a chosen folder's files, keeping each one's path inside it.
 *
 * @returns the folder, or `null` when the choice held nothing.
 */
async function readChosen(files: readonly File[]): Promise<ChosenFolder | null> {
  const read: ReadFile[] = []
  for (const file of files) {
    /* A chosen directory arrives as every file under it, named by its path from
       the folder that was chosen; that folder's own name is what the scan reads
       from. */
    const segments = file.webkitRelativePath.split("/")
    const inner = segments.slice(1).join("/")
    if (inner === "") continue
    read.push({ path: inner, file })
  }
  const name = files[0]?.webkitRelativePath.split("/")[0] ?? ""
  return read.length === 0 || name === "" ? null : found(name, read)
}

/** Read one chosen folder into what it is called and the packs it holds. */
async function found(name: string, read: readonly ReadFile[]): Promise<ChosenFolder> {
  return { name, read: read.length, packs: await scanPacks(name, read) }
}

/** Arrange one folder's files into the directories they sit in. */
function treeOf(read: readonly ReadFile[]): TreeNode {
  const root: TreeNode = { dir: "", files: [], children: new Map() }
  for (const file of read) {
    const segments = file.path.split("/")
    segments.pop()
    let at = root
    for (const segment of segments) {
      const below = at.children.get(segment)
      if (below === undefined) {
        const next: TreeNode = {
          dir: at.dir === "" ? segment : `${at.dir}/${segment}`,
          files: [],
          children: new Map(),
        }
        at.children.set(segment, next)
        at = next
        continue
      }
      at = below
    }
    at.files.push(file)
  }
  return root
}

/** The file at one `/`-separated path below a directory, or `null` when there is none. */
function fileAt(dir: TreeNode, relative: string): ReadFile | null {
  const segments = relative.split("/")
  const file = segments.pop() ?? ""
  let at = dir
  for (const segment of segments) {
    const below = at.children.get(segment)
    if (below === undefined) return null
    at = below
  }
  const path = at.dir === "" ? file : `${at.dir}/${file}`
  return at.files.find((one) => one.path === path) ?? null
}

/**
 * Read the manifest a directory is a pack by.
 *
 * The rule the host applies, applied here: a manifest names a pack when it gives
 * a name or a version. A repository root often carries a `plugin.json` for its
 * own tooling, and reading that as a pack would offer a row the library then
 * refuses.
 *
 * @param dir — the directory to read in.
 * @returns the manifest that names it, or `null` when none does.
 */
async function manifestOf(dir: TreeNode): Promise<Record<string, unknown> | null> {
  for (const relative of PLUGIN_MANIFESTS) {
    const found = fileAt(dir, relative)
    if (found === null) continue
    const raw = await found.file.text().catch(() => null)
    if (raw === null) continue
    let manifest: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== "object" || parsed === null) continue
      manifest = parsed as Record<string, unknown>
    } catch {
      /* A manifest this page cannot read is one the host will refuse; the pack is
         left out rather than offered under a name that will not be taken. */
      continue
    }
    const named = typeof manifest.name === "string" && manifest.name !== ""
    if (named || typeof manifest.version === "string") return manifest
  }
  return null
}

/**
 * The picture one pack ships, as a URL a row can draw.
 *
 * The rule in `../pictures.ts` — the one the host copies a picture into the asset
 * library by — over the files this page has already read, and the same size limit
 * the host applies, so a row never draws one the library would decline to keep.
 */
async function pictureFor(pack: Candidate): Promise<string | null> {
  const found: PackPicture[] = []
  for (const file of pack.files) {
    const picture = pictureOf(file.path, file.path.split("/").length)
    if (picture !== null) found.push(picture)
  }
  const best = bestPicture(found)
  if (best === undefined) return null
  const file = pack.files.find((one) => one.path === best.relative)
  if (file === undefined) return null
  if (file.file.size > assetLimit(assetKind(best.relative))) return null
  return await dataUrlOf(file.file).catch(() => null)
}

/**
 * Every file under one directory, with the paths it keeps inside that directory.
 *
 * The directory the call started from is what every path is cut back to, not the
 * one each file happens to sit in: a pack's files keep their path inside the pack,
 * wherever in it they are.
 *
 * @param dir — the directory to read.
 * @param root — the directory the paths are relative to, which is `dir` itself on the first call.
 */
function filesUnder(dir: TreeNode, root = dir.dir): ReadFile[] {
  const cut = root === "" ? 0 : root.length + 1
  const found = dir.files.map((one) => ({ ...one, path: one.path.slice(cut) }))
  for (const below of dir.children.values()) found.push(...filesUnder(below, root))
  return found
}

/**
 * One directory as a pack, with what its own files say about it.
 *
 * @param node — the directory.
 * @param chosen — the chosen folder's own name, which is what a pack at its root is called when its manifest gives no name.
 * @returns the pack, or `null` when the directory is not one.
 */
async function packIn(node: TreeNode, chosen: string): Promise<Candidate | null> {
  const manifest = await manifestOf(node)
  if (manifest === null) return null
  const pack: Candidate = {
    from: node.dir === "" ? chosen : `${chosen}/${node.dir}`,
    name:
      typeof manifest.name === "string" && manifest.name !== ""
        ? manifest.name
        : node.dir === ""
          ? chosen
          : (node.dir.split("/").pop() ?? chosen),
    about: typeof manifest.description === "string" ? manifest.description : "",
    picture: null,
    files: filesUnder(node),
  }
  return { ...pack, picture: await pictureFor(pack) }
}

/**
 * The packs one chosen folder holds.
 *
 * A folder that is a pack is that one pack, whatever sits below it: a pack's own
 * subdirectories belong to it, and offering them apart would offer the same
 * plugin twice. Otherwise the folder is a place packs are kept — a repository of
 * them, most often — and every directory a manifest names is one. Reading stops
 * at a pack for the same reason.
 *
 * @param name — the chosen folder's own name.
 * @param read — every file the page read out of it.
 * @returns the packs found, in path order, each with the label its record keeps.
 */
async function scanPacks(name: string, read: readonly ReadFile[]): Promise<Candidate[]> {
  const root = treeOf(read)
  const whole = await packIn(root, name)
  if (whole !== null) return [whole]
  const packs: Candidate[] = []
  const descend = async (dir: TreeNode, depth: number): Promise<void> => {
    if (depth > SCAN_DEPTH) return
    const below = [...dir.children.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )
    for (const [, child] of below) {
      const pack = await packIn(child, name)
      if (pack !== null) {
        packs.push(pack)
        continue
      }
      await descend(child, depth + 1)
    }
  }
  await descend(root, 1)
  return packs
}

/**
 * Read every file's bytes, named by the path it keeps inside its own pack.
 *
 * What the scan gathered is already relative to the pack it belongs to, so the
 * paths travel as they are: cutting the pack's path off a second time would read
 * a file near the pack root as no path at all.
 */
async function uploadsOf(pack: Candidate): Promise<PackUploadFile[]> {
  const files: PackUploadFile[] = []
  for (const entry of pack.files) {
    files.push({ path: entry.path, base64: await base64Of(entry.file) })
  }
  return files
}

export function AddPluginDialog({
  open,
  tab,
  onTabChange,
  onOpenChange,
  onAdd,
  onAddFolder,
}: {
  open: boolean
  tab: AddPluginTab
  onTabChange: (tab: AddPluginTab) => void
  onOpenChange: (open: boolean) => void
  /** Collect the pack an address names, and answer with what became of it. */
  onAdd: (source: string) => Promise<PluginCollected>
  /**
   * Collect one pack the scan found in a folder, and answer with what became of
   * it. A folder may hold several, so this is called once per pack.
   */
  onAddFolder: (from: string, files: readonly PackUploadFile[]) => Promise<PluginCollected>
}) {
  const { t } = useI18n()
  const pickerRef = React.useRef<HTMLInputElement>(null)
  /** The address being typed. */
  const [source, setSource] = React.useState("")
  /** The address press is running. */
  const [asking, setAsking] = React.useState(false)
  /** The folder this page read, or `null` before one was chosen. */
  const [folder, setFolder] = React.useState<ChosenFolder | null>(null)
  /** The packs of that folder already added, by the label their record keeps. */
  const [added, setAdded] = React.useState<readonly string[]>([])
  /** One row's own action is running. */
  const [storing, setStoring] = React.useState<string | null>(null)
  const [reading, setReading] = React.useState(false)

  /** Closing always clears the dialog, so the next open starts from nothing. */
  const close = (next: boolean) => {
    if (!next) {
      setSource("")
      setFolder(null)
      setAdded([])
    }
    onOpenChange(next)
  }

  /**
   * Collect what the address names.
   *
   * A press that does not end in a new pack leaves the dialog open: either the
   * pack was already here, and the address may not be the one the person meant,
   * or it failed, and the address is exactly what has to change. What happened is
   * said by the page's notice; this dialog only decides whether to stay. A new
   * pack is the end of its business, so it closes.
   */
  const submit = async () => {
    setAsking(true)
    try {
      const collected = await onAdd(source.trim())
      if (!collected.already) close(false)
    } catch {
      /* The address stays, so the person can correct it where it is. */
    } finally {
      setAsking(false)
    }
  }

  /** Read a folder, leaving the drop zone up when there was nothing usable in it. */
  const accept = async (read: () => Promise<ChosenFolder | null>) => {
    setReading(true)
    try {
      const chosen = await read()
      if (chosen === null) return
      setFolder(chosen)
    } finally {
      setReading(false)
    }
  }

  const browse = () => pickerRef.current?.click()

  const picker = (
    <input
      ref={pickerRef}
      type="file"
      multiple
      aria-label={t("plugins.add.browse")}
      className="sr-only"
      {...{ webkitdirectory: "", directory: "" }}
      onChange={(event) => {
        const input = event.target
        const files = [...(input.files ?? [])]
        input.value = ""
        void accept(() => readChosen(files))
      }}
    />
  )

  /**
   * Add one pack the scan found, and keep the list up while others remain.
   *
   * A pack that landed is done with, and the row says so by losing its action
   * rather than disappearing: the rest of what the folder holds is still to be
   * answered, and a row that vanished would read as the scan having changed.
   * Once the last one is in, the dialog has nothing left to ask, so it closes.
   */
  const add = async (pack: Candidate) => {
    setStoring(pack.from)
    try {
      const collected = await onAddFolder(pack.from, await uploadsOf(pack))
      if (collected.already) return
      const done = [...added, pack.from]
      setAdded(done)
      if (folder !== null && done.length === folder.packs.length) close(false)
    } catch {
      /* A failure keeps the list where it is: what has to change is the folder,
         and the page's notice is what says why. */
    } finally {
      setStoring(null)
    }
  }

  /** What one pack is called, and what it says about itself. */
  const rowsOf = (chosen: ChosenFolder): Row[] =>
    chosen.packs.map((pack) => ({
      key: pack.from,
      name: pack.name,
      picture: pack.picture,
      /* What the pack says about itself, and where it sat when it says nothing: a
         row still has to answer "which one is this". */
      detail: pack.about !== "" ? pack.about : pack.from === chosen.name ? "" : pack.from,
      add: added.includes(pack.from) ? null : () => add(pack),
    }))

  /* The rows belong to the folder that was read, so they are shown on the segment
     that reads one; the address segment asks for an address and nothing else. */
  const rows = folder === null || tab !== "local" ? null : rowsOf(folder)

  const list =
    rows === null ? (
      <ListState
        text={tab === "local" ? t("plugins.add.pick") : t("plugins.add.ask")}
        icon={tab === "local" ? FolderOpenIcon : PackageIcon}
      />
    ) : rows.length === 0 ? (
      <ListState text={t("plugins.add.none")} icon={FolderIcon} />
    ) : (
      <ul className="scrollbar-gutter-stable max-h-[360px] shrink-0 overflow-y-auto">
        {rows.map((row) => (
          <InstallRow
            key={row.key}
            row={row}
            working={storing === row.key}
            onAdd={() => void row.add?.()}
          />
        ))}
      </ul>
    )

  /** A press is worth making once there is an address and nothing else is running. */
  const canTake = source.trim() !== "" && !asking && !reading

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-xl bg-dialog p-0 shadow-soft ring-1 ring-border sm:max-w-[640px]"
      >
        <div className="flex min-h-24 items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <DialogTitle className="text-[16px] leading-[19px] font-semibold">
              {t("plugins.add.title")}
            </DialogTitle>
            <DialogDescription className="text-[12.5px] leading-[19px] text-muted-foreground">
              {t("plugins.add.description")}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            className="size-[30px] shrink-0 rounded-full"
            aria-label={t("plugins.action.close")}
            onClick={() => close(false)}
          >
            <XIcon className="size-4 text-copy" />
          </Button>
        </div>

        <SegmentRow tab={tab} onTabChange={onTabChange} />

        {tab === "local" ? (
          folder === null ? (
            /* Nothing chosen yet, so the drop target is the whole area and
               browsing is its one button. */
            <div className="px-5 pb-5">
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const transfer = event.dataTransfer
                  void accept(() => readDropped(transfer))
                }}
                className="flex h-56 flex-col items-center justify-center gap-3 rounded-md bg-surface-raised px-6 text-center ring-1 ring-border ring-inset"
              >
                <FolderUpIcon className="size-7 text-muted-soft" aria-hidden />
                <span className="text-[15.5px] leading-[20px] font-semibold">
                  {t("plugins.add.dropTitle")}
                </span>
                <span className="text-[13px] leading-[17px] text-copy">
                  {t("plugins.add.dropHint")}
                </span>
                <Button
                  className="mt-1 h-10 gap-2 rounded-full px-[18px] text-[13.5px] font-semibold"
                  disabled={reading}
                  onClick={browse}
                >
                  <FolderOpenIcon className="size-[15px]" />
                  {t("plugins.add.browse")}
                </Button>
              </div>
            </div>
          ) : (
            /* Where this list came from, and the one way to change it. */
            <div className="px-5 py-4">
              <div className="flex h-16 items-center gap-3 rounded-lg bg-surface-raised px-4 ring-1 ring-border">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-card ring-1 ring-border ring-inset">
                  <FolderIcon className="size-[17px] text-copy" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate font-mono text-[13.5px] leading-[18px] font-semibold">
                    {folder.name}
                  </span>
                  <span className="truncate text-[12px] leading-[15px] text-muted-foreground">
                    {t("plugins.add.found")
                      .replace("{packs}", String(folder.packs.length))
                      .replace("{count}", String(folder.read))}
                  </span>
                </div>
                <Button
                  variant="outline"
                  disabled={reading}
                  className={`h-8 shrink-0 gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${outline}`}
                  onClick={browse}
                >
                  <FolderOpenIcon className="size-3.5" />
                  {t("plugins.add.repick")}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-input px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                <PackageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  id="plugin-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canTake) void submit()
                  }}
                  placeholder={t("plugins.add.sourcePlaceholder")}
                  aria-label={t("plugins.add.source")}
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-soft"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!canTake}
                aria-label={t("plugins.action.install")}
                aria-busy={asking}
                onClick={() => void submit()}
                className="h-12 shrink-0 gap-2 rounded-full bg-secondary px-5 text-[13.5px] font-semibold text-foreground hover:bg-accent"
              >
                {asking ? (
                  <Spinner className="size-[15px]" />
                ) : (
                  <PlusIcon className="size-[15px]" />
                )}
                {t("plugins.action.install")}
              </Button>
            </div>
          </div>
        )}

        <div className="h-px shrink-0 bg-border" />
        {list}
        {picker}
      </DialogContent>
    </Dialog>
  )
}
