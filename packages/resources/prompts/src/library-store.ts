/**
 * The prompt library as one shared read, rather than one read per visit to the
 * page.
 *
 * The page used to read inside its own hook, so leaving it threw the rows away
 * and coming back read them again — which is why nothing outside the page could
 * see them. This holds the read instead: the page asks for it, a form can start
 * it before anything is drawn, and everyone who draws a prompt watches the same
 * answer.
 *
 * It is a service rather than a plain value so that a form can find it by name
 * and start it, the way it starts the services it provides itself. It carries
 * no transport of its own: the library it reads is the one the form provided,
 * looked up each time so a form that gains one is picked up.
 */
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"

import { chosenAgents, chosenProviders, createCatalog, isGlobalWorkspace, type Catalog, type CatalogState } from "@context-hub/extensions"

import type { PromptHeld, PromptPlace, PromptProvider } from "./provider.ts"

import type { PromptStore, StoredPrompt } from "./store.ts"

/** The name a form finds this under, and what says it is there. */
export const PROMPT_LIBRARY_SERVICE = "catalog.prompts"

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The prompt library's shared read; absent until this module is enabled. */
    "catalog.prompts"?: PromptLibrary
  }
}

/** What has been read: the whole library, which is what the page draws. */
export interface PromptLibraryValue {
  /** Every prompt, with its text, because a card draws the text as its cover. */
  rows: StoredPrompt[]
  /** Every category in use, for the filter row; it spans the library, not the page. */
  tags: string[]
  /** Where the library lives, as the host names it. */
  root: string
}

export function orderPromptRows(
  rows: readonly StoredPrompt[],
  answers: readonly (readonly (PromptHeld | undefined)[])[]
): StoredPrompt[] {
  const seen = new Set<string>()
  const ordered: StoredPrompt[] = []
  for (const place of answers) {
    rows.forEach((row, index) => {
      const held = place[index]
      if (held === undefined || !Object.values(held).some(Boolean) || seen.has(row.id)) return
      seen.add(row.id)
      ordered.push(row)
    })
  }
  for (const row of rows) if (!seen.has(row.id)) ordered.push(row)
  return ordered
}

/**
 * The shared read of the prompt library.
 *
 * It is a service rather than a plain value so a form's startup can find it by
 * name and start it, the way it starts the services it provides itself — and the
 * base class is what puts it there: constructing one registers it under
 * {@link PROMPT_LIBRARY_SERVICE} for as long as the module stays loaded. Nothing
 * is read on the way in; the first `load()` is what asks.
 */
export class PromptLibrary extends Service {
  private readonly catalog: Catalog<PromptLibraryValue>

  constructor(ctx: Context) {
    super(ctx, PROMPT_LIBRARY_SERVICE)
    this.catalog = createCatalog<PromptLibraryValue>({
      /* Empty until something has been read: a page that has not been answered
         yet draws its own emptiness rather than an invented library. */
      initial: { rows: [], tags: [], root: "" },
      read: async () => {
        const store = this.store()
        if (store === null) return { rows: [], tags: [], root: "" }
        const page = await store.list()
        const workspaces = this.ctx.get("hub.workspaces")
        await workspaces?.refresh()
        const workspace = workspaces?.current()
        const chosen = chosenAgents(workspaces)
        const providers = chosenProviders(this.ctx.get("prompts")?.providers() ?? [], chosen)
          .filter((provider) => provider.shared !== true)
        const places: { provider: PromptProvider; place: PromptPlace }[] = providers.flatMap((provider) =>
          provider.places.filter((place) => !isGlobalWorkspace(workspace) || place.scope === "global")
            .map((place) => ({ provider, place })))
        const host = this.ctx.get("host")
        const files = host?.files ?? null
        if (files === null) return { rows: page.items, tags: page.tags, root: page.root }
        const io = { files, workspace: () => files.workspace() }
        const answers = await Promise.all(places.map(async ({ provider, place }) =>
          Promise.all(page.items.map(async (row) => {
            try {
              return await provider.held(io, place.id, row)
            } catch (error) {
              host?.log("warn", `prompts: could not read ${place.id}: ${String(error)}`)
              return undefined
            }
          }))))
        const current = workspaces?.current()
        const sameWorkspace = workspace?.current === current?.current &&
          isGlobalWorkspace(workspace) === isGlobalWorkspace(current) &&
          JSON.stringify(chosen) === JSON.stringify(chosenAgents(workspaces))
        return { rows: sameWorkspace ? orderPromptRows(page.items, answers) : page.items, tags: page.tags, root: page.root }
      },
    })
    const again = () => { if (this.started) void this.reload() }
    this.ctx.on("extensions/changed", again)
    this.ctx.effect(() => {
      const workspaces = this.ctx.get("hub.workspaces")
      if (workspaces === undefined) return () => undefined
      let seen = this.workspaceKey()
      return workspaces.subscribe(() => {
        const next = this.workspaceKey()
        if (next === seen) return
        seen = next
        again()
      })
    })
  }

  private started = false

  private workspaceKey(): string {
    const workspaces = this.ctx.get("hub.workspaces")
    const page = workspaces?.current()
    return JSON.stringify([page?.current, isGlobalWorkspace(page), chosenAgents(workspaces)])
  }

  /** The library this form provided, or `null` when it can reach none. */
  store(): PromptStore | null {
    return this.ctx.get("hub.prompts") ?? null
  }

  state(): CatalogState<PromptLibraryValue> {
    return this.catalog.state()
  }

  subscribe(listener: () => void): () => void {
    return this.catalog.subscribe(listener)
  }

  /** Read if nothing has been read. A page that opens first does this itself. */
  load(): Promise<void> {
    this.started = true
    return this.catalog.load()
  }

  /** Read again: what a page calls once it has written something. */
  reload(): Promise<void> {
    this.started = true
    return this.catalog.reload()
  }

  /**
   * Touch the read value up in place.
   *
   * Nothing here uses it today — a prompt is written through the store and read
   * back whole — but it is part of what a catalog is, and a class that answers
   * to that name everywhere else and not here would be a trap.
   */
  update(recipe: (draft: PromptLibraryValue) => void): void {
    this.catalog.update(recipe)
  }
}
