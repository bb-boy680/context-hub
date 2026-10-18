/**
 * The update lifecycle the sidebar renders.
 *
 * Kept free of Electron so the transitions can be tested in plain Node: the
 * updater feeds events in, the page reads the resulting state.
 */

export type UpdateStatus = "idle" | "available" | "downloading" | "ready"

export interface UpdateState {
  status: UpdateStatus
  /** The release being offered, kept for the whole download. */
  version?: string
  /** 0–100 while downloading. */
  percent?: number
}

export const initialUpdateState: UpdateState = { status: "idle" }

export type UpdateEvent =
  | { type: "none" }
  | { type: "available"; version: string }
  | { type: "downloading" }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "failed" }

/** Fold one updater event into the state the page shows. */
export function applyUpdateEvent(
  state: UpdateState,
  event: UpdateEvent
): UpdateState {
  switch (event.type) {
    case "none":
      return initialUpdateState
    case "available":
      return { status: "available", version: event.version }
    case "downloading":
      return {
        status: "downloading",
        ...(state.version === undefined ? {} : { version: state.version }),
        percent: 0,
      }
    case "progress":
      return {
        ...state,
        status: "downloading",
        percent: Math.min(100, Math.max(0, Math.round(event.percent))),
      }
    case "downloaded":
      return { status: "ready", version: event.version }
    case "failed":
      /* A known release stays on offer, so the download can be retried. */
      return state.version === undefined
        ? initialUpdateState
        : { status: "available", version: state.version }
  }
}
