/**
 * The small marks the MCP list and cards repeat: a server's tile, its transport
 * chip, the marks of the clients holding it, the sync chip, and the status
 * pill. Each one renders exactly what the design canvas shows for that element,
 * so the views above them only decide placement.
 */
import { ArrowRightLeftIcon, ServerIcon } from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import { markImage } from "./marks.ts"
import type { McpProbeIcon } from "./probe.ts"
import { displayPlaceFile, type McpAgentPlace, type McpMark, type McpServer, type McpStatus, type McpTransport } from "./types.ts"
import { AvatarStack } from "@workspace/extensions/components"
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
 * The client files that declare this server, in the catalog's own order. A
 * place is one file, so a client keeping two of them answers twice — which is
 * what a person needs to see when a server reached the project's file and the
 * machine-wide one as well.
 */
export function heldPlaces(
  server: Pick<McpServer, "detail">,
  places: readonly McpAgentPlace[]
): McpAgentPlace[] {
  const held = new Set(
    server.detail.installs
      .filter((install) => install.installed)
      .map((install) => install.place)
  )
  return places.filter((place) => held.has(place.id))
}

/**
 * Which agents have this server, as the marks their own extensions declare: one
 * tile per client file that declares it, capped the way every other stack in
 * the app is. The row answers "who has this" at a glance — the scope and the
 * file itself are the tooltip's and the install menu's to name.
 */
export function AgentStack({
  server,
  places,
}: {
  server: Pick<McpServer, "detail">
  places: readonly McpAgentPlace[]
}) {
  const held = heldPlaces(server, places)
  if (held.length === 0) return null

  return (
    <AvatarStack
      marks={held.map((place) => ({ id: place.id, icon: place.icon }))}
      seam="ring-card"
      /* One line per file: a client holding two of them would otherwise read as
         one run of words with no seam between the two. */
      label={held
        .map((place) => `${place.label} · ${displayPlaceFile(place)}`)
        .join("\n")}
    />
  )
}

/**
 * The hub's own record, as the chip a card and a row wear while it holds one.
 * It is not an agent and never joins the marks: the hub keeps the record the
 * installs are written from, which is a different kind of home.
 */
export function LibraryChip() {
  const { t } = useI18n()

  return (
    <span className="inline-flex h-5 shrink-0 items-center justify-center rounded-full border border-border px-2 text-[11.5px] leading-[1.3] text-foreground">
      {t("mcp.place.chip.library")}
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
