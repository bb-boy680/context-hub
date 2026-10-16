/**
 * `ctx.extensions` (ExtensionService): the kernel-owned catalog. It holds the
 * persisted enablement state, runs code activation as Cordis plugin loads, and
 * reports what each plugin contributes. Enabling is a plugin load and disabling
 * is fiber disposal, so every registration an extension made unwinds through
 * the same mechanism — including the ones it made through a contribution point,
 * which is a service and takes its lifetime from the same place.
 */
import { POINT_SERVICES, type ContributionPoint } from "./contributions.ts"
import { Service } from "./cordis.ts"
import type { Context, Fiber, Plugin } from "./cordis.ts"

import type { PlatformHost } from "./host.ts"
import {
  isCompatible,
  type ContributionMap,
  type ExtensionManifest,
  type ExtensionModule,
  type ExtensionPointId,
} from "./types.ts"

/** State document holding one boolean per extension id, under the hub home's state space. */
const STATE_DOCUMENT = "extensions"

/** Lifecycle of one entry's code. */
export type ExtensionStatus =
  | "inactive"
  | "activating"
  /** Enabled, but holding until every service in `manifest.inject` is provided. */
  | "waiting"
  | "active"
  | "error"
  | "incompatible"

/** One catalog row as the UI reads it. */
export interface ExtensionView {
  /** The module's manifest, with its id filled in from the module's name. */
  manifest: ExtensionManifest & { id: string }
  enabled: boolean
  status: ExtensionStatus
  /** Activation failure text; present while `status` is "error". */
  error?: string
  /** Points this extension currently contributes to. */
  points: ExtensionPointId[]
  /** Service names this extension declares it publishes. */
  provides: string[]
}

/** Immutable catalog state published on every change. */
export interface ExtensionSnapshot {
  entries: ExtensionView[]
  revision: number
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    extensions: ExtensionService
  }
  interface Events {
    /** Enablement, activation status, or contributions changed. */
    "extensions/changed"(snapshot: ExtensionSnapshot): void
  }
}

/** Kernel config: the packages this product ships. */
export interface ExtensionServiceConfig {
  catalog: ExtensionModule[]
}

interface Entry {
  readonly module: ExtensionModule
  /** The module's manifest with its id filled in from the module's name. */
  readonly manifest: ExtensionManifest & { id: string }
  enabled: boolean
  status: ExtensionStatus
  error?: string
}

/** The id a module's manifest is completed with. */
function catalogManifest(module: ExtensionModule): ExtensionManifest & { id: string } {
  return { id: module.name, ...module.manifest }
}

export class ExtensionService extends Service {
  static inject = ["host"]

  private readonly host: PlatformHost
  /**
   * The context this service was composed in.
   *
   * Not `this.ctx`: a `Service`'s `ctx` is read through the tracker, which
   * rebinds it to whichever context is calling. Every extension is mounted
   * here, so a plugin mounted through that rebound context is not a child of
   * this one — injected services stop resolving as properties on it, and a
   * plugin would have to reach for `ctx.get` instead of `ctx.skills`.
   */
  private readonly owner: Context
  private readonly entries = new Map<string, Entry>()
  private readonly fibers = new Map<string, Fiber>()
  /** Reverse lookup for `internal/status`, which reports every fiber by identity. */
  private readonly owners = new Map<Fiber, string>()
  private tail: Promise<void> = Promise.resolve()
  private revision = 0
  private cached: ExtensionSnapshot

  constructor(ctx: Context, config: ExtensionServiceConfig) {
    super(ctx, "extensions")
    this.owner = ctx
    const host = ctx.get("host")
    if (host === undefined) throw new Error("extensions: host service unavailable")
    this.host = host

    const stored = this.readState()
    for (const module of config.catalog) {
      const manifest = catalogManifest(module)
      const { id, locked, defaultEnabled } = manifest
      if (this.entries.has(id)) throw new Error(`extensions: duplicate extension id "${id}"`)
      const entry: Entry = { module, manifest, enabled: false, status: "inactive" }
      this.entries.set(id, entry)
      if (!isCompatible(manifest.apiVersion)) {
        entry.status = "incompatible"
        continue
      }
      entry.enabled = locked === true || (stored[id] ?? defaultEnabled ?? false)
    }
    // A required service appearing or disappearing re-loads its dependents;
    // this listener keeps each entry's status in step with its fiber.
    ctx.on("internal/status", (fiber) => {
      void this.observe(fiber)
    })
    this.cached = this.buildSnapshot()
  }

