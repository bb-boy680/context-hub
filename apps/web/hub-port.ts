/**
 * The two ports development binds, and the one place they are written down.
 *
 * `dev.ts` starts the hub server on {@link DEV_HUB_PORT} and Vite on
 * {@link DEV_APP_PORT}, and `vite.config.ts` forwards `/hub` from the second to
 * the first — so the two cannot disagree about where the API is.
 *
 * Both are pinned rather than left to the default range on purpose. A server
 * that silently moves to another port when its own is busy is a server nobody
 * can point at, and a port that was chosen by someone else is a port someone
 * else's process may be holding: stopping this project's processes has to be
 * unambiguous. Vite fails loudly when the port is taken instead of switching.
 */

/** The hub's own server: every bridge, in development as in every other form. */
export const DEV_HUB_PORT = 5270

/** The Vite dev server: the page's source with HMR. */
export const DEV_APP_PORT = 5271
