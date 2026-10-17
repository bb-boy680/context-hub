/**
 * The skill library as one shared read, rather than one read per visit to the
 * page.
 *
 * The page used to read inside its own hook, so leaving it threw the rows away
 * and coming back read them again — and each return read the catalog *and* every
 * place, because which skills are in reach is a question about all of them. This
 * holds that read: the page asks for it, a form can start it before anything is
 * drawn, and everyone who draws a skill watches the same answer.
 *
 * The read is the unfiltered library. A query is deliberately not part of it:
 * what the page matches is not what the library is, and folding a keystroke into
 * this read would re-read every place on every keystroke for every watcher.
 */
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"

import type { AssetScope } from "@context-hub/core/place-files"
import { chosenAgents, createCatalog, type Catalog, type CatalogState } from "@context-hub/extensions"

import { readablePlaces } from "./provider.ts"
import type { PlaceSkillsView, SkillPage, SkillStore } from "./store.ts"

/** The name a form finds this under, and what says it is there. */
export const SKILL_LIBRARY_SERVICE = "catalog.skills"

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The skill library's shared read; absent until this module is enabled. */
    "catalog.skills"?: SkillLibrary
  }
}

/** What has been read: the catalog, and what each place holds. */
export interface SkillLibraryValue {
  /** The catalog page, unfiltered; `null` until one has been read. */
  page: SkillPage | null
  /** What each place holds, by its id; a place that could not be read is absent, not empty. */
  held: Record<string, PlaceSkillsView | null>
  /** Every category in use, for the filter row; it spans the library, not the page. */
  tags: string[]
}

/** Nothing read yet, and the answer for a form that has no library to read. */
export const NOTHING_READ: SkillLibraryValue = { page: null, held: {}, tags: [] }

/**
 * The shared read of the skill library.
 *
 * It is a service rather than a plain value so a form's startup can find it by
 * name and start it, the way it starts the services it provides itself — and the
 * base class is what puts it there: constructing one registers it under
 * {@link SKILL_LIBRARY_SERVICE} for as long as the module stays loaded. Nothing
 * is read on the way in; the first `load()` is what asks.
 */
export class SkillLibrary extends Service {
  private readonly catalog: Catalog<SkillLibraryValue>

  constructor(ctx: Context) {
    super(ctx, SKILL_LIBRARY_SERVICE)
    this.catalog = createCatalog<SkillLibraryValue>({
      initial: NOTHING_READ,
      read: () => this.read(),
    })
    this.watch()
  }

  /** The library this form provided, or `null` when it can reach none. */
  store(): SkillStore | null {
    return this.ctx.get("hub.skills") ?? null
  }

  state(): CatalogState<SkillLibraryValue> {
    return this.catalog.state()
  }

  subscribe(listener: () => void): () => void {
    return this.catalog.subscribe(listener)
  }

  /**
   * Whether anyone has asked this to be read.
   *
   * Before that there is nothing to read *again*, and the noise of the kernel
   * still starting up — every extension activating emits a change — is not a
   * reason to read: a read then would be of half the agents, and would be
   * thrown away and read again the moment the last one finished.
   */
  private started = false

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
   * Nothing here uses it today — a skill is written through the store and read
   * back — but it is what a catalog is, and a class that answers to that name
   * everywhere else and not here would be a trap.
   */
  update(recipe: (draft: SkillLibraryValue) => void): void {
    this.catalog.update(recipe)
  }

  /**
   * Which places to read, as ids with the roots they resolve under.
   *
   * A place an agent keeps is read only while the sidebar chose that agent — in
   * either scope, because both are that agent's files. The module's own place is
   * shared, so it is read whatever is chosen. This is the module's own rule,
   * reached through the registry it publishes rather than through a contribution
   * point, so an agent built here and one installed as a folder are read the same
   * way.
   */
  targets(): [string, AssetScope, string][] {
    const providers = this.ctx.get("skills")?.providers() ?? []
    const chosen = chosenAgents(this.ctx.get("hub.workspaces"))
    return readablePlaces(providers, chosen).map((place) => [place.id, place.scope, place.dir])
  }

  private async read(): Promise<SkillLibraryValue> {
    const store = this.store()
    if (store === null) return NOTHING_READ

    /* Which folder is in use decides what a workspace place holds, so it has to
       be known before the places can even be named. Asked for rather than waited
       on at startup: it is single-flight, so every library that needs it shares
       one request. */
    await this.ctx.get("hub.workspaces")?.refresh()

    const targets = this.targets()
    const [page, ...views] = await Promise.all([
      store.list({ sort: "updated" }),
      ...targets.map(([, scope, dir]) => store.placeSkills({ scope, dir })),
    ])
    /* A place that could not be read must not fail the whole read: the rows the
       catalog itself answered are worth showing. */
    const tags = await store.tags().catch(() => NOTHING_READ.tags)

    return {
      page,
      held: Object.fromEntries(targets.map(([id], at) => [id, views[at] ?? null])),
      tags,
    }
  }

  /**
   * Read again whenever the answer could have changed.
   *
   * Two things decide which places exist and what they hold: which agents are
   * enabled, and which folder is in use. Both already had to be watched by every
   * page that drew this library; watching them here means watching them once.
   */
  private watch(): void {
    const again = () => {
      if (this.started) void this.reload()
    }
    this.ctx.on("extensions/changed", again)

    this.ctx.effect(() => {
      const stops: (() => void)[] = []
      const workspaces = this.ctx.get("hub.workspaces")
      if (workspaces !== undefined) stops.push(workspaces.subscribe(again))
      const store = this.store()
      /* A form whose store reports its own changes gets read again; the browser's
         reports none, and is read after each write instead. */
      if (store !== null) stops.push(store.subscribe(again))
      return () => {
        for (const stop of stops) stop()
      }
    })
  }
}
