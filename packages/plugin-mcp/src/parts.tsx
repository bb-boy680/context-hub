/**
 * The small marks the MCP list and cards repeat: a server's tile, its transport
 * chip, the place chips, the sync chip, and the status pill. Each one renders
 * exactly what the design canvas shows for that element, so the views above
 * them only decide placement.
 */
import { ArrowRightLeftIcon, ServerIcon } from "lucide-react"

import { cn } from "cn"

import { markImage } from "./marks.ts"
import type { McpMark, McpPlaceKind, McpServer, McpStatus, McpTransport } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"

/** How many place chips a row shows before it counts the rest. */
const PLACES_SHOWN = 2

/** A server's mark: a brand image, or the glyph that stands for everything else. */
export function ServerMark({ mark, className }: { mark: McpMark; className?: string }) {
  const image = markImage(mark)
  if (image !== null) {
    return <img src={image} alt="" className={cn("size-5 object-cover", className)} />
  }
  return <ServerIcon className={cn("size-[18px] text-foreground", className)} />
}

/** The tile a row or a card puts its mark on. */
export function ServerTile({ mark, size = 36 }: { mark: McpMark; size?: number }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-clip bg-muted ring-1 ring-border ring-inset",
        size === 36 ? "size-9 rounded-sm" : "size-10 rounded-md"
      )}
    >
      <ServerMark mark={mark} className={size === 36 ? undefined : "size-6"} />
    </span>
  )
}

/** The transport a server speaks, as the chip beside its name. */
export function TransportChip({ transport }: { transport: McpTransport }) {
  return (
    <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-muted px-2 font-mono text-[11px] leading-[1.3] text-copy">
      {transport}
    </span>
  )
}

/**
 * How many declarations disagree about the endpoint. Shown only when they do —
 * a server whose copies agree carries no chip.
 */
export function SyncChip({ count }: { count: number }) {
  return (
    <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-secondary px-2">
      <ArrowRightLeftIcon className="size-[11px] text-copy" />
      <span className="text-center text-[11px] leading-[1.2] font-semibold text-destructive">
        {count}
      </span>
    </span>
  )
}

/**
 * Every scope a server is declared under, collapsed to two chips plus a count.
 * A scope is the whole answer here — which client files hold it is what the
 * row's Install-to menu lists.
 */
export function PlaceChips({ places }: { places: McpPlaceKind[] }) {
  const { t } = useI18n()
  const shown = places.slice(0, PLACES_SHOWN)
  const rest = places.length - shown.length

  return (
    <div className="flex h-[22px] items-center gap-1.5">
      {shown.map((place) => (
        <span
          key={place}
          className="inline-flex h-[22px] items-center justify-center rounded-full border border-border px-2 text-[11.5px] leading-[1.3] text-foreground"
        >
          {t(`mcp.place.chip.${place}`)}
        </span>
      ))}
      {rest > 0 ? (
        <span className="inline-flex h-[22px] items-center justify-center rounded-full border border-border px-2 text-[11.5px] leading-[1.3] text-foreground">
          {t("mcp.place.more").replace("{count}", String(rest))}
        </span>
      ) : null}
    </div>
  )
}

/** The last check's verdict, as a pill: a dot and a word, coloured by state. */
export function StatusPill({ status }: { status: McpStatus }) {
  const { t } = useI18n()
  const tone = status === "ready" ? "text-chart-2" : "text-destructive"

  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-card px-2.5">
      <span
        className={cn("size-1.5 rounded-full", status === "ready" ? "bg-chart-2" : "bg-destructive")}
      />
      <span className={cn("text-[12px] leading-[1.3] font-medium", tone)}>
        {t(status === "ready" ? "mcp.status.ready" : "mcp.status.failed")}
      </span>
    </span>
  )
}

/** A server that is switched off, as the ledger's status cell says so. */
export function OffChip() {
  const { t } = useI18n()

  return (
    <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-secondary px-2">
      <span className="text-[11.5px] leading-[1.3] text-muted-foreground">
        {t("mcp.status.off")}
      </span>
    </span>
  )
}

/**
 * What the scan found, as the check column states it: copies that disagree come
 * first, then entries it could not read, then whether anything holds it at all.
 */
export function checkLine(server: McpServer, t: (key: string) => string): string {
  if (server.conflicts !== undefined) {
    return t("mcp.check.conflict").replace("{count}", String(server.conflicts))
  }
  if (server.unreadable > 0) {
    return t("mcp.check.unreadable").replace("{count}", String(server.unreadable))
  }
  if (server.installed === 0) return t("mcp.check.absent")
  return t("mcp.check.consistent")
}

/** The check column's cell. */
export function CheckNote({ text, ok }: { text: string; ok: boolean }) {
  return (
    <span
      className={cn(
        "truncate font-mono text-[12px] leading-[1.3]",
        ok ? "text-muted-foreground" : "text-destructive"
      )}
    >
      {text}
    </span>
  )
}
