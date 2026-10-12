/**
 * The card grid: three equal columns that fill the panel, each card carrying
 * the same server the ledger shows plus its description and what the install
 * check found. Three columns of the canvas's 362px are exactly one 1128px
 * content column, so a wider panel shares the slack instead of leaving a hole
 * beside the last card.
 */
import { ArrowRightLeftIcon, PlugZapIcon } from "lucide-react"

import { cn } from "cn"

import { ServerControls, type ServerActions } from "./menus.tsx"
import { ServerTile, StatusPill, TransportChip } from "./parts.tsx"
import type { McpServer, McpTag } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"

/** The tag chip and place summary a card's name column carries. */
function CardMeta({ server, tag }: { server: McpServer; tag?: McpTag }) {
  const { t } = useI18n()
  const places = server.places.map((place) => t(`mcp.place.chip.${place}`)).join(" · ")

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {tag ? (
        <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-secondary px-1.5 text-[11px] leading-[13px] font-medium text-copy">
          {tag.label}
        </span>
      ) : null}
      <span className="size-[3px] shrink-0 rounded-full bg-muted-soft" />
      <span className="truncate text-[11.5px] leading-[1.3] text-muted-soft">{places}</span>
    </div>
  )
}

/**
 * The check block's lines: what the declaration says, and how many files hold
 * it. A conflict or an unreadable entry takes the place of the count, because
 * that is the finding a person has to act on.
 */
function checkRows(server: McpServer, t: (key: string) => string) {
  const declaration = server.detail.declaration
  const rows: { label: string; value: string; bad?: boolean }[] = []
  if (declaration === null) {
    rows.push({ label: t("mcp.column.server"), value: t("mcp.line.missing"), bad: true })
  } else if (declaration.transport === "stdio") {
    rows.push({ label: t("mcp.detail.field.command"), value: declaration.command })
    rows.push({
      label: t("mcp.detail.field.arguments"),
      value: declaration.args.length === 0 ? "—" : declaration.args.join(" "),
    })
  } else {
    rows.push({ label: t("mcp.add.url"), value: declaration.url })
  }
  rows.push({
    label: t("mcp.column.place"),
    value:
      server.conflicts === undefined
        ? t("mcp.check.places").replace("{count}", String(server.installed))
        : t("mcp.check.conflict").replace("{count}", String(server.conflicts)),
    ...(server.conflicts === undefined ? {} : { bad: true }),
  })
  return rows
}

/** One server as a card. */
function ServerCard({
  server,
  tag,
  age,
  actions,
  onOpen,
}: {
  server: McpServer
  tag?: McpTag
  /** How long ago the scan ran, as the card's own line says it. */
  age: string
  actions: ServerActions
  onOpen: () => void
}) {
  const { t } = useI18n()

  return (
    <div
      /* The canvas fixes the card at 226, but its own longest description needs
         more than that and the check block below gets crushed as a result. The
         226 stays as the floor and the card grows past it when the description
         is long, so nothing below is squeezed; a grid row stretches its cards to
         the tallest one, which keeps a row even. */
      className="flex min-h-[226px] w-full cursor-pointer flex-col gap-2.5 rounded-xl border border-border bg-card px-[18px] pt-4 pb-[18px]"
      onClick={onOpen}
    >
      <div className="flex h-10 shrink-0 items-center gap-3">
        <ServerTile mark={server.mark} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13.5px] leading-[1.3] font-semibold text-foreground">
              {server.name}
            </span>
            <TransportChip transport={server.transport} />
          </div>
          <CardMeta server={server} tag={tag} />
        </div>
        {server.conflicts ? (
          <button
            type="button"
            aria-label={t("mcp.column.check")}
            onClick={(event) => event.stopPropagation()}
            className="flex h-8 shrink-0 items-center gap-[5px] rounded-full bg-secondary px-2.5 transition-colors hover:bg-foreground/12"
          >
            <ArrowRightLeftIcon className="size-[14px] text-copy" />
            <span className="text-[12px] leading-[1.3] font-semibold text-destructive">
              {server.conflicts}
            </span>
          </button>
        ) : null}
        <button
          type="button"
          aria-label={t("mcp.action.testConnection")}
          onClick={(event) => {
            event.stopPropagation()
            actions.onTest()
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted"
        >
          <PlugZapIcon className="size-[15px] text-copy" />
        </button>
      </div>

      {/* One line, ellipsis past that: every card keeps the same height and the
          check block below never moves. */}
      <p className="line-clamp-1 text-[12.5px] leading-[1.5] text-copy">{server.description}</p>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="flex h-4 shrink-0 items-center justify-between">
          <span className="text-[11.5px] leading-[1.3] font-semibold tracking-[0.5px] text-muted-soft">
            {t("mcp.detail.section.check")}
          </span>
          <span className="text-[11.5px] leading-[1.3] text-muted-soft">
            {t("mcp.card.checked").replace("{age}", age)}
          </span>
        </div>
        {checkRows(server, t).map((line) => (
          <div key={line.label} className="flex h-4 shrink-0 items-center gap-2">
            <span className="shrink-0 text-[11.5px] leading-[1.3] text-muted-soft">{line.label}</span>
            <span
              className={cn(
                "truncate font-mono text-[11px] leading-[1.3]",
                line.bad === true ? "text-destructive" : "text-copy"
              )}
            >
              {line.value}
            </span>
          </div>
        ))}
      </div>

      <div className="flex h-8 shrink-0 items-center gap-2">
        <StatusPill status={server.status} />
        <span className="h-px flex-1" />
        <ServerControls server={server} actions={actions} align="end" />
      </div>
    </div>
  )
}

/**
 * The card grid. Grid decides the column count itself: a track is 320px wide,
 * and the track's minimum is the larger of that and a fifth of the line, so five
 * is the most that ever fits and a wider window makes the cards roomier instead
 * of adding a sixth. At the canvas's 1128px content column the arithmetic lands
 * on three columns of 357, which is the canvas's own arrangement.
 *
 * `min(320px, 100%)` is what keeps a very narrow line from overflowing: below
 * 320px the track is the line itself, and the grid falls to one column.
 */
const GRID =
  "grid gap-x-[21px] gap-y-4 " +
  "grid-cols-[repeat(auto-fill,minmax(max(min(320px,100%),calc((100%-84px)/5)),1fr))]"

/** The card grid, one to five columns, chosen by the width the page has. */
export function ServerCardView({
  servers,
  tags,
  age,
  onOpen,
  rowActions,
}: {
  servers: McpServer[]
  tags: McpTag[]
  /** How long ago the scan ran, which every card prints. */
  age: string
  onOpen: (server: McpServer) => void
  rowActions: (server: McpServer) => ServerActions
}) {
  const byId = new Map(tags.map((tag) => [tag.id, tag]))

  return (
    <div className={GRID}>
      {servers.map((server) => {
        const actions = rowActions(server)
        return (
          <ServerCard
            key={server.id}
            server={server}
            tag={server.tag === "" ? undefined : byId.get(server.tag)}
            age={age}
            actions={actions}
            onOpen={() => onOpen(server)}
          />
        )
      })}
    </div>
  )
}