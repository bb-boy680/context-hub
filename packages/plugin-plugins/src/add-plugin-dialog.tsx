/**
 * The Add-plugin dialog: two ways in, one list — the same shape the skills
 * module offers, because both ask the same question.
 *
 * The interface only, like the page it opens from. A folder a person picks or
 * drops is read for what the browser alone can say about it: the packs it holds,
 * one level down. Installing a row, and listing what a marketplace source
 * carries, are the module's next step.
 */
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

import type { ExtensionIcon } from "@workspace/extensions"
import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"

/** Which way the dialog takes plugins in. */
export type AddPluginTab = "marketplace" | "local"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

const segments: { value: AddPluginTab; labelKey: string; icon: ExtensionIcon }[] = [
  { value: "marketplace", labelKey: "plugins.add.segment.marketplace", icon: PackageIcon },
  { value: "local", labelKey: "plugins.add.segment.local", icon: FolderIcon },
]

/** One candidate the dialog offers, which is what its row draws. */
interface Candidate {
  name: string
  detail: string
}

/**
 * The packs a folder holds, as the browser alone can report them: a picked
 * folder arrives as the files under it, so the first path segment is the pack.
 * A pack is not identified here — that takes reading its manifest.
 */
function packsIn(files: FileList | readonly File[]): Candidate[] {
  const names = new Set<string>()
  for (const file of files) {
    const pack = file.webkitRelativePath.split("/")[0]
    if (pack !== undefined && pack !== "") names.add(pack)
  }
  return [...names].sort().map((name) => ({ name, detail: "" }))
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
 * One candidate: what it is called, what it carries, and its own install action.
 * The row shape serves both segments, because both ask the same question.
 */
function InstallRow({
  candidate,
  installed,
  onInstall,
}: {
  candidate: Candidate
  /** Already installed: there is nothing left to do with this row. */
  installed: boolean
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
          {candidate.name}
        </span>
        {candidate.detail === "" ? null : (
          <span className="truncate text-[12px] leading-[15px] text-muted-foreground">
            {candidate.detail}
          </span>
        )}
      </div>
      {installed ? (
        <span className="flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-muted-foreground ring-1 ring-border">
          <CheckIcon className="size-[13px]" />
          {t("plugins.add.installed")}
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          aria-label={`${t("plugins.action.install")} ${candidate.name}`}
          onClick={onInstall}
          className="h-[30px] shrink-0 gap-1.5 rounded-full bg-secondary px-3.5 text-[12.5px] font-semibold text-foreground hover:bg-accent"
        >
          <PlusIcon className="size-[13px]" />
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

export function AddPluginDialog({
  open,
  tab,
  installed,
  onTabChange,
  onOpenChange,
  onInstall,
}: {
  open: boolean
  tab: AddPluginTab
  /** Ids the hub already holds, so a row can say it is in. */
  installed: readonly string[]
  onTabChange: (tab: AddPluginTab) => void
  onOpenChange: (open: boolean) => void
  onInstall: (name: string) => void
}) {
  const { t } = useI18n()
  const pickerRef = React.useRef<HTMLInputElement>(null)
  /** The marketplace source being typed; nothing lists it yet. */
  const [source, setSource] = React.useState("")
  /** The packs read from a folder, or `null` before one was picked. */
  const [candidates, setCandidates] = React.useState<Candidate[] | null>(null)
  const [folderName, setFolderName] = React.useState("")

  /** Closing always clears the dialog, so the next open starts from nothing. */
  const close = (next: boolean) => {
    if (!next) {
      setSource("")
      setCandidates(null)
      setFolderName("")
    }
    onOpenChange(next)
  }

  const accept = (files: FileList | readonly File[], name: string) => {
    setFolderName(name)
    setCandidates(packsIn(files))
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
        accept(files, files[0]?.webkitRelativePath.split("/")[0] ?? "")
        input.value = ""
      }}
    />
  )

  const list =
    candidates === null ? (
      <ListState
        text={tab === "local" ? t("plugins.add.pick") : t("plugins.add.ask")}
        icon={tab === "local" ? FolderOpenIcon : PackageIcon}
      />
    ) : candidates.length === 0 ? (
      <ListState text={t("plugins.add.none")} />
    ) : (
      <ul className="scrollbar-gutter-stable max-h-[360px] shrink-0 overflow-y-auto">
        {candidates.map((candidate) => (
          <InstallRow
            key={candidate.name}
            candidate={candidate}
            installed={installed.includes(candidate.name)}
            onInstall={() => onInstall(candidate.name)}
          />
        ))}
      </ul>
    )

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
          candidates === null ? (
            /* Nothing chosen yet, so the drop target is the whole area and
               browsing is its one button. */
            <div className="px-5 pb-5">
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const files = [...event.dataTransfer.files]
                  accept(files, files[0]?.webkitRelativePath.split("/")[0] ?? "")
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
                    {folderName}
                  </span>
                  <span className="truncate text-[12px] leading-[15px] text-muted-foreground">
                    {t("plugins.add.found").replace("{count}", String(candidates.length))}
                  </span>
                </div>
                <Button
                  variant="outline"
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
                  placeholder={t("plugins.add.sourcePlaceholder")}
                  aria-label={t("plugins.add.source")}
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-soft"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={source.trim() === ""}
                aria-label={t("plugins.add.list")}
                className="h-12 shrink-0 gap-2 rounded-full bg-secondary px-5 text-[13.5px] font-semibold text-foreground hover:bg-accent"
              >
                <ListIcon className="size-[15px]" />
                {t("plugins.add.list")}
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