  /** Activate every enabled extension; call once after the kernel is composed. */
  async start(): Promise<void> {
    for (const entry of this.entries.values()) {
      if (entry.enabled && entry.status === "inactive") {
        await this.run(() => this.activate(entry))
      }
    }
    this.publish()
  }

  /** Current catalog state; stable between changes. */
  snapshot(): ExtensionSnapshot {
    return this.cached
  }

  /** Whether the extension exists and is switched on. */
  enabled(id: string): boolean {
    return this.entries.get(id)?.enabled ?? false
  }

  /** Enable, then activate; resolves once the extension's code finished loading. */
  enable(id: string): Promise<void> {
    return this.run(() => this.setEnabled(id, true))
  }

  /** Disable, then unwind every registration the extension made. */
  disable(id: string): Promise<void> {
    return this.run(() => this.setEnabled(id, false))
  }

  /** Route one UI control to {@link enable} or {@link disable}. */
  toggle(id: string, on: boolean): Promise<void> {
    return on ? this.enable(id) : this.disable(id)
  }

  /**
   * Every contribution at one point, in catalog order: the extensions as the
   * build composed them, and each one's contributions as it made them.
   *
   * Catalog order, not the order the extensions happened to activate: one
   * switched on later activates later, and a list that moved its rows on every
   * toggle would not read as the same list.
   */
  contributions<P extends ExtensionPointId>(point: P): ContributionMap[P][] {
    const held = this.placements(point)
    if (held.length === 0) return []
    const rank = new Map([...this.entries.keys()].map((id, at) => [id, at]))
    return [...held]
      .sort((left, right) => (rank.get(left.owner) ?? Infinity) - (rank.get(right.owner) ?? Infinity))
      .map((placement) => placement.value as ContributionMap[P])
  }

  /** Contributions one extension currently makes at one point. */
  contributionsFrom<P extends ExtensionPointId>(id: string, point: P): ContributionMap[P][] {
    return this.placements(point)
      .filter((placement) => placement.owner === id)
      .map((placement) => placement.value as ContributionMap[P])
  }

  /** Everything one point holds right now, with the plugin that put it there. */
  private placements(point: ExtensionPointId): readonly { owner: string; value: unknown }[] {
    const service = this.owner.get(POINT_SERVICES[point]) as
      | ContributionPoint<unknown>
      | undefined
    return service?.placements() ?? []
  }

  /** Serialize state changes so rapid toggles cannot interleave. */
  private run(task: () => Promise<void>): Promise<void> {
    const next = this.tail.then(task, task)
    this.tail = next.catch(() => undefined)
    return next
  }

  private async setEnabled(id: string, enabled: boolean): Promise<void> {
    const entry = this.entries.get(id)
    if (entry === undefined) throw new Error(`extensions: unknown extension "${id}"`)
    if (entry.status === "incompatible") {
      throw new Error(`extensions: "${id}" targets an incompatible extension API`)
    }
    if (enabled && entry.manifest.locked === true) {
      throw new Error(`extensions: "${id}" is required and cannot be disabled`)
    }
    if (entry.enabled === enabled) return

    entry.enabled = enabled
    if (enabled) await this.activate(entry)
    else await this.deactivate(entry)
    this.persist()
    this.publish()
  }

