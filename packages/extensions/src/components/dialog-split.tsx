/**
 * The two sides of a dialog: the pane, which takes whatever width the panel
 * leaves, and the panel beside it, which keeps its own, with a hairline between
 * them. The pane sits on the raised surface and the panel on the frame's, which
 * is what tells the two apart once they share one rounded rectangle.
 *
 * What each side holds belongs to the screen that opened it — this module owns
 * the frame's size and the split only, so two modules with different contents
 * cannot drift apart in their layout. The title and the close button belong to
 * the caller's own side content, which is why no close button is drawn here.
 */
import * as React from "react"

import { DialogContent } from "@workspace/ui/components/dialog"

/** The panel's width, which the pane's side leaves room for. */
const PANEL = "w-[360px]"

/**
 * Draw the split inside the dialog that owns `open`; a `Dialog` must be the
 * caller's ancestor, since this module renders only its content frame.
 *
 * @param pane — the flexible side, on the raised surface.
 * @param panel — the fixed side, against the pane's hairline.
 * @param overlay — surfaces that slide in above both sides, positioned against
 * this frame rather than the page.
 */
export function DialogSplit({
  pane,
  panel,
  overlay,
}: {
  pane: React.ReactNode
  panel: React.ReactNode
  overlay?: React.ReactNode
}) {
  return (
    <DialogContent
      showCloseButton={false}
      className="flex h-[min(740px,calc(100vh-48px))] w-[min(1136px,calc(100vw-48px))] flex-col gap-0 overflow-hidden rounded-xl bg-dialog p-0 shadow-soft ring-1 ring-border sm:max-w-none"
    >
      <div className="relative flex h-full min-h-0">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-raised">{pane}</div>
        <div className={`flex min-h-0 shrink-0 flex-col border-l border-border ${PANEL}`}>
          {panel}
        </div>
        {overlay}
      </div>
    </DialogContent>
  )
}
