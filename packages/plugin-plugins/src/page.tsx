/**
 * Plugins as a screen: one catalog, read either as a masonry grid of covers or
 * as a ledger, with a toolbar that narrows and pages the same set for both.
 *
 * This file holds the interface only. The rows come from `./sample.ts`, and the
 * one state the screen keeps is which packs read as installed; reading a pack's
 * own directory, installing it, and the detail view are the module's next step,
 * so nothing here opens a card.
 */
import {
  DownloadIcon,
  HardDriveIcon,
  LayoutGridIcon,
  ListIcon,
  PackageIcon,
  PlugIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchXIcon,
  StoreIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { AddPluginDialog, type AddPluginTab } from "./add-plugin-dialog.tsx"
import { PluginDetailDialog } from "./detail-dialog.tsx"
import { sampleInstalled, samplePlugins } from "./sample.ts"
import type { PluginRow, PluginSource } from "./types.ts"

import type { ExtensionIcon } from "@workspace/extensions"
import {
  FilterBar,
  Ledger,
  PageBody,
  TablePagination,
  type LedgerColumn,
} from "@workspace/extensions/components"
import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

/** Which rows a tab shows: everything, what is installed, or what is not. */
type PluginTab = "all" | "installed" | "available"

const SHELL_TABS: { value: PluginTab; labelKey: string; icon: ExtensionIcon }[] = [
  { value: "all", labelKey: "plugins.tab.all", icon: LayoutGridIcon },
  { value: "installed", labelKey: "plugins.tab.installed", icon: HardDriveIcon },
  { value: "available", labelKey: "plugins.tab.available", icon: StoreIcon },
]

/** The mark for where a pack came from. */
const SOURCE_ICONS: Record<PluginSource, LucideIcon> = {
  marketplace: StoreIcon,
  local: HardDriveIcon,
  builtin: PackageIcon,
}

/** The categories on offer, read from the rows so the chips cannot drift. */
function tagsOf(rows: readonly PluginRow[]): string[] {
  return [...new Set(rows.flatMap((row) => row.tags))].sort()
}

/** The value the "every tag" chip carries. */
const ALL_TAGS = "All tags"

/**
 * Which rows a tab holds, before the tag filter and the query.
 *
 * @param rows — the catalog, already narrowed by the filters.
 * @param value — the tab on screen.
 * @param installed — the ids that read as installed.
 * @returns the rows the tab shows.
 */
function rowsForTab(
  rows: PluginRow[],
  value: PluginTab,
  installed: readonly string[]
): PluginRow[] {
  if (value === "all") return rows
  return rows.filter((row) =>
    value === "installed" ? installed.includes(row.id) : !installed.includes(row.id)
  )
}

/** The three fields the query box reads. */
function matchesQuery(row: PluginRow, text: string) {
  return (
    row.name.toLowerCase().includes(text) ||
    row.description.toLowerCase().includes(text) ||
    row.tags.some((item) => item.toLowerCase().includes(text))
  )
}

const viewToggleSurface = "flex h-11 gap-1 rounded-full bg-secondary p-1"

function TagChip({ tag, size = "sm" }: { tag: string; size?: "sm" | "md" }) {
  const box =
    size === "sm"
      ? "h-[18px] px-1.5 text-[11px] leading-[13px]"
      : "h-[22px] px-[9px] text-[12px] leading-[15px] font-medium"

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${box} bg-secondary text-copy`}
    >
      {tag}
    </span>
  )
}

/* A quiet chip over a cover: a hairline pill on the canvas colour, so a label
   never competes with the picture underneath it. */
const pillSurface =
  "inline-flex h-5 shrink-0 items-center rounded-full bg-card/95 px-[9px] text-[12px] leading-none font-semibold text-foreground ring-1 ring-border"

function TagPill({ tag }: { tag: string }) {
  return <span className={pillSurface}>{tag}</span>
}

/** Where a pack came from, as one quiet line under the card's body. */
function PluginSourceLine({ plugin }: { plugin: PluginRow }) {
  const { t } = useI18n()
  const Icon = SOURCE_ICONS[plugin.source]

  return (
    /* max-w-full clamps the line to its container: without it a fixed-width
       cell's nowrap text sets the box's minimum to the full line, so nothing
       ever shrinks and the text paints over the neighbouring column. */
    <span className="inline-flex max-w-full min-w-0 items-center gap-[5px] text-[12px] leading-[15px]">
      <Icon className="size-[13px] shrink-0 text-muted-soft" aria-hidden />
      <span className="min-w-0 truncate text-muted-foreground">
        {t(`plugins.source.${plugin.source}`)}
      </span>
    </span>
  )
}

/**
 * The one action a row carries. Installing is the row's own action, so it reads
 * as a soft fill; undoing it reads as an outline. Both are the interface's own
 * state until the module writes anything.
 */
function InstallButton({
  plugin,
  installed,
  onToggle,
}: {
  plugin: PluginRow
  installed: boolean
  onToggle: () => void
}) {
  const { t } = useI18n()
  const shell =
    "h-8 gap-1.5 rounded-full px-3 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return installed ? (
    <Button
      type="button"
      variant="outline"
      aria-label={`${t("plugins.action.uninstall")} ${plugin.name}`}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className={`${shell} border-border bg-transparent text-secondary-foreground hover:bg-muted hover:text-foreground dark:border-input dark:bg-transparent`}
    >
      <Trash2Icon className="size-3.5" />
      {t("plugins.action.uninstall")}
    </Button>
  ) : (
    <Button
      type="button"
      aria-label={`${t("plugins.action.install")} ${plugin.name}`}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className={`${shell} bg-secondary text-foreground hover:bg-accent`}
    >
      <DownloadIcon className="size-3.5" />
      {t("plugins.action.install")}
    </Button>
  )
}

/** Ratio a card falls back to before its own cover reports one. */
const FALLBACK_RATIO = 16 / 9

/** Natural ratios already measured, so a re-mounted card lays out without a jump. */
const aspects = new Map<string, number>()

/** The ratio measured for a source earlier in this session, if any. */
function knownAspect(src: string): number | undefined {
  return aspects.get(src)
}

/** Remember an asset's measured ratio for later mounts. */
function rememberAspect(src: string, ratio: number): void {
  if (!Number.isFinite(ratio) || ratio <= 0) return
  aspects.set(src, ratio)
}

/** Cover image that reports its own aspect ratio, for a card sized to the asset. */
function PhotoCover({ src, onRatio }: { src: string; onRatio: (ratio: number) => void }) {
  const ref = React.useRef<HTMLImageElement | null>(null)

  /* A cached image can finish before the load listener attaches. */
  React.useEffect(() => {
    const image = ref.current
    if (image?.complete && image.naturalWidth > 0) {
      onRatio(image.naturalWidth / image.naturalHeight)
    }
  }, [src, onRatio])

  return (
    <img
      ref={ref}
      src={src}
      alt=""
      onLoad={(event) => {
        const image = event.currentTarget
        onRatio(image.naturalWidth / image.naturalHeight)
      }}
      className="size-full object-cover"
    />
  )
}

/**
 * The cover of a pack that ships no picture: its mark, and how much it carries.
 * The card body already states the name and the description, so what is left to
 * say is what installing it would bring.
 */
function BundleCover({ plugin }: { plugin: PluginRow }) {
  const { t } = useI18n()

  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-surface-raised">
      <span className="flex size-11 items-center justify-center rounded-full bg-secondary">
        <PlugIcon className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <span className="font-mono text-[12px] leading-[18px] text-muted-foreground">
        {t("plugins.cover.bundle")
          .replace("{skills}", String(plugin.bundle.skills))
          .replace("{commands}", String(plugin.bundle.commands))}
      </span>
    </div>
  )
}

function PluginCard({
  plugin,
  installed,
  onToggle,
  onOpen,
}: {
  plugin: PluginRow
  installed: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const { t } = useI18n()
  const shownTags = plugin.tags.slice(0, 2)
  const extraTags = plugin.tags.length - shownTags.length
  /* The media box takes the cover's own ratio, so covers are never cropped and
     the columns keep differing heights, which is what the grid reads as. */
  const [ratio, setRatio] = React.useState<number | undefined>(() =>
    plugin.cover === undefined ? undefined : knownAspect(plugin.cover)
  )

  const measure = React.useCallback(
    (next: number) => {
      if (plugin.cover === undefined) return
      rememberAspect(plugin.cover, next)
      setRatio(next)
    },
    [plugin.cover]
  )

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={plugin.name}
      onClick={onOpen}
      onKeyDown={(event) => {
        /* The card holds its own action button, so it cannot be a real button;
           the two keys a button answers to are handled here instead. */
        if (event.key !== "Enter" && event.key !== " ") return
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onOpen()
      }}
      className="mb-5 cursor-pointer overflow-hidden rounded-xl bg-card ring-1 ring-border transition-shadow break-inside-avoid outline-none hover:shadow-soft focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className="relative w-full overflow-hidden bg-surface-raised"
        style={{ aspectRatio: ratio ?? FALLBACK_RATIO }}
      >
        {plugin.cover === undefined ? (
          <BundleCover plugin={plugin} />
        ) : (
          <PhotoCover src={plugin.cover} onRatio={measure} />
        )}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          {shownTags.map((tag) => (
            <TagPill key={tag} tag={tag} />
          ))}
          {extraTags > 0 && (
            <span className={`${pillSurface} text-muted-foreground`}>+{extraTags}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2.5 px-[18px] pt-4 pb-[18px]">
        <div className="flex h-[19px] items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-[14px] leading-[19px] font-semibold">
              {plugin.name}
            </span>
            <span className="shrink-0 font-mono text-[11px] leading-[14px] text-muted-soft">
              {t("plugins.version").replace("{version}", plugin.version)}
            </span>
          </span>
          <span className="shrink-0 text-[12px] leading-[15px] text-muted-soft">
            {plugin.updated}
          </span>
        </div>
        <p className="line-clamp-2 text-[13px] leading-[18px] text-copy">{plugin.description}</p>
        <div className="flex items-center justify-between gap-2">
          <PluginSourceLine plugin={plugin} />
          <InstallButton plugin={plugin} installed={installed} onToggle={onToggle} />
        </div>
      </div>
    </div>
  )
}

/**
 * The content area when there is nothing to show. The toolbar and the filters
 * stay where they are; only this area changes.
 */
function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: ExtensionIcon
  title: string
  hint: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <span className="text-[15px] leading-[20px] font-semibold">{title}</span>
      <span className="max-w-[420px] text-[13px] leading-[18px] text-muted-foreground">
        {hint}
      </span>
      {action === undefined ? null : <div className="mt-1 flex items-center gap-2">{action}</div>}
    </div>
  )
}

function PluginGrid({
  plugins,
  installed,
  onToggle,
  onOpen,
}: {
  plugins: PluginRow[]
  installed: readonly string[]
  onToggle: (plugin: PluginRow) => void
  onOpen: (plugin: PluginRow) => void
}) {
  /*
   * Masonry with a responsive column count, capped at five so a wide window
   * does not keep adding columns. A column needs a 266px card plus the 24px
   * gutter, so each step is 290n - 24; container queries, so the sidebar width
   * does not shift them.
   */
  return (
    <div className="@container">
      <div className="columns-1 gap-x-6 @min-[556px]:columns-2 @min-[846px]:columns-3 @min-[1136px]:columns-4 @min-[1426px]:columns-5">
        {plugins.map((plugin) => (
          <PluginCard
            key={plugin.id}
            plugin={plugin}
            installed={installed.includes(plugin.id)}
            onToggle={() => onToggle(plugin)}
            onOpen={() => onOpen(plugin)}
          />
        ))}
      </div>
    </div>
  )
}

/** The mark a row shows when it has no picture: the pack itself. */
function PluginThumb({ plugin }: { plugin: PluginRow }) {
  if (plugin.cover !== undefined) {
    return (
      <img src={plugin.cover} alt="" className="size-9 shrink-0 rounded-[12px] object-cover" />
    )
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-surface-raised">
      <PlugIcon className="size-4 text-foreground" aria-hidden />
    </span>
  )
}

/**
 * The query's own characters, marked in the accent. Only the table marks them:
 * its rows all look alike, so without the mark there is no way to see which
 * words matched.
 */
function Highlighted({ text, needle }: { text: string; needle: string }) {
  const at = needle === "" ? -1 : text.toLowerCase().indexOf(needle.toLowerCase())
  if (at < 0) return <>{text}</>

  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-primary">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  )
}

function PluginTable({
  plugins,
  needle,
  checked,
  onCheck,
  installed,
  onToggle,
  onOpen,
}: {
  plugins: PluginRow[]
  /** What the filter box holds, marked in the fields it matched. */
  needle: string
  /** Keys of the rows ticked for a batch action. */
  checked: readonly string[]
  onCheck: (keys: string[]) => void
  installed: readonly string[]
  onToggle: (plugin: PluginRow) => void
  onOpen: (plugin: PluginRow) => void
}) {
  const { t } = useI18n()

  /* Column widths as shares of the table, not fixed pixels: the table is
     `table-fixed` inside a panel whose width follows the window, so the shares
     keep the design's proportions at any width. */
  const columns: LedgerColumn<PluginRow>[] = [
    { key: "select", width: "2.9%" },
    {
      key: "plugin",
      label: t("plugins.column.plugin"),
      width: "43.1%",
      cell: (plugin) => (
        <div className="flex items-center gap-3">
          <PluginThumb plugin={plugin} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-mono text-[14px] leading-[18px] font-semibold">
                <Highlighted text={plugin.name} needle={needle} />
              </span>
              <span className="shrink-0 font-mono text-[11px] leading-[14px] text-muted-soft">
                {t("plugins.version").replace("{version}", plugin.version)}
              </span>
            </span>
            <span className="truncate text-[12px] leading-[17px] text-muted-foreground">
              <Highlighted text={plugin.description} needle={needle} />
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "tags",
      label: t("plugins.column.tags"),
      width: "19.3%",
      cell: (plugin) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {plugin.tags.map((tag) => (
            <TagChip key={tag} tag={tag} size="md" />
          ))}
        </div>
      ),
    },
    {
      key: "source",
      label: t("plugins.column.source"),
      width: "16.1%",
      cell: (plugin) => <PluginSourceLine plugin={plugin} />,
    },
    {
      key: "updated",
      label: t("plugins.column.updated"),
      width: "10.1%",
      cell: (plugin) => (
        <span className="text-[13px] text-muted-foreground">{plugin.updated}</span>
      ),
    },
    {
      key: "action",
      label: t("plugins.column.action"),
      width: "8.5%",
      cell: (plugin) => (
        <InstallButton
          plugin={plugin}
          installed={installed.includes(plugin.id)}
          onToggle={() => onToggle(plugin)}
        />
      ),
    },
  ]

  return (
    <Ledger
      columns={columns}
      rows={plugins}
      rowKey={(plugin) => plugin.id}
      checked={checked}
      onCheck={onCheck}
      selectLabel={(plugin) => `${t("plugins.table.select")} ${plugin.name}`}
      selectAllLabel={t("plugins.table.selectAll")}
      batch={{
        label: t("plugins.batch.selected").replace("{count}", String(checked.length)),
        clearLabel: t("plugins.batch.clear"),
        onClear: () => onCheck([]),
        action: (
          <Button
            type="button"
            disabled={checked.length === 0}
            onClick={() => {
              for (const plugin of plugins) {
                if (checked.includes(plugin.id)) onToggle(plugin)
              }
              onCheck([])
            }}
            className="h-[34px] gap-1.5 rounded-full px-4 text-[13px] font-semibold"
          >
            <DownloadIcon className="size-3.5" />
            {t("plugins.action.install")}
          </Button>
        ),
      }}
      onOpen={onOpen}
    />
  )
}

/** The page's own heading; the design sets its one display size to weight 400. */
function PageHeading() {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-display font-normal text-foreground">{t("plugins.title")}</h1>
      <p className="text-[length:var(--text-body)] text-muted-foreground">
        {t("plugins.description")}
      </p>
    </div>
  )
}

/** A value that follows its input once typing stops, not on every keystroke. */
function useSettled(value: string, delay = 180) {
  const [settled, setSettled] = React.useState(value)

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return settled
}

function ViewButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 w-11 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-foreground text-background dark:bg-accent dark:text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-4" />
    </button>
  )
}

export function PluginsPage() {
  const { t } = useI18n()
  const [tab, setTab] = React.useState<PluginTab>("all")
  const [view, setView] = React.useState<"grid" | "list">("grid")
  /* Which segment the Add dialog opens on; `null` while it is closed. */
  const [addTab, setAddTab] = React.useState<AddPluginTab | null>(null)
  /* The pack the detail lightbox is open on, by id. */
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [tag, setTag] = React.useState(ALL_TAGS)
  /* Typing narrows the same list the tag chips do; it is not a new view. */
  const [query, setQuery] = React.useState("")
  const needle = useSettled(query)
  /* Ticked rows, by key. Narrowing the list drops them: a batch action names
     what the person can still see. */
  const [checked, setChecked] = React.useState<readonly string[]>([])
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(12)
  /* Which packs read as installed. Until the module reads a real catalog this
     is the screen's own state, seeded from the sample. */
  const [installed, setInstalled] = React.useState<readonly string[]>(sampleInstalled)
  /* The rows on offer. Reading real packs replaces this list outright; until
     then an edit in the lightbox is a change to this state. */
  const [catalog, setCatalog] = React.useState<PluginRow[]>(samplePlugins)

  const offered = React.useMemo(() => {
    if (needle === "") return catalog
    const text = needle.toLowerCase()
    return catalog.filter((row) => matchesQuery(row, text))
  }, [catalog, needle])

  const filtered = React.useMemo(
    () => (tag === ALL_TAGS ? offered : offered.filter((row) => row.tags.includes(tag))),
    [offered, tag]
  )

  /* A number belongs to every tab: this screen's tabs are states of one set
     rather than places, so each one can say its size. */
  const counts = React.useMemo(
    () => ({
      all: rowsForTab(filtered, "all", installed).length,
      installed: rowsForTab(filtered, "installed", installed).length,
      available: rowsForTab(filtered, "available", installed).length,
    }),
    [filtered, installed]
  )

  const matching = React.useMemo(
    () => rowsForTab(filtered, tab, installed),
    [filtered, tab, installed]
  )

  /* A filter can leave the page past the end; the page shown is clamped rather
     than an empty stretch of rows. */
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize))
  const shownPage = Math.min(page, pageCount - 1)

  const plugins = React.useMemo(
    () => matching.slice(shownPage * pageSize, (shownPage + 1) * pageSize),
    [matching, shownPage, pageSize]
  )

  /* The one write this screen makes: a pack moves between the two tabs. */
  const toggle = (plugin: PluginRow) =>
    setInstalled((held) =>
      held.includes(plugin.id)
        ? held.filter((id) => id !== plugin.id)
        : [...held, plugin.id]
    )

  /* A pack the Add dialog named. Until the module reads a real catalog there is
     nothing to install into, so the name is what the tabs then read. */
  const take = (name: string) =>
    setInstalled((held) => (held.includes(name) ? held : [...held, name]))

  /* The pack the lightbox is open on, read from the catalog rather than the
     page: a filter can take its row away while the lightbox is up. */
  const detail = catalog.find((plugin) => plugin.id === detailId) ?? null

  /* A category edited in the lightbox is that row's own from then on. */
  const setTags = (plugin: PluginRow, tags: string[]) =>
    setCatalog((rows) =>
      rows.map((row) => (row.id === plugin.id ? { ...row, tags } : row))
    )

  const pagination = (
    <TablePagination
      pageText={`${shownPage + 1} / ${pageCount}`}
      label={t("pager.rowsPerPage")}
      pageSize={pageSize}
      canPrev={shownPage > 0}
      canNext={shownPage + 1 < pageCount}
      onPageSizeChange={(size) => {
        setPageSize(size)
        setPage(0)
      }}
      onFirst={() => setPage(0)}
      onPrev={() => setPage((current) => Math.max(0, current - 1))}
      onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
      onLast={() => setPage(pageCount - 1)}
    />
  )

  /* The page's own footer, not a strip inside whichever view is open: it reads
     the whole filtered set, so switching views leaves it where it is. */
  const footer =
    plugins.length === 0 ? null : (
      <div className="flex h-9 shrink-0 items-center justify-between gap-4">
        <span className="text-[13px] text-muted-foreground">
          {t("plugins.footer.count")
            .replace("{shown}", String(plugins.length))
            .replace("{total}", String(matching.length))}
        </span>
        {pagination}
      </div>
    )

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeading />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(SHELL_TABS.find((item) => item.value === value)?.value ?? "all")
          setPage(0)
          setChecked([])
        }}
        className="flex-1 gap-8"
      >
        <div className="flex items-center justify-between gap-6">
          <TabsList className="h-11! gap-1 rounded-full bg-secondary p-1">
            {SHELL_TABS.map((item) => {
              const count = counts[item.value]
              return (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="h-9 flex-none gap-1.5 rounded-full px-4 text-[length:var(--text-body)] text-muted-foreground data-active:bg-foreground data-active:text-background data-active:hover:text-background dark:data-active:bg-accent dark:data-active:text-foreground"
                >
                  <item.icon className="size-3.5 shrink-0" aria-hidden />
                  {t(item.labelKey)}
                  <span className={`font-mono text-[13px] ${count === 0 ? "opacity-45" : ""}`}>
                    {count}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
          <div className="flex shrink-0 items-center gap-2">
            <div className={viewToggleSurface}>
              <ViewButton
                icon={LayoutGridIcon}
                label={t("plugins.view.grid")}
                active={view === "grid"}
                onClick={() => setView("grid")}
              />
              <ViewButton
                icon={ListIcon}
                label={t("plugins.view.list")}
                active={view === "list"}
                onClick={() => setView("list")}
              />
            </div>
            <Button
              variant="outline"
              className="h-9 gap-2 rounded-full border-border bg-transparent px-4 dark:border-input dark:bg-transparent"
            >
              <RefreshCwIcon />
              {t("plugins.action.checkUpdates")}
            </Button>
            <Button className="h-9 gap-2 rounded-full px-4" onClick={() => setAddTab("marketplace")}>
              <PlusIcon />
              {t("plugins.action.add")}
            </Button>
          </div>
        </div>
        <FilterBar
          query={query}
          onQuery={(next) => {
            setQuery(next)
            setChecked([])
          }}
          tags={tagsOf(catalog)}
          tag={tag}
          all={ALL_TAGS}
          onTag={(next) => {
            setTag(next)
            setChecked([])
          }}
          words={{
            search: t("plugins.filter.placeholder"),
            clear: t("plugins.filter.clear"),
            all: t("plugins.allTags"),
          }}
        />
        <TabsContent value={tab} className="flex flex-col">
          <PageBody footer={footer}>
            {plugins.length === 0 ? (
              needle !== "" ? (
                /* The filters, not the catalog: saying "no plugins yet" here
                   would be a lie about a catalog that may hold plenty. */
                <EmptyState
                  icon={SearchXIcon}
                  title={t("plugins.empty.filter")}
                  hint={t("plugins.empty.filterHint").replace("{query}", needle)}
                  action={
                    <Button
                      className="h-10 rounded-full px-4"
                      onClick={() => {
                        setQuery("")
                        setTag(ALL_TAGS)
                      }}
                    >
                      {t("plugins.filter.reset")}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={SHELL_TABS.find((item) => item.value === tab)?.icon ?? PlugIcon}
                  title={t("plugins.empty.tab")}
                  hint={t("plugins.empty.tabHint")}
                  action={
                    <Button className="h-10 rounded-full px-4" onClick={() => setTab("all")}>
                      {t("plugins.tab.all")}
                    </Button>
                  }
                />
              )
            ) : view === "grid" ? (
              <PluginGrid
                plugins={plugins}
                installed={installed}
                onToggle={toggle}
                onOpen={(plugin) => setDetailId(plugin.id)}
              />
            ) : (
              <PluginTable
                plugins={plugins}
                needle={needle}
                checked={checked}
                onCheck={setChecked}
                installed={installed}
                onToggle={toggle}
                onOpen={(plugin) => setDetailId(plugin.id)}
              />
            )}
          </PageBody>
        </TabsContent>
      </Tabs>
      <AddPluginDialog
        open={addTab !== null}
        tab={addTab ?? "marketplace"}
        installed={installed}
        onTabChange={setAddTab}
        onOpenChange={(next) => {
          if (!next) setAddTab(null)
        }}
        onInstall={take}
      />
      <PluginDetailDialog
        plugin={detail}
        installed={detail !== null && installed.includes(detail.id)}
        tagSuggestions={tagsOf(catalog)}
        onToggleInstall={toggle}
        onTagsChange={(tags) => {
          if (detail !== null) setTags(detail, tags)
        }}
        onOpenChange={(next) => {
          if (!next) setDetailId(null)
        }}
      />
    </div>
  )
}
