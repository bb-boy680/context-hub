/**
 * The small marks the MCP list and cards repeat: a server's tile, its transport
 * chip, the place chips, the sync chip, and the status pill. Each one renders
 * exactly what the design canvas shows for that element, so the views above
 * them only decide placement.
 */
import { ArrowRightLeftIcon, ServerIcon } from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import { markImage } from "./marks.ts"
import type { McpProbeIcon } from "./probe.ts"
import type { McpMark, McpServer, McpStatus, McpTransport } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"

/** A server's mark: a brand image, or the glyph that stands for everything else. */
export function ServerMark({ mark, className }: { mark: McpMark; className?: string }) {
  const image = markImage(mark)
  if (image !== null) {
    return <img src={image} alt="" className={cn("size-5 object-cover", className)} />
  }
  return <ServerIcon className={cn("size-[18px] text-foreground", className)} />
}

/**
 * The tile a row or a card puts its mark on. A server that showed an icon of
 * its own during a probe wears that instead of the generic mark — drawn
 * through an `img`, never inlined, because a server's SVG is not this build's
 * markup to trust.
 */
export function ServerTile({
  mark,
  icon,
  size = 36,
}: {
  mark: McpMark
  icon?: McpProbeIcon
  size?: number
}) {
  const [broken, setBroken] = React.useState(false)
  const shown = icon === undefined || broken ? null : icon

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-clip bg-muted ring-1 ring-border ring-inset",
        size === 36 ? "size-9 rounded-sm" : "size-10 rounded-md"
      )}
    >
      {shown === null ? (
        <ServerMark mark={mark} className={size === 36 ? undefined : "size-6"} />
      ) : (
        /* A URL an icon could not be fetched from falls back to the mark: the
           tile says the same thing it did before the probe. */
        <img
          src={shown.src}
          alt=""
          onError={() => setBroken(true)}
          className={cn("object-contain", size === 36 ? "size-[18px]" : "size-6")}
        />
      )}
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
 * Where a server lives, in the words the views print. The hub's own library is
 * one home and every client file that declares the server is another; one home
 * is named, and several are counted, so a row reads as a summary and the detail
 * panel stays the place the files themselves are listed. A server held nowhere
 * is a row that cannot exist — a row comes from a record or from a file.
 */
export function serverPlaces(
  server: Pick<McpServer, "stored" | "places" | "detail">,
  t: (key: string) => string
): string[] {
  const declared = server.detail.installs.filter((install) => install.installed).length
  const homes = (server.stored ? 1 : 0) + declared
  if (homes > 1) {
    return [t("mcp.detail.place.count").replace("{count}", String(homes))]
  }
  /* One home: the library, or the one scope that declares it. */
  if (server.stored) return [t("mcp.place.chip.library")]
  return server.places.map((place) => t(`mcp.place.chip.${place}`))
}

/** Where a server lives, as the one chip the ledger's place column draws. */
export function PlaceChips({ server }: { server: McpServer }) {
  const { t } = useI18n()
  const [word] = serverPlaces(server, t)

  return (
    <span className="inline-flex h-[22px] items-center justify-center rounded-full border border-border px-2 text-[11.5px] leading-[1.3] text-foreground">
      {word}
    </span>
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
 * A server some client file declares and the hub holds no record for. It is
 * itself a row — hiding it would be the hub pretending not to see a server that
 * is installed somewhere — so the row says which kind of row it is, and the
 * unstored tab is where the record is written.
 */
export function UnstoredChip() {
  const { t } = useI18n()

  return (
    <span className="inline-flex h-[18px] shrink-0 items-center justify-center rounded-full border border-dashed border-border px-1.5">
      <span className="text-[11px] leading-[1.3] text-muted-foreground">
        {t("mcp.tab.unstored")}
      </span>
    </span>
  )
}

/** A sentence the check column prints, and whether it reports something wrong. */
export interface CheckLine {
  text: string
  bad: boolean
}

/**
 * What the check column states: copies that disagree come first, then entries
 * this build could not read, then whether any file holds the server at all, and
 * otherwise when it was last checked — which is what the card's own check block
 * answers, so the two views name the same thing by the same word.
 *
 * @param server — the row the cell belongs to.
 * @param t — the active locale's lookup.
 * @param age — how long ago that server was checked.
 */
export function checkLine(
  server: McpServer,
  t: (key: string) => string,
  age: string
): CheckLine {
  if (server.conflicts !== undefined) {
    return {
      text: t("mcp.check.conflict").replace("{count}", String(server.conflicts)),
      bad: true,
    }
  }
  if (server.unreadable > 0) {
    return {
      text: t("mcp.check.unreadable").replace("{count}", String(server.unreadable)),
      bad: true,
    }
  }
  if (server.installed === 0) return { text: t("mcp.check.absent"), bad: false }
  return { text: t("mcp.check.checked").replace("{age}", age), bad: false }
}

/**
 * The check column's cell. Its colour follows the sentence it prints — a
 * server that is failing to connect paints its own status pill red, and saying
 * "all copies agree" in that same colour would read as its opposite.
 */
export function CheckNote({ line }: { line: CheckLine }) {
  return (
    <span
      className={cn(
        "truncate font-mono text-[12px] leading-[1.3]",
        line.bad ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {line.text}
    </span>
  )
}
