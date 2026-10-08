import { CheckIcon, UploadIcon, XIcon } from "lucide-react"
import * as React from "react"

import {
  filesFromPicker,
  readDrop,
  readFolderFiles,
  scanFolder,
  type DroppedFile,
  type FolderSkill,
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
  onToggle,
}: {
  name: string
  description: string
  selected: boolean
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
    </li>
  )
}

/** The line above a list: how many arrived, and one control for all of them. */
function ListHeader({
  summary,
  allSelected,
  onToggleAll,
}: {
  summary: string
  allSelected: boolean
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
        onClick={onToggleAll}
        className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
 * carries a SKILL.md. Download asks the `skills` CLI what a package holds and
 * takes the skills a person picked; an empty pick set takes the whole package.
 *
 * Whichever tab is open, the picks in the list are the state that matters:
 * Cancel asks before dropping them, and Import sends exactly them.
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

  const [source, setSource] = React.useState("")
  /** The source the package list came from; empty until a listing lands. */
  const [listed, setListed] = React.useState("")
  const [picked, setPicked] = React.useState<string[]>([])
  const [packaged, setPackaged] = React.useState<PackageSkill[]>([])
  const [folder, setFolder] = React.useState<FolderSkill[] | null>(null)
  const [busy, setBusy] = React.useState<"list" | "import" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState<{ name: string; reason: string }[]>([])
  const [confirming, setConfirming] = React.useState(false)

  const dirty =
    tab === "local" ? folder !== null : source.trim() !== "" || picked.length > 0

  const reset = () => {
    setSource("")
    setListed("")
    setPicked([])
    setPackaged([])
    setFolder(null)
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
    if (request.source === "" || request.source === listed) return
    setListed(request.source)
    /* A pasted command's `--skill` flags are picks; a bare source starts clean. */
    setPicked(request.skills)
    setFailed([])
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
      setPackaged([])
      setError(messageOf(failure))
    } finally {
      setBusy(null)
    }
  }

  /** Read a dropped folder into candidates, taking the first one the way the design does. */
  const acceptFolder = async (files: DroppedFile[]) => {
    setError(null)
    setFailed([])
    setPicked([])
    setBusy("list")
    try {
      const found = await scanFolder(files)
      setFolder(found)
      setPicked(found.slice(0, 1).map((skill) => skill.name))
    } catch (failure) {
      setFolder(null)
      setError(messageOf(failure))
    } finally {
      setBusy(null)
    }
  }

  const handleImport = async () => {
    if (store === null) {
      setError(t("skills.add.offline"))
      return
    }
    const chosen = (folder ?? []).filter((skill) => picked.includes(skill.name))
    if (tab === "local" && chosen.length === 0) return
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

  /* A listing is on screen once it has been asked for, even when it found nothing. */
  const hasList = tab === "local" ? folder !== null : listed !== ""
  const showList = hasList || busy === "list" || error !== null

  const allSelected =
    candidates.length > 0 &&
    candidates.every((skill) => picked.includes(skill.name))

  const summary = (tab === "local"
    ? t("skills.add.foundFolder")
    : t("skills.add.foundPackage")
  ).replace("{count}", String(candidates.length))

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
                void readDrop(event.dataTransfer).then(acceptFolder)
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
                onClick={() => pickerRef.current?.click()}
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
                  void acceptFolder(filesFromPicker(event.target))
                  event.target.value = ""
                }}
              />
            </div>
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
            {picked.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {picked.map((skill) => (
                  <span
                    key={skill}
                    className="flex h-[21px] items-center gap-1.5 rounded-full bg-muted px-2 font-mono text-[11.5px]"
                  >
                    {skill}
                    <button
                      type="button"
                      aria-label={`${t("skills.media.remove")} ${skill}`}
                      onClick={() => toggle(skill)}
                    >
                      <XIcon className="size-3 text-muted-foreground" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {showList && (
          <>
            <div className="h-px shrink-0 bg-border" />
            {error === null && (
              <ListHeader
                summary={summary}
                allSelected={allSelected}
                onToggleAll={() =>
                  setPicked(allSelected ? [] : candidates.map((skill) => skill.name))
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
              className="h-9 px-4 text-[13px]"
              disabled={busy === "import" || (tab === "local" && picked.length === 0)}
              onClick={() => void handleImport()}
            >
              {t("skills.action.import")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
