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
  ContainerIcon,
  GlobeIcon,
  InboxIcon,
  LayoutGridIcon,
  LibraryIcon,
  ListIcon,
  PackagePlusIcon,
  PlugZapIcon,
  PlusIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import { AddServerDialog } from "./add-server-dialog.tsx"
import { ServerCardView } from "./card-view.tsx"
import { useMcpLibrary } from "./library.ts"
import { ServerListView } from "./list-view.tsx"
import { placeWords } from "./place-words.ts"
import type { ServerActions } from "./menus.tsx"
import { ServerDialog } from "./server-dialog.tsx"
import type { ServerFormValues } from "./server-form.tsx"
import { declarationOf } from "./server-form.tsx"
import type { McpAgentPlace, McpPlaceKind, McpServer } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"
import {
  FilterBar,
  PageBody,
  PlaceScopePicker,
  TablePagination,
  type PlaceOption,
} from "@workspace/extensions/components"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { toast } from "@workspace/ui/components/toast"

/** Which axis the tab row is filtering on. */
type TabId = "all" | "library" | "unstored" | "failed" | "workspace" | "global"

/** The tabs that are screens already, rather than a scope holding places. */
type ShellTab = "all" | "library" | "unstored" | "failed"

/** How the catalog is laid out. */
type ViewId = "list" | "grid"

const TAB_MARKS: Record<TabId, LucideIcon> = {
  all: LayoutGridIcon,
  library: LibraryIcon,
  unstored: InboxIcon,
  failed: TriangleAlertIcon,
  workspace: ContainerIcon,
  global: GlobeIcon,
}

const TAB_ORDER: TabId[] = ["all", "library", "unstored", "failed", "workspace", "global"]

/**
 * The tabs a screen shows right now. A screen that holds nothing is left out
 * rather than drawn empty: nothing is failing, or every server is already in
 * the library, is good news the tab row does not need to repeat.
 */
function tabsToShow(counts: Record<ShellTab, number>): TabId[] {
  return TAB_ORDER.filter((id) => id !== "failed" || counts.failed > 0).filter(
    (id) => id !== "unstored" || counts.unstored > 0
  )
}

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

/** The filter tabs: the screens that have something to show, and two scopes. */
function FilterTabs({
  tab,
  onTab,
  counts,
  scopePlaces,
  chosen,
  onChoose,
  onAdopt,
}: {
  tab: TabId
  onTab: (tab: TabId) => void
  counts: Record<ShellTab, number>
  /** The places each scope holds, which its own pill draws as a stack. */
  scopePlaces: Record<McpPlaceKind, readonly PlaceOption[]>
  /** The place the scope on screen is narrowed to; `null` when it is whole. */
  chosen: string | null
  onChoose: (scope: McpPlaceKind, place: string | null) => void
  /** Take every server the library does not hold yet into it. */
  onAdopt: () => void
}) {
  const { t } = useI18n()

  return (
    /* `w-fit` rather than a block box: the trough keeps its own width, so a line
       too narrow for the tabs scrolls inside the wrapper instead of squashing
       them into unreadable slivers. */
    <div className="flex h-11 w-fit items-center gap-1 rounded-full bg-secondary p-1">
      {tabsToShow(counts).map((id) => {
        const Icon = TAB_MARKS[id]

        /* A scope says which places it spans instead of how many servers it
           holds, so the count would be said twice; it opens through its place
           list. */
        if (id === "workspace" || id === "global") {
          const active = tab === id
          return (
            <PlaceScopePicker
              key={id}
              scopeIcon={Icon}
              scopeLabel={t(`mcp.tab.${id}`)}
              places={scopePlaces[id]}
              chosen={active ? chosen : null}
              active={active}
              allLabel={t("mcp.place.all")}
              title={t("mcp.place.which")}
              words={placeWords(t)}
              onChoose={(place) => onChoose(id, place)}
            />
          )
        }

        const active = tab === id

        /* The tab of what the library does not hold carries the one action that
           set is for, and the action opens from the tab itself rather than from
           a mark inside it. */
        if (id === "unstored") {
          return (
            <UnstoredTab
              key={id}
              active={active}
              counts={counts}
              icon={Icon}
              onTab={() => onTab(id)}
              onAdopt={onAdopt}
            />
          )
        }

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
            <TabLabel id={id} counts={counts} active={active} icon={Icon} />
          </button>
        )
      })}
    </div>
  )
}

