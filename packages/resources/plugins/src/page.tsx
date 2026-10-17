/**
 * Plugins as a screen: one catalog, read either as a masonry grid of covers or
 * as a ledger, with a toolbar that narrows and pages the same set for both.
 *
 * This file holds the interface only: the rows come from `./library.ts`, which
 * folds the library's records and the clients' own answers in `./rows.ts`. Every
 * row opens the detail lightbox — a pack no library record holds yet is read
 * there too, and taking it in is what that lightbox offers.
 */
import {
  CircleArrowUpIcon,
  ContainerIcon,
  DownloadIcon,
  FileArchiveIcon,
  FolderGit2Icon,
  GitBranchIcon,
  GlobeIcon,
  HardDriveIcon,
  InboxIcon,
  LayoutGridIcon,
  LibraryIcon,
  ListIcon,
  PackagePlusIcon,
  PlugIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchXIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { AddPluginDialog, type AddPluginTab } from "./add-plugin-dialog.tsx"
import { PluginDetailDialog } from "./detail-dialog.tsx"
import { PluginActions } from "./install-actions.tsx"
import {
  packImageBase,
  reasonOf,
  usePackReadme,
  usePluginLibrary,
  type PackUploadFile,
  type PluginClient,
  type PluginCollected,
} from "./library.ts"
import { rowsForTab, SCOPE_LABELS, type PluginTab } from "./rows.ts"
import { PluginTile } from "./parts.tsx"
import type { PluginRow, PluginSource } from "./types.ts"
import type { PluginInstallScope } from "./contract.ts"

import type { AssetScope, ExtensionIcon } from "@context-hub/extensions"
import {
  ActionTab,
  AutoplayVideo,
  AvatarStack,
  FilterBar,
  Ledger,
  PageBody,
  PlaceScopePicker,
  TablePagination,
  knownAspect,
  mediaKind,
  rememberAspect,
  type LedgerColumn,
  type PlaceOption,
  type PlaceWords,
} from "@context-hub/extensions/components"
import { useI18n } from "@context-hub/extensions/react"
import { Button } from "@context-hub/shadcn-ui/components/button"
import { Markdown } from "@context-hub/shadcn-ui/components/markdown"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@context-hub/shadcn-ui/components/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@context-hub/shadcn-ui/components/dropdown-menu"
import { toast } from "@context-hub/shadcn-ui/components/toast"

/* The tab row carries two dimensions. Four entries are the hub's own view of the
   catalog — everything, what it holds the files of, what only an agent holds,
   and what a source has moved past. The last of the four stands for what is
   missing rather than for where anything is, so it carries the one batch action
   its set is for and the toolbar stays about the page as a whole. The last two
   group the agents by the kind of place they hold a pack in: one inside the
   repository in use, and one machine-wide. */
const SHELL_TABS: { value: PluginTab; labelKey: string; icon: ExtensionIcon }[] = [
  { value: "all", labelKey: "plugins.tab.all", icon: LayoutGridIcon },
  { value: "library", labelKey: "plugins.tab.library", icon: LibraryIcon },
  { value: "unstored", labelKey: "plugins.tab.unstored", icon: InboxIcon },
  { value: "updates", labelKey: "plugins.tab.updates", icon: CircleArrowUpIcon },
  { value: "workspace", labelKey: "plugins.tab.workspace", icon: ContainerIcon },
  { value: "global", labelKey: "plugins.tab.global", icon: GlobeIcon },
]

/** The tabs that group the agents by where they hold a pack, which open a menu. */
const SCOPE_TABS: PluginTab[] = ["workspace", "global"]

/** The mark for where a pack came from. */
const SOURCE_ICONS: Record<PluginSource, LucideIcon> = {
  repo: GitBranchIcon,
  subdir: FolderGit2Icon,
  archive: FileArchiveIcon,
  local: HardDriveIcon,
}

/** The categories on offer, read from the rows so the chips cannot drift. */
function tagsOf(rows: readonly PluginRow[]): string[] {
  return [...new Set(rows.flatMap((row) => row.tags))].sort()
}

/** The value the "every tag" chip carries. */
const ALL_TAGS = "All tags"

/** The three fields the query box reads. */
function matchesQuery(row: PluginRow, text: string) {
  return (
    row.name.toLowerCase().includes(text) ||
    row.description.toLowerCase().includes(text) ||
    row.tags.some((item) => item.toLowerCase().includes(text))
  )
}

/**
 * The words every place list on this page draws, resolved in the active locale.
 * The list itself knows no keys: a module hands it the strings it owns.
 *
 * @param t — the active locale's lookup.
 * @returns the strings a place menu draws.
 */
function placeWords(t: (key: string) => string): PlaceWords {
  return {
    search: t("plugins.place.search"),
    searchClear: t("plugins.place.searchClear"),
    searchEmpty: t("plugins.place.searchEmpty"),
    count: (total) => t("plugins.location.count").replace("{count}", String(total)),
  }
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

/**
 * What a row's own line says about where the pack is: the hub's own word for the
 * kind of source it collected the pack from. A pack the hub does not hold is
 * worded as what it is — a directory on this machine — because that is where the
 * agents holding it read it from.
 */
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
 * The agents holding a pack, as their own marks.
 *
 * It answers "which agents have this" without the row being opened, which is the
 * question a pack's source word cannot: a pack collected from a repository can
 * still be sitting in three agents, and one only an agent holds is worded as a
 * local directory like every other pack on this machine.
 */
function HolderStack({ plugin }: { plugin: PluginRow }) {
  if (plugin.held.length === 0) return null

  return (
    <AvatarStack
      marks={plugin.held.map((hold) => ({ id: hold.client, icon: hold.icon }))}
      seam="ring-card"
      label={plugin.held.map((hold) => hold.label).join(" · ")}
    />
  )
}

/** What every row's action cluster needs, gathered so it travels as one prop. */
interface RowActions {
  /** The clients this hub can deliver to, with what each one already holds. */
  clients: readonly PluginClient[]
  /** True while a call is in flight, which disables the actions. */
  busy: boolean
  onUpdate: (plugin: PluginRow) => void
  onInstall: (plugin: PluginRow, client: string, scope: PluginInstallScope) => void
  onUninstall: (plugin: PluginRow, client: string, scope: PluginInstallScope) => void
  /** Switch an agent's own use of a pack on or off, where it already sits. */
  onSetEnabled: (plugin: PluginRow, client: string, scope: PluginInstallScope, on: boolean) => void
  /** Take a pack an agent holds into the library. */
  onAdopt: (plugin: PluginRow) => void
}

/** The one action a row carries: the pack's own actions, over the install places. */
function InstallButton({ plugin, actions }: { plugin: PluginRow; actions: RowActions }) {
  return (
    <PluginActions
      plugin={plugin}
      clients={actions.clients}
      busy={actions.busy}
      onUpdate={() => actions.onUpdate(plugin)}
      onInstall={(client, scope) => actions.onInstall(plugin, client, scope)}
      onUninstall={(client, scope) => actions.onUninstall(plugin, client, scope)}
      onSetEnabled={(client, scope, on) => actions.onSetEnabled(plugin, client, scope, on)}
    />
  )
}

/** Ratio a card falls back to before its own cover reports one. */
const FALLBACK_RATIO = 16 / 9

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
 * The cover of a pack that ships no picture: its mark, and the version the pack
 * itself declares. The card body already states the name and the description, so
 * what is left to say is which revision of it this is.
 */
function BundleCover({ plugin }: { plugin: PluginRow }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-surface-raised">
      <span className="flex size-11 items-center justify-center rounded-full bg-secondary">
        <PlugIcon className="size-5 text-muted-foreground" aria-hidden />
      </span>
      {plugin.version === "" ? null : (
        <span className="font-mono text-[12px] leading-[18px] text-muted-foreground">
          {plugin.version}
        </span>
      )}
    </div>
  )
}

/**
 * The cover of a pack with no picture: what the pack says about itself, rendered
 * as the document it is. A cover is a thumbnail, so the document is clipped
 * rather than scrolled — a card reads as one, not as a reading surface.
 */
function ReadmeCover({ plugin }: { plugin: PluginRow }) {
  const readme = usePackReadme(plugin)
  if (readme === undefined || readme === null) return <BundleCover plugin={plugin} />

  return (
    <div
      className={`size-full overflow-hidden bg-surface-raised px-[18px] text-[12px] leading-[18px] text-secondary-foreground ${
        /* Room for the tag pills, which sit over this corner; nothing to clear without them. */
        plugin.tags.length > 0 ? "pt-10" : "py-3.5"
      }`}
    >
      <Markdown imageBase={packImageBase(plugin)}>{readme}</Markdown>
    </div>
  )
}

/**
 * What fills a card's cover box: the first picture a person added, drawn or
 * played by whatever kind it is, and the pack's own document when there is none.
 * A pack with a picture reads no document at all, which is why the README is read
 * inside the branch that needs it.
 */
function CoverFace({
  plugin,
  source,
  onRatio,
}: {
  plugin: PluginRow
  /** The picture being drawn, as a URL. */
  source: string | undefined
  onRatio: (ratio: number) => void
}) {
  if (source === undefined) return <ReadmeCover plugin={plugin} />
  return mediaKind(source) === "video" ? (
    <AutoplayVideo src={source} onAspect={onRatio} className="size-full object-cover" />
  ) : (
    <PhotoCover src={source} onRatio={onRatio} />
  )
}

/**
 * The mark a pack carries when its source moved past the copy here. It is the
 * only place the answer to a check is visible without opening the pack, so it
 * says the one word and nothing else.
 */
function UpdateBadge({ plugin }: { plugin: PluginRow }) {
  const { t } = useI18n()
  if (plugin.outdated !== true) return null
  return (
    <span
      className="shrink-0 rounded-full bg-amber-600/12 px-[7px] py-[2px] text-[11px] leading-[14px] font-semibold text-amber-600 dark:bg-amber-400/15 dark:text-amber-400"
      title={plugin.modified === true ? t("plugins.update.modified") : t("plugins.update.available")}
    >
      {t("plugins.update.badge")}
    </span>
  )
}

function PluginCard({
  plugin,
  actions,
  onOpen,
}: {
  plugin: PluginRow
  actions: RowActions
  onOpen: () => void
}) {
  const { t } = useI18n()
  const shownTags = plugin.tags.slice(0, 2)
  const extraTags = plugin.tags.length - shownTags.length
  /* The media box takes the cover's own ratio, so covers are never cropped and
     the columns keep differing heights, which is what the grid reads as. Which
     picture is the cover is the row's answer, already resolved to a URL. */
  const cover = plugin.cover
  const [ratio, setRatio] = React.useState<number | undefined>(() =>
    cover === undefined ? undefined : knownAspect(cover)
  )

  const measure = React.useCallback(
    (next: number) => {
      if (cover === undefined) return
      rememberAspect(cover, next)
      setRatio(next)
    },
    [cover]
  )

  return (
    <div
      /* A pack's own card opens the pack whether or not the library holds it: a
         pack only an agent holds is still one a person wants to look at, and the
         lightbox is where taking it in is offered. The card holds its own action
         button, so it cannot be a real button; the two keys a button answers to
         are handled here instead. */
      role="button"
      tabIndex={0}
      aria-label={plugin.name}
      onClick={onOpen}
      onKeyDown={(event) => {
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
        {/* Keyed by the picture, so a card whose cover changed measures the new
            one rather than keeping the ratio the old one reported. */}
        <CoverFace key={cover} plugin={plugin} source={cover} onRatio={measure} />
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
        {/* The title block reads as the MCP cards do: the pack's own mark on a
            tile, then its name, with where it came from and its version beneath. */}
        <div className="flex min-w-0 items-center gap-3">
          <PluginTile plugin={plugin} />
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-mono text-[13.5px] leading-[1.3] font-semibold">
                {plugin.name}
              </span>
              <UpdateBadge plugin={plugin} />
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <PluginSourceLine plugin={plugin} />
              {plugin.version === "" ? null : (
                <>
                  <span className="size-[3px] shrink-0 rounded-full bg-muted-soft" />
                  <span className="shrink-0 font-mono text-[11px] leading-[14px] text-muted-soft">
                    {t("plugins.version").replace("{version}", plugin.version)}
                  </span>
                </>
              )}
            </div>
          </div>
          <span className="shrink-0 self-start text-[12px] leading-[15px] text-muted-soft">
            {plugin.updated}
          </span>
        </div>
        {plugin.description === "" ? null : (
          <p className="line-clamp-2 text-[13px] leading-[18px] text-copy">
            {plugin.description}
          </p>
        )}
        <div className="flex items-center gap-2">
          {/* The marks take the left of the row and the action keeps the right,
              whether or not any agent holds this pack. */}
          <span className="mr-auto flex min-w-0 items-center">
            <HolderStack plugin={plugin} />
          </span>
          {/* The two menus stand here whether or not the hub holds the files:
              what an agent makes of a pack, and where else to put it, are the
              row's own questions. Taking a pack in is the panel's, which is
              where a person has just read what it carries. */}
          <InstallButton plugin={plugin} actions={actions} />
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
      {/* An empty state may carry no action at all, and a caller that switches
          one off passes `null` rather than `undefined` — both have to read as
          nothing, or the row keeps an empty box it never fills. */}
      {action === undefined || action === null ? null : (
        <div className="mt-1 flex items-center gap-2">{action}</div>
      )}
    </div>
  )
}

function PluginGrid({
  plugins,
  actions,
  onOpen,
}: {
  plugins: PluginRow[]
  actions: RowActions
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
            actions={actions}
            onOpen={() => onOpen(plugin)}
          />
        ))}
      </div>
    </div>
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
  actions,
  onOpen,
}: {
  plugins: PluginRow[]
  /** What the filter box holds, marked in the fields it matched. */
  needle: string
  /** Keys of the rows ticked for a batch action. */
  checked: readonly string[]
  onCheck: (keys: string[]) => void
  actions: RowActions
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
      width: "35.7%",
      cell: (plugin) => (
        <div className="flex min-w-0 items-center gap-4">
          <PluginTile plugin={plugin} size={36} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-mono text-[14px] leading-[18px] font-semibold">
                <Highlighted text={plugin.name} needle={needle} />
              </span>
              <span className="shrink-0 font-mono text-[11px] leading-[14px] text-muted-soft">
                {t("plugins.version").replace("{version}", plugin.version)}
              </span>
              <UpdateBadge plugin={plugin} />
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
      width: "16.0%",
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
      width: "13.3%",
      cell: (plugin) => (
        <div className="flex min-w-0 items-center gap-2">
          <PluginSourceLine plugin={plugin} />
          <HolderStack plugin={plugin} />
        </div>
      ),
    },
    {
      key: "updated",
      label: t("plugins.column.updated"),
      width: "8.4%",
      cell: (plugin) => (
        <span className="text-[13px] text-muted-foreground">{plugin.updated}</span>
      ),
    },
    {
      key: "action",
      label: t("plugins.column.action"),
      width: "23.7%",
      cell: (plugin) => <InstallButton plugin={plugin} actions={actions} />,
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
          /* One target, chosen once, applied to every ticked row: a batch that
             asked per row would be the row's own menu again. */
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  disabled={checked.length === 0 || actions.busy}
                  className="h-[34px] gap-1.5 rounded-full px-4 text-[13px] font-semibold"
                />
              }
            >
              <DownloadIcon className="size-3.5" />
              {t("plugins.action.installTo")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6} className="w-[272px] p-1">
              {actions.clients.map((client) => (
                <div key={client.id}>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="flex items-center gap-1.5 px-1.5 py-1 text-[11.5px] font-semibold text-muted-soft">
                      <client.icon className="size-3.5 shrink-0" aria-hidden />
                      {client.label}
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>
                  {client.places.map((place) => (
                    <DropdownMenuItem
                      key={`${client.id}:${place.scopeWord}`}
                      closeOnClick={false}
                      disabled={actions.busy || !client.available}
                      onClick={() => {
                        for (const plugin of plugins) {
                          if (checked.includes(plugin.id)) {
                            actions.onInstall(plugin, client.id, place.scopeWord)
                          }
                        }
                        onCheck([])
                      }}
                      className="gap-2.5 px-1.5 py-2 pl-4"
                    >
                      <span className="text-[13px] leading-[18px] font-semibold">
                        {t(SCOPE_LABELS[place.scopeWord] ?? place.scopeWord)}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
  /* One agent inside the scope tab on screen, once a person picked one from its
     menu; `null` leaves the scope whole. */
  const [narrowed, setNarrowed] = React.useState<string | null>(null)
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
  /* A batch a tab's menu started, which holds the menu's item disabled until the
     run it stands for has finished. */
  const [batch, setBatch] = React.useState<"adopt" | "update" | null>(null)
  /* The library the rows come from, and the one place a write reaches it. */
  const library = usePluginLibrary()
  const catalog = library.rows

  /* A pack whose folder was deleted is fetched again as the page loads: the
     record is what says it was here, and the address it carries is what puts the
     files back. One notice names every pack that is gone, and they are fetched at
     once — each address is that pack's own, so nothing here has to wait for
     another to finish before it starts. */
  const missing = library.missing
  const repairing = React.useRef(new Set<string>())
  React.useEffect(() => {
    const gone = missing.filter((name) => !repairing.current.has(name))
    /* A pack that failed once is not tried again on every re-read: a source that
       has gone away answers the same way each time, and a reload is the retry. */
    if (gone.length === 0) return
    for (const name of gone) repairing.current.add(name)
    const id = "plugins.restore"
    toast.add({
      id,
      type: "loading",
      title: t("plugins.notice.restoring").replace("{names}", gone.join(t("plugins.notice.separator"))),
    })
    void Promise.allSettled(gone.map((name) => library.restore(name)))
      .then(async (results) => {
        const failed = results.flatMap((result, at) =>
          result.status === "rejected"
            ? [{ name: gone[at] as string, reason: reasonOf(result.reason) }]
            : []
        )
        await library.refresh()
        if (failed.length === 0) {
          toast.close(id)
          return
        }
        toast.update(id, {
          type: "error",
          title: t("plugins.notice.restoreFailed").replace(
            "{names}",
            failed.map((one) => one.name).join(t("plugins.notice.separator"))
          ),
          description: failed.map((one) => one.reason).join("\n"),
        })
      })
      .catch((error: unknown) => {
        toast.update(id, { type: "error", title: reasonOf(error) })
      })
  }, [missing, library, t])

  const offered = React.useMemo(() => {
    if (needle === "") return catalog
    const text = needle.toLowerCase()
    return catalog.filter((row) => matchesQuery(row, text))
  }, [catalog, needle])

  const filtered = React.useMemo(
    () => (tag === ALL_TAGS ? offered : offered.filter((row) => row.tags.includes(tag))),
    [offered, tag]
  )

  /* A number belongs to the tabs that hold packs; a scope tab shows which agents
     it spans instead, so its size is not printed twice. Every count is read
     before any narrowing: a tab says how big its set is, not how big the slice of
     it a person happens to be looking at is. */
  const counts = React.useMemo(
    () => ({
      all: rowsForTab(filtered, "all").length,
      library: rowsForTab(filtered, "library").length,
      unstored: rowsForTab(filtered, "unstored").length,
      updates: rowsForTab(filtered, "updates").length,
    }),
    [filtered]
  )

  /* The agents each scope tab spans, as the tab's own stack and menu draw them.
     Which of them is a place of which tab is the same reading the rows go
     through, so a client no tab can show is not offered by one either. Only the
     clients the sidebar chose are read, so a scope with none left has no tab. */
  const scopePlaces = React.useMemo(() => {
    const byScope: Record<AssetScope, PlaceOption[]> = { workspace: [], global: [] }
    for (const scope of SCOPE_TABS as AssetScope[]) {
      byScope[scope] = library.clients
        .filter((client) => client.places.some((one) => one.scope === scope))
        .map((client) => ({
          id: client.id,
          icon: client.icon,
          label: client.label,
          count: catalog.filter((row) =>
            row.held.some(
              (hold) =>
                hold.client === client.id && hold.places.some((one) => one.group === scope)
            )
          ).length,
        }))
    }
    return byScope
  }, [library.clients, catalog])

  /* A scope with no agents left has nothing to open: with nothing chosen, its
     client files are not read at all. */
  const scopeHasPlaces = React.useCallback(
    (value: PluginTab) =>
      value === "workspace" || value === "global"
        ? scopePlaces[value as AssetScope].length > 0
        : true,
    [scopePlaces]
  )

  /* A tab whose set is empty leaves the row rather than sitting there saying
     nothing, and the screen follows it off: a person who emptied the set by
     acting on it lands back on the whole catalog rather than on a blank page. */
  const screenTab: PluginTab =
    (tab === "unstored" && counts.unstored === 0) ||
    (tab === "updates" && counts.updates === 0) ||
    !scopeHasPlaces(tab)
      ? "all"
      : tab

  /* A choice from a scope tab's menu only means something while it is a place of
     the scope on screen; anywhere else the scope is whole. */
  const chosen =
    narrowed !== null &&
    SCOPE_TABS.includes(screenTab) &&
    scopePlaces[screenTab as AssetScope].some((place) => place.id === narrowed)
      ? narrowed
      : null

  const matching = React.useMemo(
    () => rowsForTab(filtered, screenTab, chosen),
    [filtered, screenTab, chosen]
  )

  /* A filter can leave the page past the end; the page shown is clamped rather
     than an empty stretch of rows. */
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize))
  const shownPage = Math.min(page, pageCount - 1)

  const plugins = React.useMemo(
    () => matching.slice(shownPage * pageSize, (shownPage + 1) * pageSize),
    [matching, shownPage, pageSize]
  )

  /* Every row's own write: a pack is delivered to one client at one scope, or
     taken back out of that same place. Each place is its own, so the row's menu
     acts on them one at a time. */
  const actions: RowActions = {
    clients: library.clients,
    busy: library.busy,
    onUpdate: (plugin) => {
      void library
        .update(plugin.id)
        .then((outcome) => {
          toast.add({
            type: "success",
            title: outcome.changed
              ? t("plugins.update.done").replace("{name}", plugin.name)
              : t("plugins.update.unchanged").replace("{name}", plugin.name),
          })
          if (outcome.overwroteEdits) {
            toast.add({ type: "warning", title: t("plugins.update.overwritten") })
          }
        })
        .catch((error: unknown) => {
          toast.add({
            type: "error",
            title: error instanceof Error ? error.message : String(error),
          })
        })
    },
    onInstall: (plugin, client, scope) => {
      void library.install(plugin.name, client, scope).catch((error: unknown) => {
        toast.add({ type: "error", title: error instanceof Error ? error.message : String(error) })
      })
    },
    onUninstall: (plugin, client, scope) => {
      void library.uninstall(plugin.name, client, scope).catch((error: unknown) => {
        toast.add({ type: "error", title: error instanceof Error ? error.message : String(error) })
      })
    },
    onSetEnabled: (plugin, client, scope, on) => {
      void library.setEnabled(plugin.name, client, scope, on).catch((error: unknown) => {
        toast.add({ type: "error", title: error instanceof Error ? error.message : String(error) })
      })
    },
    onAdopt: (plugin) => {
      void library.adopt(plugin.name).then(
        (collected) => {
          toast.add({
            type: collected.already ? "info" : "success",
            title: t(
              collected.already ? "plugins.notice.already" : "plugins.notice.added"
            ).replace("{name}", collected.record.name),
          })
        },
        (error: unknown) => {
          toast.add({
            type: "error",
            title: error instanceof Error ? error.message : String(error),
          })
        }
      )
    },
  }

  /**
   * Collect one pack and say what became of it.
   *
   * The dialog closes on a pack that is new, so the notice is what says what
   * landed; a pack that was already here, or a failure, leaves the dialog open
   * for the address to be corrected, so the notice is the only thing that reports
   * it. A failure is a notice rather than a state the dialog draws, because it is
   * about this one attempt rather than about the address that produced it.
   */
  const collect = (run: () => Promise<PluginCollected>) =>
    run().then(
      (collected) => {
        toast.add({
          type: collected.already ? "info" : "success",
          title: t(
            collected.already ? "plugins.notice.already" : "plugins.notice.added"
          ).replace("{name}", collected.record.name),
        })
        return collected
      },
      (error: unknown) => {
        toast.add({
          type: "error",
          title: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    )

  const take = (source: string) => collect(() => library.add(source))

  /* The same for a folder a page read, whose pack the host names from the same
     manifest — so it too only knows what landed by being told. */
  const addFromFolder = (name: string, files: readonly PackUploadFile[]) =>
    collect(() => library.addFolder(name, files))

  /* The pack the lightbox is open on, read from the catalog rather than the
     page: a filter can take its row away while the lightbox is up. */
  const detail = catalog.find((plugin) => plugin.id === detailId) ?? null

  /* Every row opens: the lightbox says what a pack is either way, and for one the
     hub does not hold yet it carries taking that pack in where the rest carry
     the pack's own files. */
  const openDetail = (plugin: PluginRow) => setDetailId(plugin.id)

  /* A category edited in the lightbox is that row's own from then on. */
  const setTags = (plugin: PluginRow, tags: string[]) => library.setTags(plugin.name, tags)

  /* The two batches act on the whole catalog rather than on what the filters and
     the current tab happen to leave on screen: one of them is offered by the tab
     that stands for the set, and that set is what it runs on. */
  const unstoredRows = React.useMemo(() => catalog.filter((row) => !row.stored), [catalog])
  const outdatedRows = React.useMemo(() => catalog.filter((row) => row.outdated === true), [catalog])

  /**
   * Take in every pack a client wrote, one at a time: each is a write of its own,
   * and the first refusal names the pack it was about, so a run that stops says
   * which one stopped it.
   */
  const adoptAll = async () => {
    setBatch("adopt")
    try {
      for (const plugin of unstoredRows) await library.adopt(plugin.name)
    } catch (error: unknown) {
      toast.add({ type: "error", title: reasonOf(error) })
    } finally {
      setBatch(null)
    }
  }

  /** Take every pack that fell behind to the revision its source holds. */
  const updateAll = async () => {
    setBatch("update")
    try {
      let replaced = false
      for (const plugin of outdatedRows) {
        const outcome = await library.update(plugin.id)
        replaced = replaced || outcome.overwroteEdits
      }
      /* An update replaces the files it lands on, and a batch answers for all of
         them at once: one line says that some of what was here is now gone. */
      if (replaced) toast.add({ type: "warning", title: t("plugins.update.overwritten") })
    } catch (error: unknown) {
      toast.add({ type: "error", title: reasonOf(error) })
    } finally {
      setBatch(null)
    }
  }

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

  /* Taking a tab is one thing whichever element carried it — a tab primitive, an
     action's pill, or a scope's — so the reset that goes with it lives here. */
  const pickTab = (value: PluginTab) => {
    setTab(value)
    setPage(0)
    setChecked([])
  }

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeading />
      <Tabs
        value={screenTab}
        onValueChange={(value) =>
          pickTab(SHELL_TABS.find((item) => item.value === value)?.value ?? "all")
        }
        className="flex-1 gap-8"
      >
        <div className="flex items-center justify-between gap-6">
          <TabsList className="h-11! gap-1 rounded-full bg-secondary p-1">
            {SHELL_TABS.filter(
              (item) =>
                (item.value !== "unstored" || counts.unstored > 0) &&
                (item.value !== "updates" || counts.updates > 0) &&
                scopeHasPlaces(item.value)
            ).map((item) => {
              const active = screenTab === item.value
              /* A set of what is missing opens through the one action it is for:
                 the whole pill is the trigger, and the count it carries is the
                 size of the set that action runs on. */
              if (item.value === "unstored" || item.value === "updates") {
                const own = item.value === "unstored" ? "adopt" : "update"
                return (
                  <ActionTab
                    key={item.value}
                    icon={item.icon}
                    label={t(item.labelKey)}
                    count={counts[item.value]}
                    action={t(
                      own === "adopt" ? "plugins.action.adoptAll" : "plugins.action.updateAll"
                    )}
                    actionIcon={own === "adopt" ? PackagePlusIcon : DownloadIcon}
                    /* The run is this tab's to show; the other one only holds it up. */
                    state={batch === null ? "idle" : batch === own ? "running" : "blocked"}
                    active={active}
                    onTab={() => pickTab(item.value)}
                    onAction={() => void (own === "adopt" ? adoptAll() : updateAll())}
                  />
                )
              }
              /* A scope opens through the agents it spans, so a person never lands
                 on it without having said which agent they meant. */
              if (item.value === "workspace" || item.value === "global") {
                return (
                  <PlaceScopePicker
                    key={item.value}
                    scopeIcon={item.icon}
                    scopeLabel={t(item.labelKey)}
                    places={scopePlaces[item.value]}
                    chosen={active ? chosen : null}
                    active={active}
                    allLabel={t("plugins.place.all")}
                    title={t("plugins.place.which")}
                    words={placeWords(t)}
                    onChoose={(id) => {
                      pickTab(item.value)
                      setNarrowed(id)
                    }}
                  />
                )
              }
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
              disabled={library.busy}
              className="h-9 gap-2 rounded-full border-border bg-transparent px-4 dark:border-input dark:bg-transparent"
              onClick={() => {
                void library
                  .checkUpdates()
                  .then((summary) => {
                    toast.add({
                      type: summary.modified > 0 ? "warning" : "success",
                      title: t("plugins.notice.checked")
                        .replace("{count}", String(summary.checked))
                        .replace("{outdated}", String(summary.outdated))
                        .replace("{modified}", String(summary.modified)),
                    })
                    if (summary.failed.length > 0) {
                      toast.add({
                        type: "error",
                        title: t("plugins.notice.checkFailed").replace(
                          "{count}",
                          String(summary.failed.length)
                        ),
                      })
                    }
                  })
                  .catch((error: unknown) => {
                    toast.add({
                      type: "error",
                      title: error instanceof Error ? error.message : String(error),
                    })
                  })
              }}
            >
              <RefreshCwIcon className={library.busy ? "animate-spin" : undefined} />
              {t("plugins.action.checkUpdates")}
            </Button>
            <Button className="h-9 gap-2 rounded-full px-4" onClick={() => setAddTab("address")}>
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
        <TabsContent value={screenTab} className="flex flex-col">
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
                  icon={SHELL_TABS.find((item) => item.value === screenTab)?.icon ?? PlugIcon}
                  title={t("plugins.empty.tab")}
                  hint={t("plugins.empty.tabHint")}
                  action={
                    <Button className="h-10 rounded-full px-4" onClick={() => pickTab("all")}>
                      {t("plugins.tab.all")}
                    </Button>
                  }
                />
              )
            ) : view === "grid" ? (
              <PluginGrid plugins={plugins} actions={actions} onOpen={openDetail} />
            ) : (
              <PluginTable
                plugins={plugins}
                needle={needle}
                checked={checked}
                onCheck={setChecked}
                actions={actions}
                onOpen={openDetail}
              />
            )}
          </PageBody>
        </TabsContent>
      </Tabs>
      <AddPluginDialog
        open={addTab !== null}
        tab={addTab ?? "address"}
        onTabChange={setAddTab}
        onOpenChange={(next) => {
          if (!next) setAddTab(null)
        }}
        onAdd={take}
        onAddFolder={addFromFolder}
      />
      <PluginDetailDialog
        plugin={detail}
        clients={library.clients}
        root={library.root}
        busy={library.busy}
        tagSuggestions={tagsOf(catalog)}
        onUpdate={(plugin) => actions.onUpdate(plugin)}
        onInstall={(plugin, client, scope) => actions.onInstall(plugin, client, scope)}
        onUninstall={(plugin, client, scope) => actions.onUninstall(plugin, client, scope)}
        onAdopt={(plugin) => actions.onAdopt(plugin)}
        onCheckUpdate={(plugin) => library.checkUpdate(plugin.name).then(() => undefined)}
        onDelete={(plugin) => library.remove(plugin.name)}
        onTagsChange={(tags) => {
          if (detail !== null) setTags(detail, tags)
        }}
        onAddAssets={(plugin, sources) => library.addAssets(plugin.name, sources)}
        onRemoveAsset={(plugin, ref) => library.removeAsset(plugin.name, ref)}
        onOpenChange={(next) => {
          if (!next) setDetailId(null)
        }}
      />
    </div>
  )
}
