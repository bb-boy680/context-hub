/**
 * The market as the Extensions page reads it: entries the index lists that are
 * not installed yet, shaped like kernel catalog rows so the page can render
 * them beside the installed ones, plus the read that keeps them current.
 *
 * An installed plugin is never duplicated from the index: the kernel's own row
 * wins, because it carries the real enablement state and the contributions the
 * plugin actually registered.
 */
import * as React from "react"

import {
  localized,
  recommendedVersion,
  type ExtensionMarketIndex,
  type ExtensionMarketPlugin,
  type ExtensionMarketVersion,
} from "@context-hub/core/extension-market"
import {
  createRemoteExtensionMarket,
  type ExtensionIcon,
  type ExtensionView,
} from "@context-hub/extensions"

/** One index entry that has no kernel row yet. */
export interface MarketEntry {
  plugin: ExtensionMarketPlugin
  version: ExtensionMarketVersion
  view: ExtensionView
}

/** A list image drawn with the same contract as a manifest icon. */
function marketIcon(src: string): ExtensionIcon {
  const Icon: ExtensionIcon = ({ className }) =>
    React.createElement("img", {
      src,
      alt: "",
      "aria-hidden": true,
      className,
    })
  return Icon
}

/**
 * Shape the index entries this machine does not have into catalog rows.
 *
 * @param installed — the kernel snapshot's entries.
 * @param index — the validated market document.
 * @param locale — the reader's locale id.
 * @returns one row per listed plugin that is not installed.
 */
export function marketEntriesFor(
  installed: readonly ExtensionView[],
  index: ExtensionMarketIndex,
  locale: string
): MarketEntry[] {
  const held = new Set(installed.map((entry) => entry.manifest.id))
  return index.plugins
    .filter((plugin) => !held.has(plugin.id))
    .map((plugin) => {
      const version = recommendedVersion(plugin)
      return {
        plugin,
        version,
        view: {
          manifest: {
            id: plugin.id,
            name: localized(plugin.title, locale),
            version: version.version,
            apiVersion: version.apiVersion,
            kind: "code",
            category: plugin.category ?? "source",
            description: localized(plugin.description, locale),
            icon: marketIcon(plugin.icon),
            defaultEnabled: false,
            permissions: plugin.permissions,
          },
          enabled: false,
          status: "inactive",
          points: [],
          provides: [],
        },
      }
    })
}

const market = createRemoteExtensionMarket()

interface MarketRead {
  url: string
  nonce: number
  index: ExtensionMarketIndex | null
  failure: string | null
}

/**
 * Read one configured market, re-reading when the source or refresh counter
 * changes. The loading flag is derived from what was last asked for, so the
 * effect never has to set state synchronously before its request settles.
 */
export function useExtensionMarket(url: string): {
  index: ExtensionMarketIndex | null
  loading: boolean
  failure: string | null
  refresh: () => void
} {
  const [nonce, setNonce] = React.useState(0)
  const [state, setState] = React.useState<MarketRead | null>(null)

  React.useEffect(() => {
    if (url === "") return
    let cancelled = false
    void market.list(url, nonce > 0).then(
      (index) => {
        if (!cancelled) setState({ url, nonce, index, failure: null })
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            url,
            nonce,
            index: null,
            failure: error instanceof Error ? error.message : String(error),
          })
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [url, nonce])

  const settled = state !== null && state.url === url && state.nonce === nonce
  return {
    index: settled ? state.index : null,
    loading: url !== "" && !settled,
    failure: settled ? state.failure : null,
    refresh: () => setNonce((value) => value + 1),
  }
}
