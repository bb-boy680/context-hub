/**
 * The small pieces the plugin views repeat, drawn the way the MCP module draws
 * its own: the two asset pages show the same kind of thing, so a pack's mark
 * and a server's mark wear the same tile.
 */
import { PlugIcon } from "lucide-react"
import * as React from "react"

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
