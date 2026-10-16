/**
 * The two pieces a prompt wears wherever it is drawn: the tile its glyph sits
 * on, and the line under its title.
 *
 * They are the tile and the meta line the MCP servers and the plugin packs
 * wear, at the same two sizes, so the three asset pages read as one screen.
 */
import { FileTextIcon, HardDriveIcon } from "lucide-react"

import { useI18n } from "@workspace/extensions/react"

import { tokenLabel } from "./library.ts"

/**
 * The tile a prompt's glyph sits on.
 *
 * A prompt has no mark of its own — it is text and nothing else — so every
 * tile carries the same glyph, at the two sizes the other asset pages use: 40
 * in a card and in a dialog header, 36 in a ledger row.
 */
export function PromptTile({ size = 40 }: { size?: 36 | 40 }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-clip bg-muted ring-1 ring-border ring-inset ${
        size === 36 ? "size-9 rounded-sm" : "size-10 rounded-md"
      }`}
    >
      <FileTextIcon
        className={`text-foreground ${size === 36 ? "size-[18px]" : "size-5"}`}
        aria-hidden
      />
    </span>
  )
}

/**
 * What the line under a prompt's title says: where the row lives, and how big
 * the prompt is.
 *
 * Every prompt in this library is the hub's own, so the source is the same word
 * on every row. It is drawn anyway, rather than left out, because it is the
 * place the other asset pages say where a record came from — the word a person
 * scans for is the token count beside it.
 */
export function PromptMeta({ body }: { body: string }) {
  const { t } = useI18n()

  return (
    /* max-w-full clamps the line to its container: without it a nowrap line
       sets the box's minimum to its full width, so nothing shrinks. */
    <span className="inline-flex max-w-full min-w-0 items-center gap-[5px] text-[12px] leading-[15px]">
      <HardDriveIcon className="size-[13px] shrink-0 text-muted-soft" aria-hidden />
      <span className="min-w-0 truncate text-muted-foreground">{t("prompts.source.local")}</span>
      <span className="size-[3px] shrink-0 rounded-full bg-muted-soft" />
      <span className="shrink-0 font-mono text-[11px] leading-[14px] text-muted-soft">
        {t("prompts.detail.tokens").replace("{tokens}", tokenLabel(body))}
      </span>
    </span>
  )
}
