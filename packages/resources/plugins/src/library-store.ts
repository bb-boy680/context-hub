/**
 * The plugin library as one shared read, rather than one read per visit to the
 * page.
 *
 * The page used to read inside its own hook, so leaving it threw the rows away
 * and coming back read them again — and nothing outside the page could see them
 * at all. This holds the read instead: the page asks for it, a form can start it
 * before anything is drawn, and everyone who draws a pack watches the same
 * answer.
 *
 * It is a service rather than a plain value so a form can find it by name and
 * start it, the way it starts the services it provides itself. Nothing about the
 * library is known here: which agents this hub can deliver to is the registry
 * the form's own service publishes, and the client files are the form's, both
 * looked up each time so a form that gains one is picked up.
 *
 * Moving the read here also settles a race the hook could not. It had one `alive`
 * boolean and no generation at all, so two reads overlapping — a workspace switch
 * while an agent was being enabled, say — each wrote its own answer into the same
 * state and the slower one won. The catalog this is built on drops a superseded
 * read's answer instead.
 */
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"
import { PlugIcon } from "lucide-react"

import type { ExtensionIcon } from "@context-hub/extensions"
import { createCatalog, type Catalog, type CatalogState, type Commit } from "@context-hub/extensions"

import { PLUGIN_ROUTE } from "./contract.ts"
import { call, type PluginClient } from "./library.ts"
import { PLUGIN_SERVICE, type PluginService, type PluginTools } from "./provider.ts"
import type { PluginRecord } from "./revision.ts"
import { collectScanned, type ScannedPack } from "./rows.ts"
import { probeInstallers } from "./scan.ts"

/** The name a form finds this under, and what says it is there. */
export const PLUGIN_LIBRARY_SERVICE = "catalog.plugins"

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The plugin library's shared read; absent until this module is enabled. */
    "catalog.plugins"?: PluginLibrary
  }
}

/** What has been read: the library, the clients' own answers, and what is gone. */
export interface PluginLibraryValue {
  /** Every collected pack, in the library's own order. */
  records: PluginRecord[]
  /**
   * What the clients hold, already folded into one entry per pack.
   *
   * Folded here rather than where the rows are built, because the fold needs the
   * mark each client's own extension declares, which is the same snapshot the
   * client list is built from — one read, one answer, one place that says what a
   * client is.
   */
  scanned: readonly ScannedPack[]
  /** The clients this hub can deliver to, with what each one holds. */
  clients: readonly PluginClient[]
  /** Where the packs live, as the host names it. */
  root: string
  /** The records whose files are gone, by name: what a page can fetch again. */
  missing: readonly string[]
}

/** Nothing read yet, and the answer for a form that has no library to read. */
export const NOTHING_READ: PluginLibraryValue = {
  records: [],
  scanned: [],
  clients: [],
  root: "",
  missing: [],
}

/** The list answer, as the library's own read gives it. */
interface ListAnswer {
  root: string
  plugins: PluginRecord[]
  /** The records whose files are gone, by name. */
  missing: string[]
}

/**
 * The shared read of the plugin library.
 *
 * A `Service`, so that constructing it in `apply` is what publishes it: the
 * form's startup reads it by name from the kernel, and disabling this module
 * takes the read away with everything else the module registered. It does not
 * read on construction — a module that is enabled must not start probing a
 * machine before anything asks it to.
 */
export class PluginLibrary extends Service {
  /**
   * The context this was constructed in.
   *
   * Not `this.ctx`: a `Service`'s context is read through the tracker, which
   * rebinds it to whoever is calling. Everything this read touches — the
   * installers, the workspace list, the client files — belongs to the form that
   * built it, so it has to be read from the context it was built in.
   */
  private readonly owner: Context
  private readonly catalog: Catalog<PluginLibraryValue>

  constructor(ctx: Context) {
    super(ctx, PLUGIN_LIBRARY_SERVICE)
    this.owner = ctx
    this.catalog = createCatalog<PluginLibraryValue>({
      /* Empty until something has been read: a page that has not been answered
         yet draws its own emptiness rather than an invented library. */
      initial: NOTHING_READ,
      read: (commit) => this.read(commit),
    })
    this.watch()
  }

  /** The library this form provided, or `null` when it can reach none. */
  service(): PluginService | null {
    return this.owner.get(PLUGIN_SERVICE) ?? null
  }

  /**
   * The toolkit an installer is handed here.
   *
   * The published ones reach programs; the client files are this form's own, so
   * they are added where the form is known. An installer reads a client's
   * settings to find out which of its files switches a pack on, which the client
   * itself answers only once for the pack.
   *
   * @returns the tools, or `null` when there is no registry to hand them to.
   */
  tools(): PluginTools | null {
    const service = this.service()
    return service === null ? null : { ...service.tools, files: this.owner.host.files }
  }

