/**
 * The server detail dialog: a tab strip over the configuration form, and a
 * panel on the right holding what the hub knows about the server. The panel and
 * the tab strip are the same for every tab, so only the pane in the middle
 * changes.
 *
 * The dialog owns the form's values, because its own footer is what hands them
 * on; every write goes through the page, which is where the store lives.
 */
import {
  CheckIcon,
  ExternalLinkIcon,
  PlusIcon,
  PlugIcon,
  PlugZapIcon,
  Trash2Icon,
  UnlinkIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import { installedCount, MCP_SCOPES, placesInScope, placesOf, type McpPlaceState } from "./installs.ts"
import { FilesPane } from "./detail-files.tsx"
import { ToolsPane } from "./detail-tools.tsx"
import { failureText } from "./library.ts"
import { ServerTile, StatusPill } from "./parts.tsx"
import type { McpCacheEntry } from "./probe.ts"
import { ServerForm, valuesOf, type ServerFormValues } from "./server-form.tsx"
import type { McpTool } from "./tools.ts"
import type { McpAgentPlace, McpConfigFile, McpServer, McpTag } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"
import { PlaceList } from "@workspace/extensions/components"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@workspace/ui/components/dialog"
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { Switch } from "@workspace/ui/components/switch"

/** The three panes the dialog can show. */
export type DetailTab = "config" | "tools" | "files"

const TABS: { id: DetailTab; key: string; width: number }[] = [
  { id: "config", key: "mcp.detail.tab.config", width: 30 },
  { id: "tools", key: "mcp.detail.tab.tools", width: 30 },
  { id: "files", key: "mcp.detail.tab.files", width: 56 },
]

/**
 * What one place's row offers beyond its name: whether the client connects this
 * server, and whether the hub writes the declaration into that client's file at
 * all. A client whose extension offers no way to record the first says so
 * instead of showing a control that would mean nothing.
 */
function PlaceControls({
  state,
  onToggle,
  onSetEnabled,
}: {
  state: McpPlaceState
  onToggle: () => void
  onSetEnabled: (enabled: boolean) => void
}) {
  const { t } = useI18n()
  const { place, install } = state
  const installed = install?.installed === true

  return (
    <>
      {/* The switch means "this client connects it", so it only appears where
          the client's own extension offers a way to record that and there is a
          declaration to switch. A client that keeps the state itself says so
          instead. */}
      {!place.switchable ? (
        <span className="flex h-5 w-[38px] shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] text-muted-foreground">
          {t("mcp.detail.place.self")}
        </span>
      ) : installed ? (
        <Switch
          checked={install?.enabled === true}
          onCheckedChange={onSetEnabled}
          aria-label={place.label}
          className="data-unchecked:bg-secondary"
        />
      ) : (
        <span className="w-8 shrink-0" />
      )}
      <Button
        variant={installed ? "outline" : "secondary"}
        onClick={onToggle}
        className="h-[30px] shrink-0 gap-1.5 rounded-full px-3 text-[12.5px] font-semibold"
      >
        {installed ? (
          <>
            <UnlinkIcon className="size-[13px] text-copy" />
            {t("mcp.detail.action.remove")}
          </>
        ) : (
          <>
            <PlusIcon className="size-[13px]" />
            {t("mcp.detail.action.install")}
          </>
        )}
      </Button>
    </>
  )
}

/** A hairline between two groups, with the canvas's 17px of air. */
function Rule() {
  return (
    <div className="flex h-[17px] items-center">
      <span className="h-px w-full bg-border" />
    </div>
  )
}

/**
 * The delete question, in the bubble the skills module asks it in: deleting a
 * record cannot be undone, and a record is what a person wrote, so one click
 * must not be enough.
 */
function DeleteBubble({ name, onDelete }: { name: string; onDelete: () => Promise<void> }) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)

  const confirm = () => {
    setBusy(true)
    setFailure(null)
    void (async () => {
      try {
        await onDelete()
      } catch (reason) {
        /* On success the dialog unmounts, so a failure is the state left. */
        setFailure(reason instanceof Error ? reason.message : String(reason))
        setBusy(false)
      }
    })()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className="h-10 w-[136px] shrink-0 gap-2 rounded-full bg-card text-[13px] font-semibold text-destructive"
          >
            <Trash2Icon className="size-[15px]" />
            {t("mcp.detail.action.delete")}
          </Button>
        }
      />
      <PopoverContent
        side="top"
        align="end"
        sideOffset={7}
        className="w-80 gap-3 rounded-md bg-popover p-4 shadow-none ring-1 ring-border"
      >
        <PopoverArrow className="size-[17px] rotate-45 border-b border-l border-border bg-popover" />
        <span className="text-[14px] leading-[18px] font-semibold">
          {t("mcp.delete.title").replace("{name}", name)}
        </span>
        <span className="text-[12.5px] leading-[17px] text-copy">{t("mcp.delete.text")}</span>
        {failure !== null && (
          <span className="text-[12px] leading-[16px] text-destructive">{failure}</span>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            className="h-8 rounded-full border-border bg-transparent px-[14px] text-[12.5px] font-semibold dark:border-input dark:bg-transparent"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            {t("mcp.action.cancel")}
          </Button>
          {/* Red stays a text and outline colour: nothing in the panel is a red block. */}
          <Button
            variant="outline"
            className="h-8 rounded-full border-destructive/35 bg-transparent px-[14px] text-[12.5px] font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive dark:border-destructive/35 dark:bg-transparent"
            disabled={busy}
            onClick={confirm}
          >
            {t("mcp.delete.confirm")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Which agents read this server, grouped by the root each place sits under. */
function Places({
  states,
  onToggle,
  onSetEnabled,
}: {
  states: McpPlaceState[]
  onToggle: (place: string) => void
  onSetEnabled: (place: string, enabled: boolean) => void
}) {
  const { t } = useI18n()
  const byId = new Map(states.map((state) => [state.place.id, state]))

  return (
    <div className="flex flex-col">
      <div className="flex h-5 items-center gap-1.5">
        <span className="text-[12px] leading-[1.3] text-muted-foreground">
          {t("mcp.detail.section.places")}
        </span>
        <span className="text-[12px] leading-[1.3] text-muted-soft">
          {t("mcp.detail.place.installed").replace("{count}", String(installedCount(states)))}
        </span>
      </div>
      {/* No contributed client file means nothing here can be installed, which
          is a state to say rather than an empty list to show. */}
      {states.length === 0 ? (
        <span className="flex h-8 items-center text-[12px] leading-[1.3] text-muted-foreground">
          {t("mcp.place.none")}
        </span>
      ) : null}
      <ul className="flex flex-col">
        <PlaceList
          groups={MCP_SCOPES.map((scope) => ({
            label: t(`mcp.detail.group.${scope}`),
            options: placesInScope(states, scope).map((state) => ({
              id: state.place.id,
              icon: state.place.icon,
              label: state.place.label,
              where: state.place.path,
              selected: state.install?.installed === true,
            })),
          })).filter((group) => group.options.length > 0)}
          words={{
            expand: (rest) => t("mcp.place.expand").replace("{count}", String(rest)),
            collapse: t("mcp.place.collapse"),
          }}
          action={(option) => {
            const state = byId.get(option.id)
            if (state === undefined) return null
            return (
              <PlaceControls
                state={state}
                onToggle={() => onToggle(state.place.id)}
                onSetEnabled={(enabled) => onSetEnabled(state.place.id, enabled)}
              />
            )
          }}
        />
      </ul>
    </div>
  )
}

/**
 * What the last probe adds under the check's own rows: the source the server
 * named, as the line itself, and — when the probe failed — the sentence, the
 * platform's own words and the last thing its process wrote.
 */
function ProbeSection({ check }: { check: McpCacheEntry }) {
  const { t } = useI18n()
  const error = check.error
  const site = check.serverInfo?.websiteUrl

  return (
    <>
      {site === undefined ? null : (
        <a
          href={site}
          target="_blank"
          rel="noreferrer"
          className="flex h-[26px] min-w-0 items-center gap-1.5 font-mono text-[12px] leading-[1.3] text-foreground hover:underline"
        >
          <span className="truncate">{site}</span>
          <ExternalLinkIcon className="size-[13px] shrink-0" />
        </a>
      )}
      {check.ok || error === undefined ? null : (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-[12.5px] leading-[1.4] text-destructive">
            {failureText(t, { key: `mcp.check.error.${error.kind}`, params: error.params })}
          </span>
          <span className="font-mono text-[11px] leading-[1.5] break-words text-muted-foreground">
            {error.message}
          </span>
          {check.stderr === undefined ? null : (
            <>
              <span className="text-[11.5px] leading-[1.3] text-muted-soft">
                {t("mcp.check.stderr")}
              </span>
              <pre className="max-h-[120px] overflow-auto rounded-sm bg-muted p-2 font-mono text-[10.5px] leading-[1.5] whitespace-pre-wrap text-copy">
                {check.stderr}
              </pre>
            </>
          )}
        </div>
      )}
    </>
  )
}

/** The right-hand panel: what the server is, where it lives, and its state. */
function ServerPanel({
  server,
  places,
  tags,
  age,
  onTogglePlace,
  onSetPlaceEnabled,
  onTest,
  onSave,
  onDelete,
  busy,
}: {
  server: McpServer
  places: readonly McpAgentPlace[]
  tags: McpTag[]
  age: string
  onTogglePlace: (place: string) => void
  onSetPlaceEnabled: (place: string, enabled: boolean) => void
  onTest: () => void
  onSave: () => void
  onDelete: () => Promise<void>
  busy: boolean
}) {
  const { t } = useI18n()
  const states = placesOf(places, server.detail.installs)
  const byId = new Map(tags.map((tag) => [tag.id, tag]))

  return (
    <aside className="flex max-h-full min-w-0 shrink grow-0 basis-[360px] flex-col overflow-hidden bg-card">
      <header className="flex h-[84px] shrink-0 items-center gap-3 border-b border-border px-5">
        <ServerTile mark={server.mark} icon={server.check?.icon} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-[16px] leading-[1.3] font-semibold text-foreground">
            {server.name}
          </span>
          <div className="flex items-center gap-1.5 text-[12px] leading-[1.3]">
            <PlugIcon className="size-[13px] text-muted-soft" />
            <span className="font-mono font-semibold text-foreground">{server.transport}</span>
            <span className="text-muted-soft">·</span>
            <span className="text-muted-foreground">
              {t("mcp.detail.place.count").replace("{count}", String(server.installed))}
            </span>
          </div>
        </div>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-full"
              aria-label={t("mcp.detail.action.close")}
            />
          }
        >
          <XIcon className="size-4 text-copy" />
        </DialogClose>
      </header>

      <div className="flex min-h-0 flex-1 scrollbar-gutter-stable flex-col gap-[18px] overflow-y-auto p-5">
        <p className="text-[12.5px] leading-[1.5] text-copy">{server.description}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          {server.detail.tags.map((id) => (
            <span
              key={id}
              className="flex h-6 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-[12px] leading-[1.3] text-foreground"
            >
              {byId.get(id)?.label ?? id}
              <span className="flex size-[15px] items-center justify-center rounded-full bg-foreground/10">
                <XIcon className="size-2.5 text-muted-foreground" />
              </span>
            </span>
          ))}
          <button
            type="button"
            className="flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] leading-[1.3] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <PlusIcon className="size-3" />
            {t("mcp.detail.tag.add")}
          </button>
        </div>

        <Places states={states} onToggle={onTogglePlace} onSetEnabled={onSetPlaceEnabled} />

        <div className="flex flex-col">
          <div className="flex h-8 items-center gap-2">
            <span className="text-[12px] leading-[1.3] text-muted-foreground">
              {t("mcp.detail.section.check")}
            </span>
            <StatusPill status={server.status} />
            <span className="h-px flex-1" />
            <Button
              variant="secondary"
              onClick={onTest}
              className="h-7 gap-1.5 rounded-full px-3 text-[12.5px] font-medium"
            >
              <PlugZapIcon className="size-[13px]" />
              {t("mcp.action.testConnection")}
            </Button>
          </div>
          <div className="flex h-[26px] items-center text-[11.5px] leading-[1.3] text-muted-soft">
            {t("mcp.detail.check.lastChecked").replace("{age}", age)}
          </div>
          {server.check === undefined ? null : <ProbeSection check={server.check} />}
          <Rule />
          <div className="flex h-[26px] items-center justify-between">
            <span className="text-[12px] leading-[1.3] text-muted-foreground">
              {t("mcp.detail.row.tools")}
            </span>
            <span className="text-[12px] leading-[1.3] font-medium text-foreground">
              {t("mcp.detail.row.toolsValue").replace(
                "{count}",
                String(server.detail.tools.length)
              )}
            </span>
          </div>
        </div>
      </div>

      <footer className="flex h-16 shrink-0 items-center gap-2.5 border-t border-border px-5">
        <Button
          onClick={onSave}
          disabled={busy}
          className="h-10 flex-1 gap-2 rounded-full text-[13px] font-semibold"
        >
          <CheckIcon className="size-[15px]" />
          {t("mcp.detail.action.save")}
        </Button>
        <DeleteBubble name={server.name} onDelete={onDelete} />
      </footer>
    </aside>
  )
}

/** The detail dialog for one server. */
export function ServerDialog({
  server,
  places,
  tags,
  files,
  tools,
  age,
  busy,
  onClose,
  onTogglePlace,
  onSetPlaceEnabled,
  onTest,
  onSave,
  onDelete,
}: {
  server: McpServer
  places: readonly McpAgentPlace[]
  tags: McpTag[]
  /** Every file that holds this server, as the page loaded them. */
  files: McpConfigFile[]
  tools: McpTool[]
  age: string
  busy: boolean
  onClose: () => void
  onTogglePlace: (place: string) => void
  onSetPlaceEnabled: (place: string, enabled: boolean) => void
  onTest: () => void
  onSave: (values: ServerFormValues) => void
  onDelete: () => Promise<void>
}) {
  const { t } = useI18n()
  const [tab, setTab] = React.useState<DetailTab>("config")
  const [values, setValues] = React.useState<ServerFormValues>(() =>
    valuesOf(server.detail.declaration, server.name)
  )

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        /* The dialog's width is its own; the component's built-in `sm:max-w-sm`
           would clamp it, and an inline ceiling settles that in one place
           instead of re-stating the breakpoint here. */
        style={{ maxWidth: "none" }}
        className="h-[min(712px,calc(100dvh-2rem))] w-[min(1088px,calc(100vw-2rem))] gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 ring-0"
      >
        <DialogTitle className="sr-only">{server.name}</DialogTitle>
        {/* One row of two panes while they fit side by side, and two stacked
            rows when they do not — the wrap does that on its own, because the
            form's basis plus the panel's is what the dialog is compared
            against. A permanent left border on the panel would land in the
            wrong place once it wraps, so the two panes are told apart by their
            own surfaces, which is how the canvas separates them anyway.
            Each pane is capped at this row's height: a wrapping row sizes
            itself to its tallest item, so without the cap the panes grow past
            the dialog and it is this row — not their own panes — that scrolls,
            which pushes both footers out of view. */}
        <div className="flex h-full min-h-0 flex-wrap items-stretch scrollbar-gutter-auto overflow-y-auto">
          <div className="flex max-h-full min-h-[380px] min-w-0 shrink grow basis-[520px] flex-col overflow-hidden bg-muted">
            <div className="flex h-12 shrink-0 items-center border-b border-border px-6">
              <div className="flex h-12 items-end gap-7">
                {TABS.map((entry) => {
                  const active = tab === entry.id
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTab(entry.id)}
                      style={{ width: entry.width }}
                      className="flex h-12 flex-col items-center justify-end gap-3"
                    >
                      <span
                        className={cn(
                          "text-[13.5px] leading-[1.4]",
                          active ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                        )}
                      >
                        {t(entry.key)}
                      </span>
                      <span className={cn("h-0.5 w-full", active ? "bg-primary" : "bg-transparent")} />
                    </button>
                  )
                })}
              </div>
            </div>
            {/* The config and tools panes share one card, so the two read as the
                same surface and their scrollbars sit in the same place. The
                files pane brings its own card — it is a reading surface, and
                the canvas fills it to the pane's height. */}
            {tab === "files" ? (
              <div className="min-h-0 flex-1 px-6 py-[22px]">
                <FilesPane files={files} />
              </div>
            ) : (
              <div className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto px-6 py-[22px]">
                <div className="flex flex-col gap-[18px] rounded-lg border border-border bg-card p-5">
                  {tab === "config" ? (
                    <ServerForm
                      values={values}
                      onChange={setValues}
                      notice={t("mcp.form.notice")}
                    />
                  ) : null}
                  {tab === "tools" ? (
                    <ToolsPane
                      tools={tools}
                      empty={t(
                        server.check === undefined
                          ? "mcp.detail.tools.empty"
                          : server.check.ok
                            ? "mcp.detail.tools.none"
                            : "mcp.detail.tools.failed"
                      )}
                    />
                  ) : null}
                </div>
              </div>
            )}
          </div>
          <ServerPanel
            server={server}
            places={places}
            tags={tags}
            age={age}
            busy={busy}
            onTogglePlace={onTogglePlace}
            onSetPlaceEnabled={onSetPlaceEnabled}
            onTest={onTest}
            onSave={() => onSave(values)}
            onDelete={onDelete}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
