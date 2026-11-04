/**
 * The small pieces the plugin views repeat, drawn the way the MCP module draws
 * its own: the two asset pages show the same kind of thing, so a pack's mark
 * and a server's mark wear the same tile — and the agents holding a pack wear
 * the same stack wherever the pack is drawn.
 */
import { PlugIcon } from "lucide-react"
import * as React from "react"

import { orderByAgent } from "@context-hub/extensions"
import { AvatarStack } from "@context-hub/extensions/components"
import { useAgentOrder } from "@context-hub/extensions/react"

import type { PluginRow } from "./types.ts"

/**
 * The tile a view puts the pack's own mark on.
 *
 * It is the tile the MCP servers wear, at the same two sizes — 40 in a card and
 * in a dialog header, 36 in a ledger row — so the two pages read as one screen.
 * The mark sits at a fixed inset inside it rather than filling it, which is what
 * keeps a wide wordmark and a square glyph from reading at different weights.
 *
 * A pack with no mark of its own wears the glyph that stands for every pack, so
 * a tile is always there and rows line up down the column.
 */
export function PluginTile({
  plugin,
  size = 40,
}: {
  plugin: PluginRow
  size?: 36 | 40
}) {
  /* A picture that will not load falls back to the glyph: a broken image says
     less about the pack than the mark standing for it does. */
  const [broken, setBroken] = React.useState(false)
  const shown = plugin.icon === undefined || broken ? undefined : plugin.icon

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-clip bg-muted ring-1 ring-border ring-inset ${
        size === 36 ? "size-9 rounded-sm" : "size-10 rounded-md"
      }`}
    >
      {shown === undefined ? (
        <PlugIcon
          className={`text-foreground ${size === 36 ? "size-[18px]" : "size-5"}`}
          aria-hidden
        />
      ) : (
        <img
          src={shown}
          alt=""
          onError={() => setBroken(true)}
          className={`object-contain ${size === 36 ? "size-5" : "size-6"}`}
        />
      )}
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
export function HolderStack({ plugin }: { plugin: PluginRow }) {
  const order = useAgentOrder()?.order
  const held = orderByAgent(plugin.held, order, (hold) => hold.client)
  if (held.length === 0) return null

  return (
    <AvatarStack
      marks={held.map((hold) => ({ id: hold.client, icon: hold.icon }))}
      seam="ring-card"
      label={held.map((hold) => hold.label).join(" · ")}
    />
  )
}
