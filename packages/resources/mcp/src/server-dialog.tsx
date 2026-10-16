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
  LibraryIcon,
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
import { entryOf } from "./records.ts"
import { ServerTile, StatusPill } from "./parts.tsx"
import type { McpCacheEntry } from "./probe.ts"
import { ServerForm, formErrors, valuesOf, type ServerFormErrors, type ServerFormValues } from "./server-form.tsx"
import type { McpTool } from "./tools.ts"
import type { McpAgentPlace, McpServer } from "./types.ts"
import { useI18n } from "@context-hub/extensions/react"
import { DialogSplit, PlaceList, TagEditor } from "@context-hub/extensions/components"
import { Button } from "@context-hub/shadcn-ui/components/button"
import { Dialog, DialogClose, DialogTitle } from "@context-hub/shadcn-ui/components/dialog"
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "@context-hub/shadcn-ui/components/popover"
import { Switch } from "@context-hub/shadcn-ui/components/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@context-hub/shadcn-ui/components/tabs"
import { Textarea } from "@context-hub/shadcn-ui/components/textarea"

/** The three panes the dialog can show. */
export type DetailTab = "config" | "tools" | "files"

const TABS: { id: DetailTab; key: string }[] = [
  { id: "config", key: "mcp.detail.tab.config" },
  { id: "tools", key: "mcp.detail.tab.tools" },
  { id: "files", key: "mcp.detail.tab.files" },
]

/**
 * What one place's row offers beyond its name: whether the client connects this
 * server, and whether the hub writes the declaration into that client's file at
 * all. A place its extension declares unswitchable says so instead of showing a
 * control that would mean nothing — one client can be switchable in a workspace
 * and not machine-wide.
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
          the place is declared switchable and there is a declaration to switch.
          A place the client keeps the state for itself says so instead. */}
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

/**
 * Where a server lives: the hub's own records first, then every client file an
 * agent extension describes. The library is one of the places rather than a
 * column somewhere else, so a server the hub holds and a server only a client
 * file declares read the same way — the first row says which it is.
 */
