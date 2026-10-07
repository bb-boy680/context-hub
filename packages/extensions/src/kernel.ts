/**
 * Kernel composition: one Cordis context carrying the platform host, the
 * extension registry, and the i18n service. Forms differ only by the
 * {@link PlatformHost} they pass in; the services and catalog above it stay
 * identical across web, desktop, and executable builds.
 */
import { Context } from "./cordis.ts"

import { I18nService } from "./i18n.ts"
import { ExtensionService } from "./service.ts"
import type { PlatformHost } from "./host.ts"
import type { ExtensionDefinition } from "./types.ts"

/** Composition inputs for one running kernel. */
export interface KernelOptions {
  host: PlatformHost
  /** Packages this build ships; runtime-installed extensions join the catalog later. */
  extensions: ExtensionDefinition[]
}

/** A composed kernel; call {@link HubKernel.start} once to activate enabled extensions. */
export interface HubKernel {
  /** Root context; the UI reads `ctx.extensions` and `ctx.i18n` from it. */
  readonly ctx: Context
  /** Activate every enabled extension; resolves once activation settled. */
  start(): Promise<void>
}

/** Compose the kernel and fail loud on a bad catalog; the caller starts it. */
export async function createHubKernel(options: KernelOptions): Promise<HubKernel> {
  const ctx = new Context()
  ctx.provide("host", options.host)
  const extensions = ctx.plugin(ExtensionService, { catalog: options.extensions })
  await extensions.await()
  const i18n = ctx.plugin(I18nService)
  await i18n.await()
  return { ctx, start: () => ctx.extensions.start() }
}
