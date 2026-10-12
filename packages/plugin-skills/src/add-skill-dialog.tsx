import {
  CheckIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderUpIcon,
  ListIcon,
  PackageIcon,
  PlusIcon,
  ScrollTextIcon,
  XIcon,
} from "lucide-react"
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

/**
 * The two ways in, as one trough with a raised chip on it. The chip is the
 * canvas colour, not ink: this control selects, it does not act, and the page's
 * own tab row spends the ink fill on the one place being read.
 */
function SegmentRow({
  tab,
  onTabChange,
}: {
  tab: AddSkillTab
  onTabChange: (tab: AddSkillTab) => void
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
            className={`h-[30px] flex-1 rounded-full text-[13px] transition-colors ${
              tab === segment.value
                ? "bg-card font-semibold text-foreground ring-1 ring-border"
                : "font-medium text-copy hover:text-foreground"
            }`}
          >
            {t(segment.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * One candidate: what it is called, what it is, and its own install action. The
 * same row shape serves both segments, because both ask the same question.
 */
function InstallRow({
  name,
  detail,
  installed,
  pending,
  onInstall,
}: {
  name: string
  /** The row's second line: a folder skill's own file, or a package skill's description. */
  detail: string
  /** Already in this library: there is nothing left to do with this row. */
  installed: boolean
  /** This row's own install is in flight; the other rows stay live. */
  pending: boolean
  onInstall: () => void
}) {
  const { t } = useI18n()

  return (
    <li className="flex h-[68px] items-center gap-3.5 border-b border-border px-5 last:border-b-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-raised ring-1 ring-border ring-inset">
        <ScrollTextIcon className="size-[17px] text-copy" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate font-mono text-[13.5px] leading-[18px] font-semibold">
          {name}
        </span>
        {detail !== "" && (
          <span className="truncate text-[12px] leading-[15px] text-muted-foreground">
            {detail}
          </span>
        )}
      </div>
      {installed ? (
        <span className="flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-muted-foreground ring-1 ring-border">
          <CheckIcon className="size-[13px]" />
          {t("skills.add.imported")}
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          aria-busy={pending}
          aria-label={`${t("skills.action.install")} ${name}`}
          onClick={onInstall}
          className="h-[30px] shrink-0 gap-1.5 rounded-full bg-secondary px-3.5 text-[12.5px] font-semibold text-foreground hover:bg-accent"
        >
          {pending ? <Spinner className="size-[13px]" /> : <PlusIcon className="size-[13px]" />}
          {t("skills.action.install")}
        </Button>
      )}
    </li>
  )
}

/** The one line a list shows instead of rows: a wait, or a refusal. */
function ListState({ text, busy }: { text: string; busy: boolean }) {
  return (
    <div className="flex items-center gap-2 px-5 py-7 text-[12px]">
      {busy && <Spinner className="size-3.5" />}
      <span className={busy ? "text-muted-foreground" : "text-destructive"}>{text}</span>
    </div>
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
   * Each row installs on its own, so what is in flight is a set of names: a
   * row's button waits for that row alone, and the rest stay live.
   */
  const [pending, setPending] = React.useState<string[]>([])
  const [packaged, setPackaged] = React.useState<PackageSkill[]>([])
  const [folder, setFolder] = React.useState<FolderSkill[] | null>(null)
  /** The folder the last read came from, as the person picked it. */
  const [folderName, setFolderName] = React.useState("")
  /** True when a bound stopped the read before the folder ran out. */
  const [capped, setCapped] = React.useState(false)
  /** Ids this library already holds, lower-cased for comparison. */
  const [installed, setInstalled] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState<"list" | "import" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState<{ name: string; reason: string }[]>([])

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

  const reset = () => {
    folderRead.current?.abort()
    folderRead.current = null
    setSource("")
    setListed("")
    setSeeded("")
    setPending([])
    setPackaged([])
    setFolder(null)
    setFolderName("")
    setCapped(false)
    setBusy(null)
    setError(null)
    setFailed([])
  }

  /* Closing always clears the dialog, so the next open starts from nothing. */
  const close = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  /** Ask the CLI what the package holds, unless that list is already on screen. */
  const handleList = async () => {
    const request = parsePackageRequest(source)
    if (request.source === "") return
    const seed = request.skills.join(",")
    if (request.source === listed && seed === seeded) return
    const alreadyListed = request.source === listed
    setListed(request.source)
    setSeeded(seed)
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
    setBusy("list")
    try {
      const { files, truncated } = await read(controller.signal)
      const found = await scanFolder(files)
      /* A newer read, or a closed dialog, owns the state now. */
      if (controller.signal.aborted) return
      setCapped(truncated)
      setFolder(found)
      /* Every path starts with the folder it was read from, which is the name
         the person picked; a single file has none. */
      setFolderName(files[0]?.path.split("/")[0] ?? "")
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

  /** Put one row into the library, and leave the list up for the next one. */
  const installOne = async (name: string) => {
    if (store === null) {
      setError(t("skills.add.offline"))
      return
    }
    const found = (folder ?? []).find((skill) => skill.name === name)
    if (tab === "local" && found === undefined) return
    setPending((current) => [...current, name])
    setError(null)
    try {
      const result: SkillImport =
        tab === "local"
          ? await store.importFolder(await readFolderFiles([found as FolderSkill]))
          : await store.installPackage(
              listed === "" ? parsePackageRequest(source).source : listed,
              [name]
            )
      if (result.installed.length > 0) onImported()
      if (result.failed.length > 0) {
        setFailed((current) => [
          ...current.filter((entry) => entry.name !== name),
          ...result.failed,
        ])
      }
      void readInstalled().then(setInstalled)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setPending((current) => current.filter((item) => item !== name))
    }
  }

  const candidates: { name: string; description: string }[] =
    tab === "local" ? (folder ?? []) : packaged

  const inLibrary = (name: string) => installed.includes(name.toLowerCase())

  /* A listing is on screen once it has been asked for, even when it found nothing. */
  const hasList = tab === "local" ? folder !== null : listed !== ""
  const showList = hasList || busy === "list" || error !== null

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
        className="gap-0 rounded-xl bg-dialog p-0 shadow-soft ring-1 ring-border sm:max-w-[640px]"
      >
        <div className="flex min-h-24 items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <DialogTitle className="text-[16px] leading-[19px] font-semibold">
              {t("skills.add.title")}
            </DialogTitle>
            <DialogDescription className="text-[12.5px] leading-[19px] text-muted-foreground">
              {t("skills.add.description")}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            className="size-[30px] shrink-0 rounded-full"
            aria-label={t("skills.action.close")}
            onClick={() => close(false)}
          >
            <XIcon className="size-4 text-copy" />
          </Button>
        </div>

        <SegmentRow tab={tab} onTabChange={onTabChange} />

        {tab === "local" ? (
          folder === null && busy !== "list" && error === null ? (
            /* Nothing chosen yet, so the drop target is the whole screen and
               browsing is its one button. */
            <div className="px-5 pb-5">
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  void acceptFolder((signal) => {
                    const transfer = event.dataTransfer
                    return readDrop(transfer, { signal, limits })
                  })
                }}
                className="flex h-56 flex-col items-center justify-center gap-3 rounded-md bg-surface-raised px-6 text-center ring-1 ring-border ring-inset"
              >
                <FolderUpIcon className="size-7 text-muted-soft" aria-hidden />
                <span className="text-[15.5px] leading-[20px] font-semibold">
                  {t("skills.add.dropTitle")}
                </span>
                <span className="text-[13px] leading-[17px] text-copy">
                  {t("skills.add.dropHint")}
                </span>
                <Button
                  className="mt-1 h-10 gap-2 rounded-full px-[18px] text-[13.5px] font-semibold"
                  onClick={() => void browse()}
                >
                  <FolderOpenIcon className="size-[15px]" />
                  {t("skills.add.browseFiles")}
                </Button>
                <span className="mt-0.5 font-mono text-[12px] leading-[16px] text-muted-soft">
                  {t("skills.add.limitNote").replace("{count}", String(DEFAULT_LIMITS.maxEntries))}
                </span>
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
            </div>
          ) : (
            <>
              {/* Where this list came from, and the one way to change it. The
                  strip is a raised card, so its tile is the canvas colour. */}
              <div className="px-5 py-4">
                <div className="flex h-16 items-center gap-3 rounded-lg bg-surface-raised px-4 ring-1 ring-border">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-card ring-1 ring-border ring-inset">
                    <FolderIcon className="size-[17px] text-copy" aria-hidden />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    {folderName === "" ? null : (
                      <span className="truncate font-mono text-[13.5px] leading-[18px] font-semibold">
                        {folderName}
                      </span>
                    )}
                    <span className="truncate text-[12px] leading-[15px] text-muted-foreground">
                      {busy === "list" ? t("skills.add.listing") : summary}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    className={`h-8 shrink-0 gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${outline}`}
                    onClick={() => void browse()}
                  >
                    <FolderOpenIcon className="size-3.5" />
                    {t("skills.add.repick")}
                  </Button>
                </div>
              </div>
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
              {capped ? (
                <p className="px-5 pb-3 text-[12px] leading-[16px] text-muted-foreground">
                  {t("skills.add.capped").replace("{count}", String(DEFAULT_LIMITS.maxEntries))}
                </p>
              ) : null}
            </>
          )
        ) : (
          <div className="px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-input px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
                <PackageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  id="skill-package"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleList()
                  }}
                  placeholder={t("skills.add.packagePlaceholder")}
                  aria-label={t("skills.add.package")}
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-soft"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy === "list" || source.trim() === ""}
                aria-label={t("skills.add.list")}
                onClick={() => void handleList()}
                className="h-12 shrink-0 gap-2 rounded-full bg-secondary px-5 text-[13.5px] font-semibold text-foreground hover:bg-accent"
              >
                {busy === "list" ? (
                  <Spinner className="size-[15px]" />
                ) : (
                  <ListIcon className="size-[15px]" />
                )}
                {t("skills.add.list")}
              </Button>
            </div>
          </div>
        )}

        {showList && (
          <>
            <div className="h-px shrink-0 bg-border" />
            {busy === "list" ? (
              <ListState text={t("skills.add.listing")} busy />
            ) : error !== null ? (
              <ListState text={error} busy={false} />
            ) : candidates.length === 0 ? (
              <ListState text={t("skills.add.none")} busy={false} />
            ) : (
              /* Installing one row is the whole interaction: the row says which
                 skill, and the button installs that one. No selection to carry,
                 so no footer to submit it with. */
              <ul className="scrollbar-gutter-stable max-h-[360px] shrink-0 overflow-y-auto">
                {candidates.map((skill) => (
                  <InstallRow
                    key={skill.name}
                    name={skill.name}
                    detail={skill.description}
                    installed={inLibrary(skill.name)}
                    pending={pending.includes(skill.name)}
                    onInstall={() => void installOne(skill.name)}
                  />
                ))}
              </ul>
            )}
            {failed.length > 0 && (
              <div className="flex shrink-0 flex-col gap-0.5 px-6 py-2 text-[12px] text-destructive">
                {failed.map((entry) => (
                  <span key={entry.name}>
                    {entry.name} — {entry.reason}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