function Places({
  server,
  recordsFile,
  states,
  onAdopt,
  onToggle,
  onSetEnabled,
}: {
  server: McpServer
  /** The hub's records file, as a person reads it; empty when unknown. */
  recordsFile: string
  states: McpPlaceState[]
  onAdopt: () => void
  onToggle: (place: string) => void
  onSetEnabled: (place: string, enabled: boolean) => void
}) {
  const { t } = useI18n()
  const byId = new Map(states.map((state) => [state.place.id, state]))
  /* The library is one of the rows, so it is one of the count: a server the
     hub holds is installed in one place before any client file is written. */
  const installed = installedCount(states) + (server.stored ? 1 : 0)

  /* The library row wears the same chrome as a place row, so the list reads as
     one column; only the mark and what the right edge offers differ. */
  const plate =
    "flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-raised ring-1 ring-border ring-inset"

  return (
    <div className="flex flex-col">
      <div className="flex h-5 items-center gap-1.5">
        <span className="text-[12px] leading-[1.3] text-muted-foreground">
          {t("mcp.detail.section.places")}
        </span>
        <span className="text-[12px] leading-[1.3] text-muted-soft">
          {t("mcp.detail.place.installed").replace("{count}", String(installed))}
        </span>
      </div>
      {/* No contributed client file means nothing here can be installed, which
          is a state to say rather than an empty list to show. */}
      {states.length === 0 ? (
        <span className="flex h-8 items-center text-[12px] leading-[1.3] text-muted-foreground">
          {t("mcp.place.none")}
        </span>
      ) : null}
      <ul className="flex flex-col gap-2.5">
        <li className="flex h-14 items-center gap-2.5">
          <span className={plate}>
            <LibraryIcon className="size-[15px] text-copy" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[12.5px] leading-[15px] font-semibold">
              {t("mcp.place.chip.library")}
            </span>
            {recordsFile === "" ? null : (
              <span className="truncate font-mono text-[10.5px] leading-[14px] text-muted-foreground">
                {/* A path reads with forward slashes whatever the platform the
                    host runs on, as every other path this page shows does. */}
                {recordsFile.replaceAll("\\", "/")}
              </span>
            )}
          </span>
          {/* Held, the row says which copy this is; not held, it offers the way
              in — the same action the unstored tab holds, named as the skills
              page names it. */}
          {server.stored ? (
            <span className="flex h-[22px] shrink-0 items-center rounded-full px-[9px] text-[11px] font-medium text-copy ring-1 ring-border">
              {t("mcp.place.body")}
            </span>
          ) : (
            <Button
              variant="secondary"
              aria-label={t("mcp.action.adopt")}
              onClick={onAdopt}
              className="h-[30px] shrink-0 gap-1.5 rounded-full px-3 text-[12.5px] font-semibold"
            >
              <PlusIcon className="size-[13px]" />
              {t("mcp.action.adopt")}
            </Button>
          )}
        </li>
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

/**
 * The description line, which a double click turns into a field to write one
 * in. A server that says nothing about itself — no description it published and
 * no instructions it handed the client — reads as the sentence saying so, so an
 * empty line never looks like a page that failed to load.
 *
 * The field starts from what the line shows, so editing the server's own words
 * is editing them rather than retyping them; what it commits is the hub's
 * record, which is what the catalog reads first from then on.
 */
function DescriptionLine({
  text,
  missing,
  onWrite,
}: {
  /** What the server says about itself; empty when it says nothing. */
  text: string
  /** The sentence shown, and offered as the field's hint, when `text` is empty. */
  missing: string
  onWrite: (description: string) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = React.useState<string | null>(null)
  /* Escape unmounts the field, and the removal raises a blur that must not
     commit what the person just threw away. */
  const thrown = React.useRef(false)

  if (draft !== null) {
    return (
      <Textarea
        autoFocus
        value={draft}
        aria-label={t("mcp.detail.description.edit")}
        placeholder={t("mcp.detail.description.placeholder")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setDraft(null)
          if (thrown.current) {
            thrown.current = false
            return
          }
          const written = draft.trim()
          if (written !== text) onWrite(written)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation()
            thrown.current = true
            setDraft(null)
          }
          /* The dialog's own Escape is the one that closes it, and a click
             elsewhere is what commits, so Enter only newlines. */
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.currentTarget.blur()
          }
        }}
        className="min-h-[62px] text-[12.5px] leading-[1.5]"
      />
    )
  }

  return (
    <p
      onDoubleClick={() => setDraft(text)}
      title={t("mcp.detail.description.edit")}
      className={cn(
        "text-[12.5px] leading-[1.5]",
        text ? "text-copy" : "text-muted-foreground"
      )}
    >
      {text || missing}
    </p>
  )
}

