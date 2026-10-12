/**
 * The body of one screen: the region that takes the height the shell leaves
 * after the heading, the tabs and the toolbar, lays what it holds top to
 * bottom, and holds the screen's footer at the foot of that region — under the
 * content while the content is short, and below the content once it is tall.
 *
 * The footer is a slot rather than one more row, so a screen cannot end up with
 * a footer that follows the content while the window still has room below it.
 */
import * as React from "react"

/**
 * Draw the body inside a flex column that already takes the height it is given
 * — the shell's page frame, or a tab panel that fills it.
 *
 * @param children — what the body lays out, top to bottom.
 * @param footer — the screen's footer, held at the body's foot; a screen whose
 * footer is absent leaves it out.
 */
export function PageBody({
  children,
  footer,
}: {
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      {children}
      {footer === undefined || footer === null ? null : (
        <div className="mt-auto">{footer}</div>
      )}
    </div>
  )
}