/**
 * The tab of what the library does not hold: pressing it shows that set, and
 * the one action the set is for opens while the pointer rests on the tab.
 *
 * The tab is itself the trigger, so the whole pill is the area that opens the
 * action. A press opens nothing — on this tab a press is the tab's own switch.
 */
function UnstoredTab({
  active,
  counts,
  icon,
  onTab,
  onAdopt,
}: {
  active: boolean
  counts: Record<ShellTab, number>
  icon: LucideIcon
  onTab: () => void
  onAdopt: () => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next, details) => {
        /* The pointer and the keyboard may open the action; a press may not. */
        if (next && details.reason === "trigger-press") return
        setOpen(next)
      }}
    >
      <DropdownMenuTrigger
        openOnHover
        /* Long enough to cross the gap between the tab and the action. */
        closeDelay={140}
        render={
          <button
            type="button"
            aria-pressed={active}
            onClick={onTab}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4",
              active ? "bg-foreground" : "hover:bg-muted"
            )}
          >
            <TabLabel id="unstored" counts={counts} active={active} icon={icon} />
          </button>
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        /* Drawn in a portal but still a React child of the tab, so its clicks
           would switch the tab under the menu. */
        onClick={(event) => event.stopPropagation()}
        className="w-[220px] p-1"
      >
        <DropdownMenuItem className="gap-2.5 py-2" onClick={onAdopt}>
          <PackagePlusIcon className="size-3.5" />
          <span className="text-[13.5px] leading-[18px] font-semibold">
            {t("mcp.action.adoptAll")}
          </span>
          <span className="ml-auto font-mono text-[12.5px] text-muted-foreground">
            {counts.unstored}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The mark, name and count one tab prints, whatever element carries them. */
function TabLabel({
  id,
  counts,
  active,
  icon: Icon,
}: {
  id: ShellTab
  counts: Record<ShellTab, number>
  active: boolean
  icon: LucideIcon
}) {
  const { t } = useI18n()

  return (
    <>
      <Icon className={cn("size-3.5 shrink-0", active ? "text-background" : "text-muted-foreground")} />
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
    </>
  )
}