/** The right-hand panel: what the server is, where it lives, and its state. */
function ServerPanel({
  server,
  places,
  recordsFile,
  tagSuggestions,
  age,
  onAdopt,
  onTogglePlace,
  onSetPlaceEnabled,
  onTest,
  onSave,
  onDelete,
  onSetTags,
  onSetDescription,
  busy,
}: {
  server: McpServer
  places: readonly McpAgentPlace[]
  /** The hub's records file, as a person reads it; empty when unknown. */
  recordsFile: string
  /** Every type the servers carry, for the editor's quick picks. */
  tagSuggestions: string[]
  age: string
  onAdopt: () => void
  onTogglePlace: (place: string) => void
  onSetPlaceEnabled: (place: string, enabled: boolean) => void
  onTest: () => void
  onSave: () => void
  onDelete: () => Promise<void>
  onSetTags: (tags: string[]) => void
  onSetDescription: (description: string) => void
  busy: boolean
}) {
  const { t } = useI18n()
  const states = placesOf(places, server.detail.installs)

  return (
    <aside className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-[84px] shrink-0 items-center gap-3 border-b border-border px-5">
        <ServerTile mark={server.mark} icon={server.check?.icon} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <DialogTitle className="truncate text-[16px] leading-[1.3] font-semibold text-foreground">
            {server.name}
          </DialogTitle>
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
        <DescriptionLine
          text={server.description}
          missing={t("mcp.description.missing")}
          onWrite={onSetDescription}
        />

        <TagEditor
          tags={server.detail.tags}
          suggestions={tagSuggestions}
          onChange={onSetTags}
          words={{
            add: t("mcp.detail.tag.add"),
            placeholder: t("mcp.detail.tag.placeholder"),
            remove: t("mcp.detail.tag.remove"),
          }}
        />

        <Places
          server={server}
          recordsFile={recordsFile}
          states={states}
          onAdopt={onAdopt}
          onToggle={onTogglePlace}
          onSetEnabled={onSetPlaceEnabled}
        />

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
  recordsFile,
  tagSuggestions,
  tools,
  age,
  busy,
  onClose,
  onAdopt,
  onTogglePlace,
  onSetPlaceEnabled,
  onTest,
  onSave,
  onDelete,
  onSetTags,
  onSetDescription,
}: {
  server: McpServer
  places: readonly McpAgentPlace[]
  /** The hub's records file, as a person reads it; empty when unknown. */
  recordsFile: string
  /** Every type the servers carry, for the editor's quick picks. */
  tagSuggestions: string[]
  tools: McpTool[]
  age: string
  busy: boolean
  onClose: () => void
  onAdopt: () => void
  onTogglePlace: (place: string) => void
  onSetPlaceEnabled: (place: string, enabled: boolean) => void
  onTest: () => void
  onSave: (values: ServerFormValues) => void
  onDelete: () => Promise<void>
  onSetTags: (tags: string[]) => void
  onSetDescription: (description: string) => void
}) {
  const { t } = useI18n()
  const [tab, setTab] = React.useState<DetailTab>("config")
  const [values, setValues] = React.useState<ServerFormValues>(() =>
    valuesOf(server.detail.declaration, server.name)
  )
  const [errors, setErrors] = React.useState<ServerFormErrors | null>(null)

  /* What installation writes is the record's own entry, so the pane builds it
     from the record rather than reading a client file back: one of those files
     carries every project's settings beside the servers. */
  const files = React.useMemo(() => {
    const declaration = server.detail.declaration
    if (declaration === null) return null
    return {
      /* The grammar is picked from the extension, as a file's would be. */
      path: "mcp.json",
      text: JSON.stringify({ mcpServers: { [server.name]: entryOf(declaration) } }, null, 2),
    }
  }, [server.detail.declaration, server.name])

  /* A message marks a field until that field is filled, so the two follow every
     edit rather than waiting for the next save. */
  const change = (next: ServerFormValues) => {
    setValues(next)
    if (errors !== null) setErrors(formErrors(next, t))
  }

  const save = () => {
    const missing = formErrors(values, t)
    setErrors(missing)
    if (missing === null) onSave(values)
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogSplit
        pane={
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden"
          >
            {/* A tab is as wide as its own label, so a locale with longer words
                widens the strip instead of overlapping the tabs. */}
            <div className="flex h-12 shrink-0 items-center border-b border-border px-6">
              <TabsList variant="line" className="h-12! gap-7 p-0">
                {TABS.map((entry) => (
                  <TabsTrigger
                    key={entry.id}
                    value={entry.id}
                    className="h-12 flex-none rounded-none border-0 px-0 py-0 text-[13.5px] leading-[1.4] font-medium text-muted-foreground after:inset-x-0 after:bottom-0! after:h-0.5 after:bg-primary data-active:font-semibold data-active:text-foreground"
                  >
                    {t(entry.key)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent value={tab} className="flex min-h-0 flex-1 flex-col">
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
                        onChange={change}
                        notice={t("mcp.form.notice")}
                        errors={errors}
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
            </TabsContent>
          </Tabs>
        }
        panel={
          <ServerPanel
            server={server}
            places={places}
            recordsFile={recordsFile}
            tagSuggestions={tagSuggestions}
            age={age}
            busy={busy}
            onAdopt={onAdopt}
            onTogglePlace={onTogglePlace}
            onSetPlaceEnabled={onSetPlaceEnabled}
            onTest={onTest}
            onSave={save}
            onDelete={onDelete}
            onSetTags={onSetTags}
            onSetDescription={onSetDescription}
          />
        }
      />
    </Dialog>
  )
}