  private async activate(entry: Entry): Promise<void> {
    const { manifest, module } = entry
    const { id } = manifest
    const declarative = module.declarative

    /* A package that ships only data still mounts a fiber. Its contributions
       have to belong to it — a point takes its lifetime from the context that
       registered — and a fiber is what there is to belong to. */
    if (module.apply === undefined && declarative === undefined) {
      entry.status = "active"
      return
    }

    entry.status = "activating"
    this.publish()
    const plugin: Plugin.Function = (pluginCtx: Context) => {
      if (declarative !== undefined) {
        for (const point of Object.keys(declarative) as ExtensionPointId[]) {
          const service = pluginCtx.get(POINT_SERVICES[point]) as
            | ContributionPoint<unknown>
            | undefined
          for (const value of declarative[point] ?? []) service?.register(value)
        }
      }
      module.apply?.(pluginCtx)
    }
    Object.defineProperty(plugin, "name", { value: id, configurable: true })
    if (module.inject !== undefined) plugin.inject = module.inject

    const fiber = this.owner.plugin(plugin)
    this.fibers.set(id, fiber)
    this.owners.set(fiber, id)
    if ((await this.sync(entry, fiber)) !== undefined) {
      this.fibers.delete(id)
      this.owners.delete(fiber)
      await fiber.dispose()
    }
  }

  private async deactivate(entry: Entry): Promise<void> {
    const { id } = entry.manifest
    const fiber = this.fibers.get(id)
    this.fibers.delete(id)
    if (fiber !== undefined) {
      this.owners.delete(fiber)
      await fiber.dispose()
    }
    entry.status = "inactive"
    entry.error = undefined
  }

  /**
   * Read one fiber's dependency state into its entry. Returns the failure
   * message when the plugin threw, `undefined` once the fiber settled.
   */
  private async sync(entry: Entry, fiber: Fiber): Promise<string | undefined> {
    try {
      // Settles the in-flight transition; the fiber stays pending while any
      // service in `manifest.inject` is missing, and this resolves at once.
      await fiber.await()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      entry.status = "error"
      entry.error = message
      this.host.log(
        "error",
        `extensions: "${entry.manifest.id}" failed to activate: ${message}`
      )
      return message
    }
    if (fiber.store !== undefined) {
      entry.status = "active"
      entry.error = undefined
      return undefined
    }
    entry.status = "waiting"
    return undefined
  }

  /** Follow one of our fibers after a dependency appeared or disappeared. */
  private async observe(fiber: Fiber): Promise<void> {
    const id = this.owners.get(fiber)
    if (id === undefined) return
    const entry = this.entries.get(id)
    if (entry === undefined || !entry.enabled) return
    await this.sync(entry, fiber)
    this.publish()
  }

  private persist(): void {
    const state: Record<string, boolean> = {}
    for (const [id, entry] of this.entries) state[id] = entry.enabled
    this.host.storage.write(STATE_DOCUMENT, state)
  }

  private readState(): Record<string, boolean> {
    const parsed = this.host.storage.read(STATE_DOCUMENT)
    if (parsed === null) return {}
    if (typeof parsed !== "object") {
      this.host.log("warn", "extensions: ignoring stored state that is not an object")
      return {}
    }
    const state: Record<string, boolean> = {}
    for (const [id, enabled] of Object.entries(parsed)) {
      if (typeof enabled === "boolean") state[id] = enabled
    }
    return state
  }

  private buildSnapshot(): ExtensionSnapshot {
    const entries: ExtensionView[] = []
    for (const [id, entry] of this.entries) {
      const points: ExtensionPointId[] = []
      for (const point of Object.keys(POINT_SERVICES) as ExtensionPointId[]) {
        if (this.placements(point).some((placement) => placement.owner === id)) points.push(point)
      }
      entries.push({
        manifest: entry.manifest,
        enabled: entry.enabled,
        status: entry.status,
        error: entry.error,
        points,
        /* Declared, not observed: the catalog says what a package says it
           provides, because once a registry publishes itself the kernel is not
           the one registering it and so is not the one that knows. */
        provides: entry.manifest.provides ?? [],
      })
    }
    return { entries, revision: this.revision }
  }

  private publish(): void {
    this.revision += 1
    this.cached = this.buildSnapshot()
    this.owner.emit("extensions/changed", this.cached)
  }
}
