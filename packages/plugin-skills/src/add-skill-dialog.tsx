import { CheckIcon, DownloadIcon, UploadIcon, XIcon } from "lucide-react"
import * as React from "react"

import {
  DEFAULT_LIMITS,
  filesFromPicker,
  readDrop,
  readFolderFiles,
  scanFolder,
  walkDirectory,
  type DroppedFile,
  type FolderSkill,
  type ScanLimits,
} from "./folder-scan.ts"
import { parsePackageRequest } from "./package-source.ts"
import type { PackageSkill, SkillImport, SkillStore } from "./store.ts"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Spinner } from "@workspace/ui/components/spinner"

import { useI18n } from "@workspace/extensions/react"

/** Which way the dialog takes skills in. */
export type AddSkillTab = "local" | "download"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

const segments: { value: AddSkillTab; labelKey: string }[] = [
  { value: "local", labelKey: "skills.add.segment.local" },
  { value: "download", labelKey: "skills.add.segment.download" },
]

/** What a failure reads like when it reaches the dialog. */
function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure)
}

function SegmentRow({
  tab,
  onTabChange,
}: {
  tab: AddSkillTab
  onTabChange: (tab: AddSkillTab) => void
}) {
  const { t } = useI18n()

  return (
    <div className="px-6 pb-4">
      <div className="flex h-9 gap-1 rounded-lg bg-muted p-1">
        {segments.map((segment) => (
          <button
            key={segment.value}
            type="button"
            role="tab"
            aria-selected={tab === segment.value}
            onClick={() => onTabChange(segment.value)}
            className={`h-7 flex-1 rounded-md text-[13px] transition-colors ${
              tab === segment.value
                ? "bg-accent font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(segment.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** One candidate: what it is called, what it does, and whether this import takes it. */
function SkillRow({
  name,
  description,
  selected,
  installed,
  onToggle,
}: {
  name: string
  description: string
  selected: boolean
  /** Already in this library: it cannot be picked again, and says so. */
  installed: boolean
  onToggle: () => void
}) {
  const { t } = useI18n()

  return (
    <li className="flex h-14 items-center gap-3 pr-3.5 pl-6">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-[13.5px] leading-[17px] font-semibold">
          {name}
        </span>
        {description !== "" && (
          <span className="truncate text-[11.5px] leading-[15px] text-muted-foreground">
            {description}
          </span>
        )}
      </div>
      {installed ? (
        /* Same metrics as the pick button, so the two states line up row to row. */
        <span className="flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium text-muted-foreground">
          <CheckIcon className="size-4 text-chart-2" />
          {t("skills.add.imported")}
        </span>
      ) : (
        <Button
          variant={selected ? "ghost" : "default"}
          aria-pressed={selected}
          aria-label={`${t(selected ? "skills.add.selected" : "skills.add.select")} ${name}`}
          onClick={onToggle}
          className={
            selected
              ? "h-8 shrink-0 gap-1.5 px-2.5 text-xs font-medium"
              : "h-8 shrink-0 px-3.5 text-xs font-medium"
          }
        >
          {selected && <CheckIcon className="text-chart-2" />}
          {t(selected ? "skills.add.selected" : "skills.add.select")}
        </Button>
      )}
    </li>
  )
}

/** The line above a list: how many arrived, and one control for all of them. */
function ListHeader({
  summary,
  allSelected,
  canToggleAll,
  onToggleAll,
}: {
  summary: string
  allSelected: boolean
  /** False when every row is already in the library, so there is nothing to take. */
  canToggleAll: boolean
  onToggleAll: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="flex h-[38px] shrink-0 items-center justify-between gap-3 px-6">
      <span className="truncate text-xs leading-[15px] text-muted-foreground">
        {summary}
      </span>
      <button
        type="button"
        disabled={!canToggleAll}
        onClick={onToggleAll}
        className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {t(allSelected ? "skills.add.clearAll" : "skills.add.selectAll")}
      </button>
    </div>
  )
}

/** The one line a list shows instead of rows: a wait, or a refusal. */
function ListState({ text, busy }: { text: string; busy: boolean }) {
  return (
    <div className="flex items-center gap-2 px-6 py-7 text-xs">
      {busy && <Spinner className="size-3.5" />}
      <span className={busy ? "text-muted-foreground" : "text-destructive"}>{text}</span>
    </div>
  )
}

/** What the current tab has picked, each one removable where it is named. */
function PickedChips({
  picked,
  onRemove,
}: {
  picked: string[]
  onRemove: (name: string) => void
}) {
  const { t } = useI18n()
  if (picked.length === 0) return null

  return (
    <div className="flex max-h-[68px] flex-wrap items-center gap-1.5 overflow-y-auto pr-1.5">
      {picked.map((skill) => (
        <span
          key={skill}
          className="flex h-[21px] items-center gap-1.5 rounded-full bg-muted px-2 font-mono text-[11.5px]"
        >
          {skill}
          <button
            type="button"
            aria-label={`${t("skills.media.remove")} ${skill}`}
            onClick={() => onRemove(skill)}
          >
            <XIcon className="size-3 text-muted-foreground" />
          </button>
        </span>
      ))}
    </div>
  )
}

/**
 * The discard question, anchored to the Cancel button it belongs to. Cancel
 * only asks when the dialog holds something a close would drop: with an empty
 * field and no picks, the same click just closes.
 */
function DiscardBubble({
  open,
  dirty,
  onOpenChange,
  onDiscard,
  children,
}: {
  open: boolean
  dirty: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
  children: React.ReactElement
}) {
  const { t } = useI18n()

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next && dirty)
      }}
    >
      <PopoverTrigger render={children} />
      <PopoverContent
        side="top"
        align="end"
        sideOffset={7}
        className="w-80 gap-2.5 rounded-lg bg-dialog px-4 py-3.5 shadow-[0_8px_24px_#0F172A29] ring-glass-border backdrop-blur-xl"
      >
        <PopoverArrow className="size-3 rotate-45 border-b border-l border-glass-border bg-dialog" />
        <span className="text-[13.5px] leading-[17px] font-semibold">
          {t("skills.add.discard.title")}
        </span>
        <span className="text-xs leading-[15px] text-muted-foreground">
          {t("skills.add.discard.text")}
        </span>
        <div className="flex items-center justify-end gap-2 pt-0.5">
          <Button
            variant="outline"
            size="sm"
            className={`px-3 text-xs ${outline}`}
            onClick={() => onOpenChange(false)}
          >
            {t("skills.add.discard.keep")}
          </Button>
          <Button
            size="sm"
            className="bg-destructive px-3 text-xs text-white hover:bg-destructive/90"
            onClick={onDiscard}
          >
            {t("skills.add.discard.confirm")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The Add-skill dialog: two ways in, one list.
 *
 * Local reads a folder the browser was handed, one skill per subfolder that
 * carries a SKILL.md. Download asks the `skills` CLI what a package holds.
 *
 * Whichever tab is open, the picks in the list are the state that matters:
 * Cancel asks before dropping them, Import counts them and sends exactly them.
 */
export function AddSkillDialog({
  open,
  tab,
  store,
  onTabChange,
  onOpenChange,
  onImported,
}: {
  open: boolean
  tab: AddSkillTab
  /** This form's library; without one the dialog can only say so. */
  store: SkillStore | null
  onTabChange: (tab: AddSkillTab) => void
  onOpenChange: (open: boolean) => void
  /** Called once something landed, so the page can read the catalog again. */
  onImported: () => void
}) {
  const { t } = useI18n()
  const pickerRef = React.useRef<HTMLInputElement>(null)
  /** The folder read in flight; a newer read, or a close, stops it. */
  const folderRead = React.useRef<AbortController | null>(null)

  const [source, setSource] = React.useState("")
  /** The source the package list came from; empty until a listing lands. */
  const [listed, setListed] = React.useState("")
  /** The pins that listing seeded, so a new pin re-seeds without re-running the CLI. */
  const [seeded, setSeeded] = React.useState("")
  /*
   * Picks belong to the tab that made them. A folder's skills and a package's
   * skills are different sets that may share names, so one tab's picks must not
   * render as the other's, nor count toward its Import.
   */
  const [folderPicked, setFolderPicked] = React.useState<string[]>([])
  const [packagePicked, setPackagePicked] = React.useState<string[]>([])
  const picked = tab === "local" ? folderPicked : packagePicked
  const setPicked = tab === "local" ? setFolderPicked : setPackagePicked
  const [packaged, setPackaged] = React.useState<PackageSkill[]>([])
  const [folder, setFolder] = React.useState<FolderSkill[] | null>(null)
  /** True when a bound stopped the read before the folder ran out. */
  const [capped, setCapped] = React.useState(false)
  /** Ids this library already holds, lower-cased for comparison. */
  const [installed, setInstalled] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState<"list" | "import" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState<{ name: string; reason: string }[]>([])
  const [confirming, setConfirming] = React.useState(false)

  /** What the library holds now, so a row can say it is already in. */
  const readInstalled = React.useCallback(async (): Promise<string[]> => {
    if (store === null) return []
    try {
      const page = await store.list({ limit: 1000 })
      return page.items.map((item) => item.id.toLowerCase())
    } catch {
      /* An unreadable library leaves every row selectable; the import itself
         still refuses a name the library holds. */
      return []
    }
  }, [store])

  /* Every open re-reads what the library holds, so the marks are never stale. */
  React.useEffect(() => {
    if (!open) return
    let live = true
    void readInstalled().then((ids) => {
      if (live) setInstalled(ids)
    })
    return () => {
      live = false
    }
  }, [open, readInstalled])

  const dirty =
    tab === "local" ? folder !== null : source.trim() !== "" || picked.length > 0

  const reset = () => {
    folderRead.current?.abort()
    folderRead.current = null
    setSource("")
    setListed("")
    setSeeded("")
    setFolderPicked([])
    setPackagePicked([])
    setPackaged([])
    setFolder(null)
    setCapped(false)
    setBusy(null)
    setError(null)
    setFailed([])
    setConfirming(false)
  }

  /* Closing always clears the dialog, so the next open starts from nothing. */
  const close = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const toggle = (name: string) =>
    setPicked((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    )

  /** Ask the CLI what the package holds, unless that list is already on screen. */
  const handleList = async () => {
    const request = parsePackageRequest(source)
    if (request.source === "") return
    /* The pinned skills are part of the request: changing them re-seeds the picks. */
    const seed = request.skills.join(",")
    if (request.source === listed && seed === seeded) return
    const alreadyListed = request.source === listed
    setListed(request.source)
    setSeeded(seed)
    /* A pasted command's `--skill` flags are picks, minus what is already in. */
    setPackagePicked(
      request.skills.filter((name) => !installed.includes(name.toLowerCase()))
    )
    setFailed([])
    if (alreadyListed) return
    if (store === null) {
      setPackaged([])
      setError(t("skills.add.offline"))
      return
    }
    setBusy("list")
    setError(null)
    try {
      setPackaged(await store.listPackage(request.source))
    } catch (failure) {
      setListed("")
      setSeeded("")
      setPackaged([])
      setError(messageOf(failure))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Read a folder into candidates, taking the first new one the way the design does.
   *
   * Reading goes through `read`, which is bounded and stoppable: a folder can
   * hold anything, and this must not be the thing that freezes the page. A new
   * read — or a closed dialog — aborts the one before it.
   */
  const acceptFolder = async (
    read: (signal: AbortSignal) => Promise<{ files: DroppedFile[]; truncated: boolean }>
  ) => {
    folderRead.current?.abort()
    const controller = new AbortController()
    folderRead.current = controller
    setError(null)
    setFailed([])
    setFolderPicked([])
    setCapped(false)
    setBusy("list")
    try {
      const { files, truncated } = await read(controller.signal)
      const found = await scanFolder(files)
      /* A newer read, or a closed dialog, owns the state now. */
      if (controller.signal.aborted) return
      setCapped(truncated)
      setFolder(found)
      const first = found.find((skill) => !installed.includes(skill.name.toLowerCase()))
      setFolderPicked(first === undefined ? [] : [first.name])
    } catch (failure) {
      if (controller.signal.aborted) return
      setFolder(null)
      setError(messageOf(failure))
    } finally {
      if (folderRead.current === controller) {
        folderRead.current = null
        setBusy(null)
      }
    }
  }

  const handleImport = async () => {
    if (store === null) {
      setError(t("skills.add.offline"))
      return
    }
    const chosen = (folder ?? []).filter((skill) => picked.includes(skill.name))
    if (picked.length === 0) return
    setBusy("import")
    setError(null)
    setFailed([])
    try {
      const result: SkillImport =
        tab === "local"
          ? await store.importFolder(await readFolderFiles(chosen))
          : await store.installPackage(
              listed === "" ? parsePackageRequest(source).source : listed,
              picked
            )
      if (result.installed.length > 0) onImported()
      if (result.failed.length > 0) {
        /* Say what was refused, and let a second press retry what was not. */
        setFailed(result.failed)
        void readInstalled().then(setInstalled)
        return
      }
      close(false)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(null)
    }
  }

  const candidates: { name: string; description: string }[] =
    tab === "local" ? (folder ?? []) : packaged

  const inLibrary = (name: string) => installed.includes(name.toLowerCase())

  /* Only what the library does not hold yet can be picked, so a second import
     can never be attempted for a skill already in. */
  const selectable = candidates.filter((skill) => !inLibrary(skill.name))

  /* A listing is on screen once it has been asked for, even when it found nothing. */
  const hasList = tab === "local" ? folder !== null : listed !== ""
  const showList = hasList || busy === "list" || error !== null

  const allSelected =
    selectable.length > 0 &&
    selectable.every((skill) => picked.includes(skill.name))

  const summary = (tab === "local"
    ? t("skills.add.foundFolder")
    : t("skills.add.foundPackage")
  ).replace("{count}", String(candidates.length))

  /** Both ways into a local folder land on the same bounded read. */
  const limits: ScanLimits = DEFAULT_LIMITS

  /** The picker walks the handle itself, so it never enumerates the whole folder. */
  const browse = async () => {
    const pick = (
      window as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
    ).showDirectoryPicker
    if (pick === undefined) {
      pickerRef.current?.click()
      return
    }
    let handle: FileSystemDirectoryHandle
    try {
      handle = await pick()
    } catch {
      /* The person dismissed the picker; nothing to read and nothing to say. */
      return
    }
    await acceptFolder((signal) => walkDirectory(handle, limits, signal))
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-lg bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-[640px]"
      >
        <div className="flex items-start gap-4 px-6 pt-[22px] pb-4">
          <div className="flex flex-col gap-[5px]">
            <DialogTitle className="text-base leading-[19px] font-semibold">
              {t("skills.add.title")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-[17px]">
              {t("skills.add.description")}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto shrink-0"
            aria-label={t("skills.action.close")}
            onClick={() => close(false)}
          >
            <XIcon className="text-muted-foreground" />
          </Button>
        </div>

        <SegmentRow tab={tab} onTabChange={onTabChange} />

        {tab === "local" ? (
          <div className="px-6 pb-6">
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                void acceptFolder((signal) => {
                  const transfer = event.dataTransfer
                  return readDrop(transfer, { signal, limits })
                })
              }}
              className="flex h-[92px] items-center gap-3.5 rounded-lg bg-dropzone px-5 ring-2 ring-primary"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-raised">
                <UploadIcon className="size-5 text-primary" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="text-sm leading-[17px] font-semibold">
                  {t("skills.add.dropTitle")}
                </span>
                <span className="text-[11.5px] leading-[14px] text-muted-foreground">
                  {t("skills.add.dropHint")}
                </span>
              </div>
              <Button
                variant="outline"
                className={`h-9 shrink-0 px-4 ${outline}`}
                onClick={() => void browse()}
              >
                <UploadIcon />
                {t("skills.add.browseFiles")}
              </Button>
              <input
                ref={pickerRef}
                type="file"
                multiple
                aria-label={t("skills.add.browseFiles")}
                className="sr-only"
                {...{ webkitdirectory: "", directory: "" }}
                onChange={(event) => {
                  const input = event.target
                  void acceptFolder(async () => filesFromPicker(input, limits))
                  input.value = ""
                }}
              />
            </div>
            {capped && (
              <p className="pt-2 text-[11px] leading-[14px] text-muted-foreground">
                {t("skills.add.capped").replace(
                  "{count}",
                  String(DEFAULT_LIMITS.maxEntries)
                )}
              </p>
            )}
            {picked.length > 0 && (
              <div className="pt-2">
                <PickedChips picked={picked} onRemove={toggle} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 px-6 pb-6">
            <label
              htmlFor="skill-package"
              className="text-[13px] leading-[15px] font-medium"
            >
              {t("skills.add.package")}
            </label>
            <Input
              id="skill-package"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              onBlur={() => void handleList()}
              placeholder={t("skills.add.packagePlaceholder")}
              className="h-[38px]"
            />
            <span className="text-[11px] leading-[14px] text-muted-foreground">
              {t("skills.add.packageHint")}
            </span>
            <span className="text-[11px] leading-[14px] text-muted-foreground">
              {t("skills.add.packageNote")}
            </span>
            <PickedChips picked={picked} onRemove={toggle} />
          </div>
        )}

        {showList && (
          <>
            <div className="h-px shrink-0 bg-border" />
            {error === null && (
              <ListHeader
                summary={summary}
                allSelected={allSelected}
                canToggleAll={selectable.length > 0}
                onToggleAll={() =>
                  setPicked(allSelected ? [] : selectable.map((skill) => skill.name))
                }
              />
            )}
            {busy === "list" ? (
              <ListState text={t("skills.add.listing")} busy />
            ) : error !== null ? (
              <ListState text={error} busy={false} />
            ) : candidates.length === 0 ? (
              <ListState text={t("skills.add.none")} busy={false} />
            ) : (
              <ul className="max-h-56 shrink-0 overflow-y-auto">
                {candidates.map((skill) => (
                  <SkillRow
                    key={skill.name}
                    name={skill.name}
                    description={skill.description}
                    selected={picked.includes(skill.name)}
                    installed={inLibrary(skill.name)}
                    onToggle={() => toggle(skill.name)}
                  />
                ))}
              </ul>
            )}
            {failed.length > 0 && (
              <div className="flex flex-col gap-0.5 px-6 pt-2 text-[11px] text-destructive">
                {failed.map((entry) => (
                  <span key={entry.name}>
                    {entry.name} — {entry.reason}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex h-16 items-center justify-between gap-3 border-t border-border px-6">
          <span className="truncate text-xs text-muted-foreground">
            {t(tab === "local" ? "skills.add.copiedHint" : "skills.add.downloadedHint")}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <DiscardBubble
              open={confirming}
              dirty={dirty}
              onOpenChange={setConfirming}
              onDiscard={() => {
                setConfirming(false)
                close(false)
              }}
            >
              <Button
                variant="ghost"
                className="h-9 px-4 text-[13px]"
                onClick={() => {
                  if (!dirty) close(false)
                }}
              >
                {t("skills.action.cancel")}
              </Button>
            </DiscardBubble>
            <Button
              className="h-9 gap-2 px-4 text-[13px]"
              disabled={busy === "import" || picked.length === 0}
              onClick={() => void handleImport()}
            >
              <DownloadIcon />
              {picked.length === 0
                ? t("skills.action.import")
                : `${t("skills.action.import")} ${picked.length}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
