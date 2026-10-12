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
import type { McpServer } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"

/** The tag chip and place summary a card's name column carries. */
function CardMeta({ server, tag }: { server: McpServer; tag?: string }) {
  const { t } = useI18n()
  const places = server.places.map((place) => t(`mcp.place.chip.${place}`)).join(" · ")

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {tag ? (
        <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-secondary px-1.5 text-[11px] leading-[13px] font-medium text-copy">
          {tag}
        </span>
      ) : null}
      <span className="size-[3px] shrink-0 rounded-full bg-muted-soft" />
      <span className="truncate text-[11.5px] leading-[1.3] text-muted-soft">{places}</span>
    </div>
  )
}

/**
 * The check block's lines: the declaration as the fields it is made of — the
 * endpoint for a remote server, the command for a stdio one — with "none"
 * where a list-valued field carries nothing, so the block reads as the whole
 * configuration rather than its first line.
 */
function checkRows(
  server: McpServer,
  t: (key: string) => string
): { label: string; value: string; bad?: boolean }[] {
  const declaration = server.detail.declaration
  if (declaration === null) {
    return [{ label: t("mcp.column.server"), value: t("mcp.line.missing"), bad: true }]
  }
  if (declaration.transport === "stdio") {
    const variables = Object.keys(declaration.env)
    return [
      { label: t("mcp.detail.field.command"), value: declaration.command },
      {
        label: t("mcp.check.field.arguments"),
        value: declaration.args.length === 0 ? t("mcp.check.none") : declaration.args.join(" "),
      },
      {
        label: t("mcp.check.field.environment"),
        value: variables.length === 0 ? t("mcp.check.none") : variables.join(", "),
      },
    ]
  }
  const headers = Object.keys(declaration.headers)
  return [
    { label: t("mcp.add.url"), value: declaration.url },
    {
      label: t("mcp.check.field.headers"),
      value: headers.length === 0 ? t("mcp.check.none") : headers.join(", "),
    },
  ]
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
  /** The type the card prints, which is the record's first one. */
  tag?: string
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
        <ServerTile mark={server.mark} icon={server.check?.icon} size={40} />
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
          disabled={actions.testing}
          onClick={(event) => {
            event.stopPropagation()
            actions.onTest()
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted"
        >
          <PlugZapIcon
            className={cn("size-[15px] text-copy", actions.testing && "animate-spin")}
          />
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
        {/* What a probe found is the status pill's to say, and why it failed is
            the detail panel's; the card only ever shows the configuration. */}
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
  age,
  onOpen,
  rowActions,
}: {
  servers: McpServer[]
  /** How long ago the scan ran, which every card prints. */
  age: string
  onOpen: (server: McpServer) => void
  rowActions: (server: McpServer) => ServerActions
}) {
  return (
    <div className={GRID}>
      {servers.map((server) => {
        const actions = rowActions(server)
        return (
          <ServerCard
            key={server.id}
            server={server}
            tag={server.tag === "" ? undefined : server.tag}
            age={age}
            actions={actions}
            onOpen={() => onOpen(server)}
          />
        )
      })}
    </div>
  )
}