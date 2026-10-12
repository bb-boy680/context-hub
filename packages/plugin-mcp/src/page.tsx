/**
 * The MCP servers page: title and description, the filter bar and its tag row,
 * the ledger or the card grid, and the footer. It is the only screen this
 * plugin contributes today; the detail and add dialogs hang off it.
 *
 * Every value comes from the form's MCP store — what the client files declare
 * and what the hub recorded — so a menu's click lands in a file rather than in
 * this component's state.
 */
import {
  ChevronDownIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  ContainerIcon,
  GlobeIcon,
  LayoutGridIcon,
  ListIcon,
  PlugZapIcon,
  PlusIcon,
  SearchIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import { AddServerDialog } from "./add-server-dialog.tsx"
import { ServerCardView } from "./card-view.tsx"
import { MCP_TAGS, tagList, useMcpLibrary } from "./library.ts"
import { ServerListView } from "./list-view.tsx"
import type { StackPlace } from "./place-picker.tsx"
import { PlacePicker } from "./place-picker.tsx"
import type { ServerActions } from "./menus.tsx"
import { ServerDialog } from "./server-dialog.tsx"
import type { ServerFormValues } from "./server-form.tsx"
import { declarationOf } from "./server-form.tsx"
import type { McpAgentPlace, McpConfigFile, McpPlaceKind, McpServer } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import { Kbd } from "@workspace/ui/components/kbd"

/** Which axis the tab row is filtering on. */
type TabId = "all" | "ready" | "failed" | "workspace" | "global"

/** The tabs that are screens already, rather than a scope holding places. */
type ShellTab = "all" | "ready" | "failed"

/** How the catalog is laid out. */
type ViewId = "list" | "grid"

const TAB_MARKS: Record<TabId, LucideIcon> = {
  all: LayoutGridIcon,
  ready: CircleCheckIcon,
  failed: TriangleAlertIcon,
  workspace: ContainerIcon,
  global: GlobeIcon,
}

const TAB_ORDER: TabId[] = ["all", "ready", "failed", "workspace", "global"]

/** How long ago something happened, in the three steps a card or a footer prints. */
function ageText(at: number | null, t: (key: string) => string): string {
  if (at === null) return t("mcp.age.now")
  const minutes = Math.floor((Date.now() - at) / 60_000)
  if (minutes < 1) return t("mcp.age.now")
  if (minutes < 60) return t("mcp.age.minutes").replace("{count}", String(minutes))
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t("mcp.age.hours").replace("{count}", String(hours))
  return t("mcp.age.days").replace("{count}", String(Math.floor(hours / 24)))
}

/** The file a place writes to, as the read failure's line names it. */
function placePath(places: readonly McpAgentPlace[], place: string): string {
  return places.find((entry) => entry.id === place)?.path ?? place
}

/** The pill actions on the toolbar's right end. */
function ToolbarActions({
  view,
  onView,
  onAdd,
  onCheck,
  checking,
}: {
  view: ViewId
  onView: (view: ViewId) => void
  onAdd: () => void
  onCheck: () => void
  checking: boolean
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* The view switch carries the skills page's measurements: a 44px trough
          with 4px padding, so its buttons are 36px tall. */}
      <div className="flex h-11 items-center gap-1 rounded-full bg-secondary p-1">
        {(
          [
            ["grid", LayoutGridIcon, "mcp.view.grid"],
            ["list", ListIcon, "mcp.view.list"],
          ] as const
        ).map(([id, Icon, labelKey]) => (
          <button
            key={id}
            type="button"
            aria-label={t(labelKey)}
            aria-pressed={view === id}
            onClick={() => onView(id)}
            className={cn(
              "flex h-9 w-11 shrink-0 items-center justify-center rounded-full",
              view === id ? "bg-foreground" : "hover:bg-muted"
            )}
          >
            <Icon className={cn("size-4", view === id ? "text-background" : "text-muted-foreground")} />
          </button>
        ))}
      </div>
      <Button
        variant="outline"
        onClick={onCheck}
        disabled={checking}
        className="h-9 shrink-0 gap-2 rounded-full border-border bg-transparent px-4 dark:border-input dark:bg-transparent"
      >
        <PlugZapIcon className={cn(checking && "animate-spin")} />
        {t(checking ? "mcp.action.checking" : "mcp.action.checkAll")}
      </Button>
      <Button className="h-9 shrink-0 gap-2 rounded-full px-4" onClick={onAdd}>
        <PlusIcon />
        {t("mcp.action.addServer")}
      </Button>
    </div>
  )
}

