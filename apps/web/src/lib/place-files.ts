/**
 * The browser's reader and writer for the client configuration files a hub
 * consumer names. It carries the same calls the kernel's `PlaceFiles` states
 * over the dev server, which is the only process that can reach the disk.
 *
 * A page gets no answer at all when that process is not there: every call
 * throws, and the caller reports the failure instead of inventing a file.
 */
import { PLACE_FILES_ROUTE, type PlaceCall, type PlaceFiles, type PlaceRef } from "@context-hub/core/place-files"

/** Whether the host answers for these files; without one every call fails. */
export async function placeFilesAvailable(base = ""): Promise<boolean> {
  try {
    const response = await fetch(`${base}${PLACE_FILES_ROUTE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      /* The hub's own workspace: it answers only when a host holds this route,
         and it names no file, so a form that refuses every place still says so. */
      body: JSON.stringify({ action: "workspace" }),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * The reader and writer that reach the host over this origin.
 *
 * @param base — origin the route is served on; empty for the current one.
 */
export function createRemotePlaceFiles(base = ""): PlaceFiles {
  const call = async (body: PlaceCall): Promise<Record<string, unknown>> => {
    const response = await fetch(`${base}${PLACE_FILES_ROUTE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const answer = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const error = new Error(String(answer.error ?? response.statusText))
      if (typeof answer.code === "string") Object.assign(error, { code: answer.code })
      throw error
    }
    return answer
  }

  return {
    async read(ref: PlaceRef) {
      const answer = await call({ action: "read", ref })
      return typeof answer.text === "string" ? answer.text : null
    },

    async write(ref: PlaceRef, text: string) {
      await call({ action: "write", ref, text })
    },

    async remove(ref: PlaceRef) {
      await call({ action: "remove", ref })
    },

    async list(ref) {
      const answer = await call({ action: "list", ref })
      if (!Array.isArray(answer.entries) || !answer.entries.every((entry) => typeof entry === "string")) {
        throw new Error("invalid client directory listing")
      }
      return answer.entries as string[]
    },

    async display(ref) {
      const answer = await call({ action: "display", ref })
      if (typeof answer.path !== "string") throw new Error("invalid client path")
      return answer.path
    },

    async snapshot(ref) {
      const answer = await call({ action: "snapshot", ref })
      if (typeof answer.snapshot !== "object" || answer.snapshot === null) throw new Error("invalid client snapshot")
      const snapshot = answer.snapshot as { text?: unknown; root?: unknown }
      if ((snapshot.text !== null && typeof snapshot.text !== "string") || typeof snapshot.root !== "string") {
        throw new Error("invalid client snapshot")
      }
      return { text: snapshot.text, root: snapshot.root }
    },

    async commit(ref, before, text) {
      await call({ action: "commit", ref, before, text })
    },

    async workspace() {
      const answer = await call({ action: "workspace" })
      return typeof answer.workspace === "string" ? answer.workspace : null
    },
  }
}