/** The row count on the left, and the shared pager on the right. */
function Footer({
  shown,
  total,
  declarations,
  age,
  pager,
}: {
  shown: number
  total: number
  declarations: number
  age: string
  /** What pages this collection; it reads the whole filtered set, so it stays
      put while a view swaps the rows above it. */
  pager: React.ReactNode
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
      <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-4">{pager}</div>
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
  /* The types the servers carry right now — the chips and the detail editor
     both offer these rather than a fixed vocabulary, so a type reads the same
     wherever it appears and picking one cannot invent a second spelling. */
  const serverTags = React.useMemo(
    () =>
      [...new Set(servers.flatMap((server) => server.detail.tags))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [servers]
  )

  const [view, setView] = React.useState<ViewId>("grid")
  const [tab, setTab] = React.useState<TabId>("all")
  /* No tag narrows the list until one is picked. */
  const [tag, setTag] = React.useState("")
  const [query, setQuery] = React.useState("")
  /* One place inside the current scope, once a person picked one from the
     scope's menu; `null` leaves the scope whole. */
  const [narrowed, setNarrowed] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set())
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(12)

  const counts = React.useMemo(() => {
    const failed = servers.filter((server) => server.status === "failed").length
    return {
      all: servers.length,
      library: servers.filter((server) => server.stored).length,
      unstored: servers.filter((server) => !server.stored).length,
      failed,
    } satisfies Record<ShellTab, number>
  }, [servers])

  /* A screen whose tab has just gone — the last failure cleared, the last
     unstored server taken in — leaves the person on the whole list instead of
     an empty one. */
  const activeTab: TabId =
    (tab === "failed" && counts.failed === 0) || (tab === "unstored" && counts.unstored === 0)
      ? "all"
      : tab

  /* Each scope pill names the places it holds by their marks, and its menu
     counts what each place declares, so a person can tell two client files
     apart before opening one. */
  const scopePlaces = React.useMemo(() => {
    const byScope: Record<McpPlaceKind, PlaceOption[]> = { workspace: [], global: [] }
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
    narrowed !== null && places.some((place) => place.scope === activeTab && place.id === narrowed)
      ? narrowed
      : null

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    const scopeOf = new Map(places.map((place) => [place.id, place.scope]))
    return servers.filter((server) => {
      /* The hub's own library: the servers it holds a record for. A server a
         client file declares and no record knows is still a row in the other
         tabs — it is installed somewhere, whether or not the hub wrote it. */
      if (activeTab === "library" && !server.stored) return false
      if (activeTab === "unstored" && server.stored) return false
      if (activeTab === "failed" && server.status !== "failed") return false
      /* A scope holds the servers its own places declare, narrowed to the one
         place its menu last picked. */
      if (activeTab === "workspace" || activeTab === "global") {
        const held = server.detail.installs.filter((install) => install.installed)
        const hit = held.some((install) =>
          chosen === null ? scopeOf.get(install.place) === activeTab : install.place === chosen
        )
        if (!hit) return false
      }
      /* A server matches the picked type when any of its types is it, not just
         the first one, which is only the card's own label. */
      if (tag !== "" && !server.detail.tags.includes(tag)) return false
      if (needle === "") return true
      return (
        server.name.toLowerCase().includes(needle) ||
        server.declaration.toLowerCase().includes(needle) ||
        server.description.toLowerCase().includes(needle)
      )
    })
  }, [servers, query, activeTab, tag, chosen, places])

  /* A filter, an agent switch, or a shorter list can leave the page past the
     end; the page shown is clamped rather than an empty stretch of rows. */
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize))
  const shownPage = Math.min(page, pageCount - 1)
  const rows = React.useMemo(
    () => visible.slice(shownPage * pageSize, (shownPage + 1) * pageSize),
    [visible, shownPage, pageSize]
  )

  const declarations = servers.reduce((sum, server) => sum + server.installed, 0)
  /* A check's own time is what its line says; a server nothing has checked yet
     has only the scan that read its file, which is the fallback both the card
     and the detail panel use. */
  const checkedAge = React.useCallback(
    (server: McpServer) => ageText(server.check?.at ?? catalog?.scannedAt ?? null, t),
    [catalog, t]
  )
  /* The footer speaks for the list, so its time is the newest check any of its
     rows carries; a list nothing has checked falls back to the scan. */
  const age = ageText(
    servers.reduce((newest, server) => Math.max(newest, server.check?.at ?? 0), 0) ||
      catalog?.scannedAt ||
      null,
    t
  )
  const open = servers.find((server) => server.id === openId) ?? null

  const rowActions = React.useCallback(
    (server: McpServer): ServerActions => ({
      places,
      onTogglePlace: (place) => {
        const held = server.detail.installs.find((install) => install.place === place)
        void (held?.installed === true
          ? library.uninstall(server.id, place)
          : library.install(server.id, place))
      },
      onSetPlaceEnabled: (place, enabled) => {
        void library.setEnabled(server.id, place, enabled)
      },
      testing: library.testing.includes(server.id),
      onTest: () => {
        void library.test(server.id)
      },
    }),
    [library, places]
  )

  const installSelected = React.useCallback(
    (place: string) => {
      void Promise.all(
        [...selected].map((id) => library.install(id, place).catch(() => undefined))
      )
    },
    [library, selected]
  )

  /* Take every server the hub does not hold into its library, in one write. */
  const adoptUnstored = React.useCallback(() => {
    void library.adopt(servers.filter((server) => !server.stored).map((server) => server.id))
  }, [library, servers])

  const save = React.useCallback(
    (values: ServerFormValues) => {
      if (open === null) return
      const declaration = declarationOf(values)
      void library.update(open.id, { name: values.name.trim(), declaration }).then(() => {
        toast.add({ type: "success", title: t("mcp.form.saved") })
      })
    },
    [library, open, t]
  )

  const problem = catalog?.problems[0]
  /* What went wrong, in one sentence: a call the hub could not complete first,
     then a client file this scan could not read. It is said in a toast, so a
     stale sentence never stands over the list as if it were its state. */
  const failed =
    library.failure ??
    (problem === undefined
      ? null
      : t("mcp.scan.problem")
          .replace("{path}", placePath(places, problem.place))
          .replace("{message}", problem.message))
  const said = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (failed === null || failed === said.current) return
    said.current = failed
    toast.add({ type: "error", title: failed })
  }, [failed])

  return (
    /* The same shell the skills page uses: a 32px gap between the heading, the
       toolbar, the filters and the body, and the shared body that holds the
       page's footer at the bottom. Every row inside it wraps or scrolls on its
       own, so the page never needs to know how wide it is. */
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
                tab={activeTab}
                onTab={(next) => {
                  setTab(next)
                  setPage(0)
                }}
                counts={counts}
                scopePlaces={scopePlaces}
                chosen={chosen}
                onChoose={(scope, place) => {
                  setTab(scope)
                  setNarrowed(place)
                  setSelected(new Set())
                  setPage(0)
                }}
                onAdopt={adoptUnstored}
              />
            </div>
            <ToolbarActions
              view={view}
              onView={setView}
              onAdd={() => setAdding(true)}
              onCheck={library.refresh}
              checking={library.testing.length > 0}
            />
          </div>

          <FilterBar
            query={query}
            onQuery={(next) => {
              setQuery(next)
              setPage(0)
            }}
            tags={serverTags}
            tag={tag}
            all=""
            onTag={(next) => {
              setTag(next)
              setPage(0)
            }}
            words={{
              search: t("mcp.search.placeholder"),
              clear: t("mcp.search.clear"),
              all: t("mcp.tag.all"),
            }}
          />
        </>
      )}

      <PageBody
        footer={
          catalog === null ? null : (
            <Footer
              shown={rows.length}
              total={visible.length}
              declarations={declarations}
              age={age}
              pager={
                <TablePagination
                  pageText={`${shownPage + 1} / ${pageCount}`}
                  label={t("pager.rowsPerPage")}
                  pageSize={pageSize}
                  onPageSizeChange={(size) => {
                    setPageSize(size)
                    setPage(0)
                  }}
                  canPrev={shownPage > 0}
                  canNext={shownPage + 1 < pageCount}
                  onFirst={() => setPage(0)}
                  onPrev={() => setPage((current) => Math.max(0, current - 1))}
                  onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                  onLast={() => setPage(pageCount - 1)}
                />
              }
            />
          )
        }
      >
        {catalog === null ? (
          <EmptyState
            title={t(library.available ? "mcp.empty.none.title" : "mcp.empty.noStore.title")}
            hint={t(library.available ? "mcp.empty.none.hint" : "mcp.empty.noStore.hint")}
          />
        ) : view === "list" ? (
          <ServerListView
            servers={rows}
            places={places}
            selected={selected}
            age={checkedAge}
            onCheck={(keys) => setSelected(new Set(keys))}
            onInstallSelected={installSelected}
            onOpen={(server) => setOpenId(server.id)}
            rowActions={rowActions}
          />
        ) : (
          <ServerCardView
            servers={rows}
            age={checkedAge}
            onOpen={(server) => setOpenId(server.id)}
            rowActions={rowActions}
          />
        )}
      </PageBody>

      {open === null ? null : (
        <ServerDialog
          server={open}
          places={places}
          recordsFile={library.recordsFile}
          tagSuggestions={serverTags}
          tools={open.detail.tools}
          age={checkedAge(open)}
          busy={library.busy}
          onClose={() => setOpenId(null)}
          onAdopt={() => {
            void library.adopt([open.id])
          }}
          onTogglePlace={(place) => rowActions(open).onTogglePlace(place)}
          onSetPlaceEnabled={(place, enabled) =>
            rowActions(open).onSetPlaceEnabled(place, enabled)
          }
          onTest={() => {
            void library.test(open.id)
          }}
          onSave={save}
          onDelete={() => library.remove(open.id).then(() => setOpenId(null))}
          onSetTags={(tags) => {
            void library.update(open.id, { tags })
          }}
          onSetDescription={(description) => {
            void library.update(open.id, { description })
          }}
        />
      )}
      {adding ? (
        <AddServerDialog
          busy={library.busy}
          canProbe={library.canProbe}
          tagSuggestions={serverTags}
          onTest={library.testDraft}
          onSubmit={(draft) => library.create(draft)}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  )
}
