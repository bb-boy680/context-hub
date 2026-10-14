/**
 * The Add-plugin dialog: two ways in, one list — the same shape the skills
 * module offers, because both ask the same question.
 *
 * An address is typed and collected at once: this hub takes one pack per address,
 * so there is nothing to choose between and nothing to look up first. A folder is
 * dropped or chosen instead, and this page reads it: a browser is told nothing
 * about where a folder sits, only what is inside it, so the folder travels to the
 * host as its files and the pack's identity comes from the manifest the host
 * reads there. Either way what lands is shown as one row, named by the pack
 * itself, and the library is read again once it is in.
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

import type { PackUploadFile, PluginCollected } from "./library.ts"

/** Which way the dialog takes plugins in. */
export type AddPluginTab = "address" | "local"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

const segments: { value: AddPluginTab; labelKey: string; icon: ExtensionIcon }[] = [
  { value: "address", labelKey: "plugins.add.segment.address", icon: PackageIcon },
  { value: "local", labelKey: "plugins.add.segment.local", icon: FolderIcon },
]

/**
 * One row the list draws: what this folder holds, and its own action. A row that
 * has already been acted on keeps its place but offers nothing further.
 */
interface Row {
  name: string
  detail: string
  /** What this row's own action does, or `null` when the row has already been acted on. */
  add: (() => Promise<PluginCollected>) | null
}

/** A folder this page has read, waiting to be collected. */
interface ChosenFolder {
  name: string
  files: PackUploadFile[]
}

/** One file inside a chosen folder, before it is read. */
interface ReadFile {
  path: string
  file: File
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
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-raised ring-1 ring-border ring-inset">
        <ScrollTextIcon className="size-[17px] text-copy" aria-hidden />
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
function base64Of(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("a file could not be read"))
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.readAsDataURL(file)
  })
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
 * name is the pack's name, and its files travel relative to it.
 *
 * @returns the folder, or `null` when what was dropped was not one folder — loose files have no folder to name a pack.
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
  return read.length === 0 ? null : { name: only.name, files: await uploadsOf(read) }
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
       the folder that was chosen; that folder's own name is the pack's. */
    const segments = file.webkitRelativePath.split("/")
    const inner = segments.slice(1).join("/")
    if (inner === "") continue
    read.push({ path: inner, file })
  }
  const name = files[0]?.webkitRelativePath.split("/")[0] ?? ""
  return read.length === 0 || name === "" ? null : { name, files: await uploadsOf(read) }
}

/** Read every file's bytes, which is what the host stages the pack from. */
async function uploadsOf(read: readonly ReadFile[]): Promise<PackUploadFile[]> {
  const files: PackUploadFile[] = []
  for (const entry of read) {
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
  /** Collect the pack a folder holds, and answer with what became of it. */
  onAddFolder: (name: string, files: readonly PackUploadFile[]) => Promise<PluginCollected>
}) {
  const { t } = useI18n()
  const pickerRef = React.useRef<HTMLInputElement>(null)
  /** The address being typed. */
  const [source, setSource] = React.useState("")
  /** The address press is running. */
  const [asking, setAsking] = React.useState(false)
  /** The folder this page read, or `null` before one was chosen. */
  const [folder, setFolder] = React.useState<ChosenFolder | null>(null)
  /** The folder's own action is running. */
  const [storing, setStoring] = React.useState(false)
  const [reading, setReading] = React.useState(false)

  /** Closing always clears the dialog, so the next open starts from nothing. */
  const close = (next: boolean) => {
    if (!next) {
      setSource("")
      setFolder(null)
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

  /** The one row the chosen folder draws, which is the pack it holds. */
  const folderRow: Row | null =
    folder === null
      ? null
      : {
          name: folder.name,
          detail: t("plugins.add.found").replace("{count}", String(folder.files.length)),
          add: () =>
            onAddFolder(folder.name, folder.files).then((collected) => {
              if (!collected.already) close(false)
              return collected
            }),
        }

  const rows = folderRow === null ? null : [folderRow]

  const list =
    rows === null ? (
      <ListState
        text={tab === "local" ? t("plugins.add.pick") : t("plugins.add.ask")}
        icon={tab === "local" ? FolderOpenIcon : PackageIcon}
      />
    ) : (
      <ul className="scrollbar-gutter-stable max-h-[360px] shrink-0 overflow-y-auto">
        {rows.map((row) => (
          <InstallRow
            key={row.name}
            row={row}
            working={storing}
            onAdd={() => {
              setStoring(true)
              /* A failure keeps the folder where it is: what has to change is the
                 folder, and the page's notice is what says why. */
              void row
                .add?.()
                .catch(() => undefined)
                .finally(() => {
                  setStoring(false)
                })
            }}
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
                    {t("plugins.add.found").replace("{count}", String(folder.files.length))}
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