/** The five filter tabs: three screens, each with its count, and two scopes. */
function FilterTabs({
  tab,
  onTab,
  counts,
  scopePlaces,
  chosen,
  onChoose,
}: {
  tab: TabId
  onTab: (tab: TabId) => void
  counts: Record<ShellTab, number>
  /** The places each scope holds, which its own pill draws as a stack. */
  scopePlaces: Record<McpPlaceKind, readonly StackPlace[]>
  /** The place the scope on screen is narrowed to; `null` when it is whole. */
  chosen: string | null
  onChoose: (scope: McpPlaceKind, place: string | null) => void
}) {
  const { t } = useI18n()

  return (
    /* `w-fit` rather than a block box: the trough keeps its own width, so a line
       too narrow for five tabs scrolls inside the wrapper instead of squashing
       them into unreadable slivers. */
    <div className="flex h-11 w-fit items-center gap-1 rounded-full bg-secondary p-1">
      {TAB_ORDER.map((id) => {
        const Icon = TAB_MARKS[id]

        /* A scope says which places it spans instead of how many servers it
           holds, so the count would be said twice; it opens through its place
           list. */
        if (id === "workspace" || id === "global") {
          const active = tab === id
          return (
            <PlacePicker
              key={id}
              scopeIcon={Icon}
              scopeLabel={t(`mcp.tab.${id}`)}
              places={scopePlaces[id]}
              chosen={active ? chosen : null}
              active={active}
              onChoose={(place) => onChoose(id, place)}
            />
          )
        }

        const active = tab === id

        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onTab(id)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4",
              active ? "bg-foreground" : "hover:bg-muted"
            )}
          >
            <Icon className={cn("size-3.5", active ? "text-background" : "text-muted-foreground")} />
            <span
              className={cn(
                "text-[length:var(--text-body)] leading-[1.3]",
                active ? "font-semibold text-background" : "font-medium text-muted-foreground"
              )}
            >
              {t(`mcp.tab.${id}`)}
            </span>
            <span
              className={cn(
                "font-mono text-[length:var(--text-body)] leading-[1.3]",
                active ? "text-background" : "text-muted-soft"
              )}
            >
              {counts[id]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** The search field and the tag chips, which filter the same list. */
function FilterRow({
  query,
  onQuery,
  tag,
  onTag,
  tags,
}: {
  query: string
  onQuery: (query: string) => void
  tag: string
  onTag: (tag: string) => void
  tags: { id: string; label: string }[]
}) {
  const { t } = useI18n()

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      {/* The field keeps the canvas's 300px. The chips stay beside it while the
          whole group fits on that line, then drop to a line of their own —
          `min-w-fit` is what keeps the group from splitting mid-row. */}
      <div className="flex h-11 w-[300px] max-w-full shrink-0 items-center gap-2 rounded-md border border-border px-3.5 focus-within:border-primary">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t("mcp.search.placeholder")}
          aria-label={t("mcp.search.placeholder")}
          className="min-w-0 flex-1 bg-transparent text-[length:var(--text-body)] outline-none placeholder:text-muted-foreground/70"
        />
        <Kbd className="shrink-0 border-0 bg-transparent text-muted-foreground">/</Kbd>
      </div>
      <div className="flex min-w-fit shrink-0 grow basis-[280px] flex-wrap items-center gap-2">
        {tags.map((entry) => {
          const active = tag === entry.id
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={active}
              onClick={() => onTag(entry.id)}
              className={cn(
                "flex h-8 shrink-0 items-center justify-center rounded-full px-3.5 text-[length:var(--text-caption)] whitespace-nowrap transition-colors",
                active
                  ? "bg-foreground font-semibold text-background"
                  : "bg-secondary font-medium text-foreground hover:bg-accent"
              )}
            >
              {entry.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The row count, the page size, and the four page buttons. */
function Footer({
  shown,
  total,
  declarations,
  age,
}: {
  shown: number
  total: number
  declarations: number
  age: string
}) {
  const { t } = useI18n()

  return (
    <div className="flex min-h-9 min-w-0 flex-wrap items-center justify-between gap-4">
      <span className="text-[length:var(--text-body)] text-muted-foreground">
        {t("mcp.footer.count")
          .replace("{shown}", String(shown))
          .replace("{total}", String(total))
          .replace("{declarations}", String(declarations))
          .replace("{time}", age)}
      </span>
      <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-4">
        <span className="text-[length:var(--text-caption)] text-muted-foreground">
          {t("pager.rowsPerPage")}
        </span>
        <button
          type="button"
          className="flex h-8 w-[100px] shrink-0 items-center justify-between rounded-full border border-border px-2.5"
        >
          <span className="text-[length:var(--text-body)] text-foreground">12</span>
          <ChevronDownIcon className="size-4 text-muted-soft" />
        </button>
        <span className="text-[length:var(--text-caption)] text-muted-foreground">1 / 1</span>
        <div className="flex items-center gap-1">
          {(
            [
              [ChevronsLeftIcon, "mcp.footer.first"],
              [ChevronLeftIcon, "mcp.footer.previous"],
              [ChevronRightIcon, "mcp.footer.next"],
              [ChevronsRightIcon, "mcp.footer.last"],
            ] as const
          ).map(([Icon, labelKey]) => (
            <button
              key={labelKey}
              type="button"
              aria-label={t(labelKey)}
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted"
            >
              <Icon className="size-4 text-muted-soft" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A page that has nothing to show yet, and says which "nothing" it is. */
function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card p-8 text-center">
      <span className="text-[14px] leading-[1.4] font-semibold text-foreground">{title}</span>
      <span className="max-w-[420px] text-[12.5px] leading-[1.5] text-muted-foreground">{hint}</span>
    </div>
  )
}

export function McpServersPage() {
  const { t } = useI18n()
  const library = useMcpLibrary()
  const catalog = library.catalog
  const servers = React.useMemo(() => catalog?.servers ?? [], [catalog])
  const places = library.places
  const tags = React.useMemo(() => tagList(t), [t])

  const [view, setView] = React.useState<ViewId>("grid")
  const [tab, setTab] = React.useState<TabId>("all")
  const [tag, setTag] = React.useState(MCP_TAGS[0])
  const [query, setQuery] = React.useState("")
  /* One place inside the current scope, once a person picked one from the
     scope's menu; `null` leaves the scope whole. */
  const [narrowed, setNarrowed] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set())
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  /* The files a server's places hold, tagged with the server they were read
     for: a list that belongs to a closed dialog is simply not shown. */
  const [held, setHeld] = React.useState<{ id: string; files: McpConfigFile[] } | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const counts = React.useMemo(() => {
    const ready = servers.filter((server) => server.status === "ready").length
    return {
      all: servers.length,
      ready,
      failed: servers.length - ready,
    } satisfies Record<ShellTab, number>
  }, [servers])

  /* Each scope pill names the places it holds by their marks, and its menu
     counts what each place declares, so a person can tell two client files
     apart before opening one. */
  const scopePlaces = React.useMemo(() => {
    const byScope: Record<McpPlaceKind, StackPlace[]> = { workspace: [], global: [] }
    for (const place of places) {
      byScope[place.scope].push({
        id: place.id,
        icon: place.icon,
        label: place.label,
        where: place.path,
        count: servers.filter((server) =>
          server.detail.installs.some((install) => install.place === place.id && install.installed)
        ).length,
      })
    }
    return byScope
  }, [places, servers])

  /* A choice from a scope's menu only means something while that scope is the
     one on screen; anywhere else the scope is whole. */
  const chosen =
    narrowed !== null && places.some((place) => place.scope === tab && place.id === narrowed)
      ? narrowed
      : null

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    const scopeOf = new Map(places.map((place) => [place.id, place.scope]))
    return servers.filter((server) => {
      if (tab === "ready" && server.status !== "ready") return false
      if (tab === "failed" && server.status !== "failed") return false
      /* A scope holds the servers its own places declare, narrowed to the one
         place its menu last picked. */
      if (tab === "workspace" || tab === "global") {
        const held = server.detail.installs.filter((install) => install.installed)
        const hit = held.some((install) =>
          chosen === null ? scopeOf.get(install.place) === tab : install.place === chosen
        )
        if (!hit) return false
      }
      if (tag !== MCP_TAGS[0] && server.tag !== tag) return false
      if (needle === "") return true
      return (
        server.name.toLowerCase().includes(needle) ||
        server.declaration.toLowerCase().includes(needle) ||
        server.description.toLowerCase().includes(needle)
      )
    })
  }, [servers, query, tab, tag, chosen, places])

  const declarations = servers.reduce((sum, server) => sum + server.installed, 0)
  const age = ageText(catalog?.scannedAt ?? null, t)
  const open = servers.find((server) => server.id === openId) ?? null
  const files = held !== null && held.id === openId ? held.files : []
  const installedPlaces = (open?.detail.installs ?? [])
    .filter((install) => install.installed)
    .map((install) => install.place)
  /* Joined, because the array is rebuilt on every render and two loads of the
     same places are the same load. */
  const placesKey = installedPlaces.join(",")

  /* The config-files pane reads the whole file, so the page asks for it when a
     server is opened rather than on every scan. The answer is tagged with the
     server it was read for, so a late one cannot land under another dialog. */
  React.useEffect(() => {
    if (openId === null || placesKey === "") return
    let live = true
    const list = placesKey.split(",")
    void Promise.all(list.map((place) => library.file(openId, place))).then((loaded) => {
      if (!live) return
      setHeld({ id: openId, files: loaded.filter((file): file is McpConfigFile => file !== null) })
    })
    return () => {
      live = false
    }
  }, [library, openId, placesKey])

  const run = (action: () => Promise<void>) => {
    setNotice(null)
    return action()
  }

  const rowActions = React.useCallback(
    (server: McpServer): ServerActions => ({
      places,
      onTogglePlace: (place) => {
        const held = server.detail.installs.find((install) => install.place === place)
        void run(() =>
          held?.installed === true
            ? library.uninstall(server.id, place)
            : library.install(server.id, place)
        )
      },
      onSetPlaceEnabled: (place, enabled) => {
        void run(() => library.setEnabled(server.id, place, enabled))
      },
      onTest: () => {},
    }),
    [library, places]
  )

  const toggle = React.useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = React.useCallback(() => {
    setSelected((current) =>
      current.size === visible.length ? new Set() : new Set(visible.map((server) => server.id))
    )
  }, [visible])

  const installSelected = React.useCallback(
    (place: string) => {
      setNotice(null)
      void Promise.all(
        [...selected].map((id) => library.install(id, place).catch(() => undefined))
      )
    },
    [library, selected]
  )

  const save = React.useCallback(
    (values: ServerFormValues) => {
      if (open === null) return
      const declaration = declarationOf(values)
      void run(() =>
        library.update(open.id, { name: values.name, declaration }).then(() => {
          setNotice(t("mcp.form.saved"))
        })
      )
    },
    [library, open, t]
  )

  const problem = catalog?.problems[0]
  /* One line under the filters: a failed write first, then what the last check
     found that a person has to act on. */
  const status =
    library.failure ??
    notice ??
    (problem === undefined
      ? null
      : t("mcp.scan.problem")
          .replace("{path}", placePath(places, problem.place))
          .replace("{message}", problem.message))

  return (
    /* The same shell the skills page uses: the shell's own padding, and a 32px
       gap between the heading, the toolbar, the filters and the list. Every row
       below wraps or scrolls on its own, so the page never needs to know how
       wide it is. */
    <div className="flex min-w-0 flex-1 flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-display font-normal text-foreground">{t("mcp.title")}</h1>
        <p className="text-[length:var(--text-body)] text-muted-foreground">
          {t("mcp.description")}
        </p>
      </div>

      {catalog === null ? null : (
        <>
          {/* The tabs and the actions are two groups that each want a whole line,
              so they wrap onto two rather than scroll sideways out of the page. */}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-6">
            <div className="min-w-0 max-w-full overflow-x-auto">
              <FilterTabs
                tab={tab}
                onTab={setTab}
                counts={counts}
                scopePlaces={scopePlaces}
                chosen={chosen}
                onChoose={(scope, place) => {
                  setTab(scope)
                  setNarrowed(place)
                  setSelected(new Set())
                }}
              />
            </div>
            <ToolbarActions
              view={view}
              onView={setView}
              onAdd={() => setAdding(true)}
              onCheck={library.refresh}
              checking={library.busy}
            />
          </div>

          <FilterRow
            query={query}
            onQuery={setQuery}
            tag={tag}
            onTag={setTag}
            tags={tags}
          />
        </>
      )}

      {status === null ? null : (
        <span className="text-[12.5px] leading-[1.4] text-destructive">{status}</span>
      )}

      {catalog === null ? (
        <EmptyState
          title={t(library.available ? "mcp.empty.none.title" : "mcp.empty.noStore.title")}
          hint={t(library.available ? "mcp.empty.none.hint" : "mcp.empty.noStore.hint")}
        />
      ) : view === "list" ? (
        <ServerListView
          servers={visible}
          places={places}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onClearSelection={() => setSelected(new Set())}
          onInstallSelected={installSelected}
          onOpen={(server) => setOpenId(server.id)}
          rowActions={rowActions}
        />
      ) : (
        <ServerCardView
          servers={visible}
          tags={tags}
          age={age}
          onOpen={(server) => setOpenId(server.id)}
          rowActions={rowActions}
        />
      )}

      {catalog === null ? null : (
        <Footer
          shown={visible.length}
          total={servers.length}
          declarations={declarations}
          age={age}
        />
      )}

      {open === null ? null : (
        <ServerDialog
          server={open}
          places={places}
          tags={tags}
          files={files}
          tools={[]}
          age={age}
          busy={library.busy}
          onClose={() => setOpenId(null)}
          onTogglePlace={(place) => rowActions(open).onTogglePlace(place)}
          onSetPlaceEnabled={(place, enabled) =>
            rowActions(open).onSetPlaceEnabled(place, enabled)
          }
          onTest={() => {}}
          onSave={save}
          onDelete={() => run(() => library.remove(open.id).then(() => setOpenId(null)))}
        />
      )}
      {adding ? (
        <AddServerDialog
          busy={library.busy}
          onSubmit={(draft) => library.create(draft)}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  )
}