  state(): CatalogState<PluginLibraryValue> {
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
   * reason to read. A read then would ask the clients of half the agents, and be
   * thrown away and done again the moment the last one finished.
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
   * Nothing here uses it today — a pack is written through the route and read
   * back whole — but it is what a catalog is, and a class that answers to that
   * name everywhere else and not here would be a trap.
   */
  update(recipe: (draft: PluginLibraryValue) => void): void {
    this.catalog.update(recipe)
  }

  /**
   * Read the library, and ask every client what it holds.
   *
   * The library's own answer is published as it lands, before a single client
   * has been asked: reading a client means running its own command line, and the
   * pack list is worth drawing while that happens.
   *
   * @param commit — publishes the part of the answer that has arrived.
   */
  private async read(commit: Commit<PluginLibraryValue>): Promise<PluginLibraryValue> {
    const service = this.service()
    const tools = this.tools()

    /* Which folder is in use decides which of a client's own files every answer
       is read from, so it is settled before anything is asked. The form starts
       the same refresh at startup without waiting for it, and it is single-flight,
       so this joins that one question instead of asking a second. */
    await this.owner.get("hub.workspaces")?.refresh()

    const answer = await call<ListAnswer>(`${PLUGIN_ROUTE}?action=list`)
    commit((draft) => {
      draft.records = answer.plugins
      draft.root = answer.root
      draft.missing = answer.missing
    })

    if (service === null || tools === null) {
      /* No registry to ask: this form's library is the hub's own copy of the
         packs, and no client is offered. */
      return {
        records: answer.plugins,
        scanned: [],
        clients: [],
        root: answer.root,
        missing: answer.missing,
      }
    }

    /* Every client is asked, a few at a time, and each answer stands on its own:
       see ./scan.ts for why both of those matter. An agent whose program is
       missing, or which cannot answer at all, is still listed — a person then
       sees that the hub looked for it rather than wondering why an agent they
       use is absent, and one that failed says so in its own words. */
    const probes = await probeInstallers(service.installers(), tools)

    return {
      records: answer.plugins,
      root: answer.root,
      missing: answer.missing,
      clients: probes.map((one) => ({
        id: one.installer.id,
        label: one.installer.label,
        icon: this.iconFor(one.installer.id),
        places: one.installer.places,
        switches: one.switches,
        available: one.available,
        ...(one.error === undefined ? {} : { error: one.error }),
      })),
      /* Only a client that answered contributes packs to the rows: one that
         failed knows of none, and drawing its empty answer as "holds nothing" is
         the one thing the error is carried to prevent. */
      scanned: collectScanned(
        probes
          .filter((one) => one.error === undefined)
          .map((one) => ({
            client: one.installer.id,
            label: one.installer.label,
            icon: this.iconFor(one.installer.id),
            places: one.installer.places,
            switches: one.switches,
            packs: one.packs,
          }))
      ),
    }
  }

  /**
   * Read again whenever the answer could have changed.
   *
   * Two things decide which clients exist and what each of them holds: which
   * agents are enabled, and which folder is in use. Both already had to be
   * watched by every page that drew this library; watching them here means
   * watching them once, and means a change made while no page is open is already
   * reflected when one opens.
   */
  private watch(): void {
    /* An agent extension activating registers its installer, and that registry is
       what the client list is read from. */
    this.owner.on("extensions/changed", () => {
      if (this.started) void this.reload()
    })

    this.owner.effect(() => {
      const workspaces = this.owner.get("hub.workspaces")
      if (workspaces === undefined) return () => undefined
      /* The folder in use is the only thing about the workspace list this read
         goes through — it decides which of a client's own files each answer is
         read from — so it, and not the list, is what is watched. A rename, or
         choosing one more agent to deliver to, is not this library's business. */
      let seen = workspaces.current()?.current ?? null
      return workspaces.subscribe(() => {
        const now = workspaces.current()?.current ?? null
        if (now === seen) return
        seen = now
        if (this.started) void this.reload()
      })
    })
  }

  /**
   * The mark a client's own extension declares, which is what its row draws.
   *
   * An installer carries no mark of its own: it shows the icon its own extension
   * declares, which is the same one the catalog row draws.
   */
  private iconFor(id: string): ExtensionIcon {
    const entries = this.owner.get("extensions")?.snapshot().entries ?? []
    return entries.find((entry) => entry.manifest.id === id)?.manifest.icon ?? PlugIcon
  }
}
