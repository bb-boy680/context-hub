import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  LibraryIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import { useI18n } from "@context-hub/extensions/react"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@context-hub/shadcn-ui/components/dialog"
import { toast } from "@context-hub/shadcn-ui/components/toast"
import { placePath, type SkillPlace } from "@context-hub/skills"

import {
  installMarketSkill,
  installedRow,
  nameConflict,
  type MarketLibrary,
  type MarketRow,
} from "./rows.ts"

/** The two scopes, in the order a list of places reads them. */
const SCOPES = ["workspace", "global"] as const

/** Past this many places a group folds, the same count the skills page uses. */
const PLACES_VISIBLE = 8

/** The library row and every place row wear the same surface, so a choice
 * reads as one control whether it is the fixed target or an agent to pick. */
const ROW =
  "flex w-full items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-left"

/** An agent's own mark, the same 28px tile the skills page's place lists use. */
const TILE =
  "flex size-7 shrink-0 items-center justify-center overflow-clip rounded-lg bg-surface-raised ring-1 ring-border ring-inset"

const CIRCLE =
  "flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-background"

/** The hub's own library, plus the agents a skill can be delivered into. */
export function MarketInstallDialog({
  row,
  open,
  onOpenChange,
  library,
  places,
}: {
  row: MarketRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  library: MarketLibrary
  places: readonly SkillPlace[]
}) {
  const { t } = useI18n()
  const [running, setRunning] = React.useState(false)
  const [selected, setSelected] = React.useState<readonly string[]>([])
  const [unfolded, setUnfolded] = React.useState<readonly string[]>([])
  const [copied, setCopied] = React.useState(false)

  if (row === null) return null

  const conflict = nameConflict(library.rows, row.source, row.skillId)
  const installed = installedRow(library.rows, row.source, row.skillId)
  const held = installed?.places ?? []
  const taken = installed?.takenAt ?? []
  const belongs = (id: string) => held.some((hold) => hold.id === id)
  /* The place keeps a skill of its own under this name, so the library's copy
     cannot be linked there. */
  const takenAt = (id: string) => taken.some((hold) => hold.id === id)
  const unavailable = conflict || library.store === null
  const targets = places.filter(
    (place) => selected.includes(place.id) && !belongs(place.id) && !takenAt(place.id)
  )
  /* Already in the library and nothing picked: installing again would only
     replace the same copy. */
  const nothingToDo = installed !== undefined && targets.length === 0
  const command = `npx skills add ${row.source} --skill ${row.skillId}`

  const close = (next: boolean) => {
    if (running) return
    onOpenChange(next)
  }

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((one) => one !== id) : [...current, id]
    )
  }

  /* Each scope folds on its own: the machine-wide list grows with every agent
     a person enables, while a workspace holds only the places this hub knows. */
  const fold = (scope: string) =>
    setUnfolded((current) =>
      current.includes(scope)
        ? current.filter((one) => one !== scope)
        : [...current, scope]
    )

  const copy = () => {
    const write = navigator.clipboard?.writeText(command)
    if (write === undefined) {
      toast.add({ type: "error", title: t("market.install.copyFailed") })
      return
    }
    void write
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        toast.add({ type: "error", title: t("market.install.copyFailed") })
      })
  }

  const install = () => {
    if (unavailable || running || library.store === null || nothingToDo) return
    setRunning(true)
    installMarketSkill(
      library,
      row,
      targets.map((place) => ({ scope: place.scope, dir: place.dir })),
      t("market.install.failed")
    )
      .then(() => {
        toast.add({
          type: "success",
          title: t("market.install.done").replace("{name}", row.name),
        })
        onOpenChange(false)
      })
      .catch((error: unknown) => {
        toast.add({
          type: "error",
          title: error instanceof Error ? error.message : String(error),
        })
        /* Some places may have landed before one failed; re-read so the checked
           rows and the library agree with the disk. */
        return library.reload().catch(() => undefined)
      })
      .finally(() => setRunning(false))
  }

  const placeRow = (place: SkillPlace) => {
    const already = belongs(place.id)
    const takenHere = takenAt(place.id)
    const noFolder = place.scope === "workspace" && library.workspaceId === null
    const checked = already || selected.includes(place.id)
    const disabled = already || takenHere || noFolder || unavailable || running
    const why = takenHere
      ? t("market.state.conflict")
      : noFolder
        ? t("skills.workspace.none")
        : undefined
    const Mark = place.icon
    return (
      <button
        key={place.id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${t(place.labelKey)} ${placePath(place)}`}
        disabled={disabled}
        title={why}
        onClick={() => toggle(place.id)}
        className={`${ROW} outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={TILE}>
          <Mark className="size-4" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{t(place.labelKey)}</span>
          <span className="truncate font-mono text-[11.5px] text-muted-foreground">
            {placePath(place)}
          </span>
        </span>
        {takenHere ? (
          <span className="shrink-0 text-[11.5px] text-muted-foreground">
            {t("market.state.conflict")}
          </span>
        ) : null}
        <span className={CIRCLE}>
          {checked ? <CheckIcon className="size-3" aria-hidden /> : null}
        </span>
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100vh-2rem)] w-[520px] max-w-[calc(100vw-2rem)] flex-col gap-0 rounded-xl bg-dialog p-0 ring-1 ring-border sm:max-w-[520px]"
      >
        <div className="flex items-start gap-4 px-6 pt-5 pb-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="truncate font-mono text-[15px] font-semibold">
              {t("market.install.title").replace("{name}", row.name)}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("market.install.target")}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("market.detail.close")}
            disabled={running}
            onClick={() => close(false)}
          >
            <XIcon />
          </Button>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-6 pb-5">
          <div className="flex flex-col gap-2.5">
            <div className={ROW}>
              <span className={TILE}>
                <LibraryIcon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">
                {t("market.install.target")}
              </span>
              <span className={CIRCLE}>
                <CheckIcon className="size-3" aria-hidden />
              </span>
            </div>

            {SCOPES.map((scope) => {
              const group = places.filter((place) => place.scope === scope)
              if (group.length === 0) return null
              const open = unfolded.includes(scope)
              const rest = group.length - PLACES_VISIBLE
              const shown = open || rest <= 0 ? group : group.slice(0, PLACES_VISIBLE)
              return (
                <div key={scope} className="flex flex-col gap-2">
                  <span className="px-1 pt-1 text-[11.5px] font-semibold text-muted-soft">
                    {t(`skills.group.${scope}`)}
                  </span>
                  {shown.map(placeRow)}
                  {rest <= 0 ? null : (
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => fold(scope)}
                      className="flex h-10 w-full items-center gap-2.5 rounded-md pr-3 pl-[5px] text-left text-sm font-medium text-copy outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex size-[18px] shrink-0 items-center justify-center">
                        <ChevronDownIcon
                          className={`size-[18px] shrink-0 transition-transform ${
                            open ? "rotate-180" : ""
                          }`}
                          aria-hidden
                        />
                      </span>
                      {open
                        ? t("skills.place.collapse")
                        : t("skills.place.expand").replace("{count}", String(rest))}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">
              {command}
            </code>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("market.install.copy")}
              onClick={() => void copy()}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </div>

          {conflict ? (
            <p className="text-xs text-destructive">{t("market.state.conflict")}</p>
          ) : library.store === null ? (
            <p className="text-xs text-destructive">{t("market.state.noLibrary")}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" disabled={running} onClick={() => close(false)}>
            {t("market.install.cancel")}
          </Button>
          <Button
            disabled={unavailable || running || nothingToDo}
            onClick={() => void install()}
          >
            {running ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {running
              ? t("market.install.running")
              : nothingToDo
                ? t("market.state.installed")
                : t("market.install.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
