/**
 * Buffers menu rows that arrive before the page is listening.
 *
 * The preload runs before the page's scripts, so a row chosen while the page
 * is still starting must wait for `DesktopMenuActions` to subscribe. Only the
 * current subscriber receives actions; a later one does not replay actions
 * that were already delivered.
 */
export interface MenuActionQueue<T> {
  push(action: T): void
  subscribe(listener: (action: T) => void): () => void
}

export function createMenuActionQueue<T>(): MenuActionQueue<T> {
  const pending: T[] = []
  let listener: ((action: T) => void) | null = null

  return {
    push(action) {
      if (listener === null) {
        pending.push(action)
        return
      }
      listener(action)
    },
    subscribe(next) {
      listener = next
      for (const action of pending.splice(0)) next(action)
      return () => {
        if (listener === next) listener = null
      }
    },
  }
}
