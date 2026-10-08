/**
 * `ctx.extensions` (ExtensionService): the kernel-owned catalog. It holds the
 * persisted enablement state, runs code activation as Cordis plugin loads, and
 * indexes every contribution so consumers read one merged view. Enabling is a
 * plugin load and disabling is fiber disposal, so every registration an
 * extension made unwinds through the same mechanism.
 */
import { Service } from "./cordis.ts"
import type { Context, Fiber, Plugin } from "./cordis.ts"

import type { PlatformHost } from "./host.ts"
import {
  isCompatible,
  type ContributionMap,
  type ExtensionDefinition,
  type ExtensionManifest,
  type ExtensionPointId,
  type ExtensionScope,
} from "./types.ts"

/** State document holding one boolean per extension id, under the hub home's state space. */
const STATE_DOCUMENT = "extensions"

/** Unregister one contribution. */
type Disposer = () => void

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
  manifest: ExtensionManifest
  enabled: boolean
  status: ExtensionStatus
  /** Activation failure text; present while `status` is "error". */
  error?: string
  /** Points this extension currently contributes. */
  points: ExtensionPointId[]
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
  catalog: ExtensionDefinition[]
}

interface Entry {
  readonly definition: ExtensionDefinition
  enabled: boolean
  status: ExtensionStatus
  error?: string
  /** Undoes the declarative (data) contributions of this entry. */
  readonly disposers: Disposer[]
}

export class ExtensionService extends Service {
  static inject = ["host"]

  private readonly host: PlatformHost
  private readonly entries = new Map<string, Entry>()
  private readonly fibers = new Map<string, Fiber>()
  /** Reverse lookup for `internal/status`, which reports every fiber by identity. */
  private readonly owners = new Map<Fiber, string>()
  private readonly points = new Map<ExtensionPointId, Map<string, unknown[]>>()
  private tail: Promise<void> = Promise.resolve()
  private revision = 0
  private cached: ExtensionSnapshot

  constructor(ctx: Context, config: ExtensionServiceConfig) {
    super(ctx, "extensions")
    const host = ctx.get("host")
    if (host === undefined) throw new Error("extensions: host service unavailable")
    this.host = host

    const stored = this.readState()
    for (const definition of config.catalog) {
      const { id, locked, defaultEnabled } = definition.manifest
      if (this.entries.has(id)) throw new Error(`extensions: duplicate extension id "${id}"`)
      const entry: Entry = {
        definition,
        enabled: false,
        status: "inactive",
        disposers: [],
      }
      this.entries.set(id, entry)
      if (!isCompatible(definition.manifest.apiVersion)) {
        entry.status = "incompatible"
        continue
      }
      entry.enabled = locked === true || (stored[id] ?? defaultEnabled ?? false)
      if (entry.enabled) this.registerDeclarative(entry)
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

  /** Every contribution at one point, in catalog order. */
  contributions<P extends ExtensionPointId>(point: P): ContributionMap[P][] {
    const byExtension = this.points.get(point)
    if (byExtension === undefined) return []
    return [...byExtension.values()].flat() as ContributionMap[P][]
  }

  /** Contributions one extension currently makes at one point. */
  contributionsFrom<P extends ExtensionPointId>(
    id: string,
    point: P
  ): ContributionMap[P][] {
    return (this.points.get(point)?.get(id) ?? []) as ContributionMap[P][]
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
    if (enabled && entry.definition.manifest.locked === true) {
      throw new Error(`extensions: "${id}" is required and cannot be disabled`)
    }
    if (entry.enabled === enabled) return

    if (enabled) {
      entry.enabled = true
      this.registerDeclarative(entry)
      await this.activate(entry)
    } else {
      entry.enabled = false
      await this.deactivate(entry)
    }
    this.persist()
    this.publish()
  }

  private registerDeclarative(entry: Entry): void {
    const declarative = entry.definition.declarative
    if (declarative === undefined) return
    for (const point of Object.keys(declarative) as ExtensionPointId[]) {
      for (const value of declarative[point] ?? []) {
        entry.disposers.push(this.contribute(entry, point, value))
      }
    }
  }

  private async activate(entry: Entry): Promise<void> {
    const { id, inject } = entry.definition.manifest
    const activate = entry.definition.activate
    if (activate === undefined) {
      entry.status = "active"
      return
    }

    entry.status = "activating"
    this.publish()
    const plugin: Plugin.Function = (pluginCtx: Context) => {
      const scope: ExtensionScope = {
        ctx: pluginCtx,
        host: this.host,
        contribute: (point, value) => {
          pluginCtx.effect(() => this.contribute(entry, point, value))
        },
      }
      activate(scope)
    }
    Object.defineProperty(plugin, "name", { value: id, configurable: true })
    if (inject !== undefined) plugin.inject = inject

    const fiber = this.ctx.plugin(plugin)
    this.fibers.set(id, fiber)
    this.owners.set(fiber, id)
    if ((await this.sync(entry, fiber)) !== undefined) {
      this.fibers.delete(id)
      this.owners.delete(fiber)
      await fiber.dispose()
    }
  }

  private async deactivate(entry: Entry): Promise<void> {
    for (const dispose of entry.disposers.splice(0).reverse()) dispose()
    const { id } = entry.definition.manifest
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
        `extensions: "${entry.definition.manifest.id}" failed to activate: ${message}`
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

  private contribute(
    entry: Entry,
    point: ExtensionPointId,
    value: unknown
  ): Disposer {
    const { id } = entry.definition.manifest
    let byExtension = this.points.get(point)
    if (byExtension === undefined) {
      byExtension = new Map()
      this.points.set(point, byExtension)
    }
    let values = byExtension.get(id)
    if (values === undefined) {
      values = []
      byExtension.set(id, values)
    }
    values.push(value)
    return () => {
      const index = values.indexOf(value)
      if (index >= 0) values.splice(index, 1)
    }
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
      for (const [point, byExtension] of this.points) {
        if (byExtension.has(id)) points.push(point)
      }
      entries.push({
        manifest: entry.definition.manifest,
        enabled: entry.enabled,
        status: entry.status,
        error: entry.error,
        points,
      })
    }
    return { entries, revision: this.revision }
  }

  private publish(): void {
    this.revision += 1
    this.cached = this.buildSnapshot()
    this.ctx.emit("extensions/changed", this.cached)
  }
}
