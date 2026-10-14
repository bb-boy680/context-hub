/**
 * The library as the page uses it: the rows, what each agent already holds, and
 * the writes the screen offers.
 *
 * The bridge holds the files and the truth about them; this side keeps the last
 * answer it was given and asks again after every write, because every write can
 * change more than it named — collecting a pack rewrites the index and the
 * marketplace, and an update can land on agent copies too.
 *
 * Which agents this hub can deliver to is not answered here at all: each agent's
 * own extension registers how it installs a plugin, and this reads that registry.
 *
 * Ages and source words are worded here rather than stored: a row that carried
 * "2 days ago" would be wrong by the next render.
 */
import { PlugIcon } from "lucide-react"
import * as React from "react"

import { assetUrl } from "@workspace/core"
import type { ExtensionIcon } from "@workspace/extensions"
import { useExtensionSnapshot, useHub, useI18n } from "@workspace/extensions/react"

import {
  installedRevision,
  type PluginInstallReport,
  type PluginInstallScope,
} from "./contract.ts"
import { PLUGIN_SERVICE, type PluginInstaller, type PluginService, type PluginTools } from "./provider.ts"
import type { PluginRecord, PluginUpdateSummary } from "./revision.ts"
import type { PluginFileEntry, PluginRow, PluginSource } from "./types.ts"

/** The route the library answers on. */
const ENDPOINT = "/hub/plugins"

/** What one call to the bridge returns when it refuses. */
interface ErrorBody {
  error?: string
}

/** The list answer. */
interface ListAnswer {
  root: string
  plugins: PluginRecord[]
  /** The records whose files are gone, by name. */
  missing: string[]
}

/**
 * What one collection produced.
 *
 * `already` is the answer to "was this here?" rather than a failure: the pack is
 * in the library either way, and a page says so instead of offering to do it
 * again.
 */
export interface PluginCollected {
  record: PluginRecord
  already: boolean
}

/**
 * One file of a folder the page read, on its way to the host.
 *
 * The path is relative to the folder, so the host stages the pack exactly as the
 * person has it; the bytes are base64 because the request body is JSON.
 */
export interface PackUploadFile {
  path: string
  base64: string
}

/** How long a pack has been at its current revision, in the locale's own words. */
function ageOf(iso: string, language: string | undefined, t: (key: string) => string): string {
  if (iso === "") return t("plugins.age.unknown")
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return t("plugins.age.unknown")
  let value = Math.max(0, (Date.now() - then) / 1000)
  const format = new Intl.RelativeTimeFormat(language ?? "en", { numeric: "auto" })
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ]
  for (const [size, unit] of steps) {
    if (value < size) return format.format(-Math.round(value), unit)
    value /= size
  }
  return t("plugins.age.unknown")
}

/** Where a pack came from, in the words the row shows. */
function sourceOf(record: PluginRecord): PluginSource {
  return record.source.kind === "path" ? "local" : record.source.kind
}

/** The revision this copy was collected at, or null when its source cannot be asked. */
function installedRevisionOf(record: PluginRecord): string | null {
  return installedRevision(record.source)
}

/** One record as the row the two views draw. */
export function toRow(
  record: PluginRecord,
  language: string | undefined,
  t: (key: string) => string
): PluginRow {
  const installed = installedRevisionOf(record)
  const latest = record.checked?.latest
  const current = record.checked?.currentHash
  return {
    id: record.name,
    name: record.name,
    version: record.version,
    description: record.description,
    tags: record.tags,
    source: sourceOf(record),
    updated: ageOf(record.updatedAt, language, t),
    /* The first asset is the pack's own picture, which the hub copied out of it
       when it was collected; the rest is whatever a person added. */
    ...(record.assets[0] === undefined ? {} : { cover: assetUrl(record.assets[0]) }),
    outdated: installed !== null && latest !== undefined && latest !== installed,
    modified: current !== undefined && current !== record.hash,
    hasSource: installed !== null,
    checkedAt: record.checked?.at ?? "",
  }
}

/** One pack's files, as the files panel lists them. */
export async function packFiles(id: string): Promise<PluginFileEntry[]> {
  return call<PluginFileEntry[]>(`${ENDPOINT}?action=files&id=${encodeURIComponent(id)}`)
}

/**
 * One file's text.
 *
 * @returns the text, or null when the pack does not hold that file — an empty
 * panel is honest, where a stand-in would be invented content.
 */
export async function packFile(id: string, path: string): Promise<string | null> {
  const answer = await call<{ text: string }>(
    `${ENDPOINT}?action=file&id=${encodeURIComponent(id)}&path=${encodeURIComponent(path)}`
  ).catch(() => null)
  return answer?.text ?? null
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as ErrorBody
    throw new Error(detail.error ?? `${String(response.status)} ${response.statusText}`)
  }
  return (await response.json()) as T
}

/** One client this hub can deliver to, and what it already holds. */
export interface PluginClient {
  id: string
  /** The agent's own name, as this hub's catalog lists it. */
  label: string
  /** The mark the agent's own extension declares. */
  icon: ExtensionIcon
  /** The scopes this agent installs into, in the order its own menu lists them. */
  scopes: readonly PluginInstallScope[]
  /** Whether the agent can be switched off without removing it; Codex cannot. */
  switchable: boolean
  /** Whether the agent is on this machine; one that is not says so instead of failing. */
  available: boolean
  /** The scopes each pack is already in. */
  delivered: Record<string, PluginInstallScope[]>
}

/** The library as the page works with it. */
export interface PluginLibrary {
  /** Every collected pack, newest change first. */
  rows: PluginRow[]
  /** The packs already delivered to any client. */
  delivered: readonly string[]
  /** The clients this hub can deliver to, with what each one holds. */
  clients: readonly PluginClient[]
  /** Where the packs live, for the page to show. */
  root: string
  /** True while a call is in flight. */
  busy: boolean
  /** A read the host could not answer at all, which is not the same as an empty library. */
  failure: string | null
  /** The records whose files are gone, by name: what a page can fetch again. */
  missing: readonly string[]
  /** Read the library again, after a write this side made outside the usual path. */
  refresh(): Promise<void>
  /** Ask every source whether it moved. */
  checkUpdates(): Promise<PluginUpdateSummary>
  /** Take one pack to what its source holds. */
  update(name: string): Promise<PluginUpdateOutcome>
  /**
   * Collect a pack from an address, or find that it is already here.
   *
   * @param source — a repository address, an archive URL, or a directory on this machine.
   * @returns the record that is in the library now, and whether this address had already put it there.
   */
  add(source: string): Promise<PluginCollected>
  /**
   * Collect one pack from a folder the page read.
   *
   * A page is given a chosen folder's files and nothing about where they were,
   * so a pack that only exists on this machine arrives as its bytes.
   *
   * @returns the record that is in the library now, and whether this folder had already put it there.
   */
  addFolder(name: string, files: readonly PackUploadFile[]): Promise<PluginCollected>
  /**
   * Fetch one pack again from the address its record carries.
   *
   * One pack per call, so a page can put several back at once and report on each
   * as it lands rather than waiting for the slowest.
   *
   * @param name — the pack whose files are gone.
   * @returns the record as it stands once the files are back.
   */
  restore(name: string): Promise<PluginRecord>
  /** Drop one pack, and everything the hub keeps for it. */
  remove(name: string): Promise<void>
  /** Keep a pack's categories. */
  setTags(name: string, tags: string[]): Promise<void>
  /** Deliver a pack to one client, at one scope. */
  install(name: string, client: string, scope: PluginInstallScope): Promise<void>
  /** Take it back out of that client and scope. */
  uninstall(name: string, client: string, scope: PluginInstallScope): Promise<void>
}

/** What one update did, as the bridge reports it. */
export interface PluginUpdateOutcome {
  name: string
  /** False when the download turned out to be what was already here. */
  changed: boolean
  from: string | null
  to: string | null
  /** The files here had been edited, and the update replaced them. */
  overwroteEdits: boolean
}

/* Which agents this hub can deliver to is a plugin question, not a library one:
   the installers live in the agent plugins, and this page reads the registry
   they registered into. The snapshot's revision is what says the catalog
   changed, so enabling an agent adds it to the menu without a reload. */
export function usePluginLibrary(): PluginLibrary {
  const { t, state } = useI18n()
  const ctx = useHub()
  const snapshot = useExtensionSnapshot()
  const revision = snapshot.revision
  const service = React.useMemo(
    (): PluginService | null => ctx.get(PLUGIN_SERVICE) ?? null,
    [ctx]
  )
  /* An installer carries no mark of its own: it shows the icon its own extension
     declares, which is the same one the catalog row draws. */
  const iconFor = React.useCallback(
    (id: string): ExtensionIcon =>
      snapshot.entries.find((entry) => entry.manifest.id === id)?.manifest.icon ?? PlugIcon,
    [snapshot]
  )
  const [records, setRecords] = React.useState<PluginRecord[]>([])
  const [clients, setClients] = React.useState<PluginClient[]>([])
  const [root, setRoot] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [missing, setMissing] = React.useState<readonly string[]>([])

  const read = React.useCallback(async () => {
    void revision
    const answer = await call<ListAnswer>(`${ENDPOINT}?action=list`)
    setRecords(answer.plugins)
    setRoot(answer.root)
    setMissing(answer.missing)
    if (service === null) {
      setClients([])
      return
    }
    const found: PluginClient[] = []
    for (const installer of service.registry.installers()) {
      /* An agent whose program is missing, or which cannot answer, is still
         listed: a person then sees that the hub looked for it rather than
         wondering why an agent they use is absent. */
      const available = await installer.available(service.tools).catch(() => false)
      const delivered = available
        ? await installer.delivered(service.tools).catch(() => ({}))
        : {}
      found.push({
        id: installer.id,
        label: installer.label,
        icon: iconFor(installer.id),
        scopes: installer.scopes,
        switchable: installer.setEnabled !== undefined,
        available,
        delivered,
      })
    }
    setClients(found)
  }, [service, revision, iconFor])

  /** Run one write, then read everything again: any write can change more than it named. */
  const write = React.useCallback(
    async <T,>(body: Record<string, unknown>): Promise<T> => {
      setBusy(true)
      try {
        const answer = await call<T>(ENDPOINT, body)
        await read()
        setFailure(null)
        return answer
      } finally {
        setBusy(false)
      }
    },
    [read]
  )

  /**
   * Run one installer's own action, then read everything again.
   *
   * The failure lands in `failure` as well as in the returned rejection: the
   * agent's own words name the real cause, and a caller that only toasts would
   * lose them on the next render.
   */
  const deliver = React.useCallback(
    async (
      client: string,
      act: (installer: PluginInstaller, tools: PluginTools) => Promise<PluginInstallReport>
    ) => {
      if (service === null) throw new Error("the plugin library is not running")
      const installer = service.registry.installers().find((one) => one.id === client)
      if (installer === undefined) throw new Error(`no installer named ${client}`)
      setBusy(true)
      try {
        await act(installer, service.tools)
        await read()
        setFailure(null)
      } catch (error: unknown) {
        setFailure(error instanceof Error ? error.message : String(error))
        throw error
      } finally {
        setBusy(false)
      }
    },
    [service, read]
  )

  /* The first read is queued rather than run during render: a state update in
     an effect's own body is what the hooks lint refuses. */
  React.useEffect(() => {
    let alive = true
    queueMicrotask(() => {
      if (!alive) return
      void read().catch((error: unknown) => {
        if (alive) setFailure(error instanceof Error ? error.message : String(error))
      })
    })
    return () => {
      alive = false
    }
  }, [read])

  /**
   * Fetch one pack again from the address its record carries.
   *
   * A repair rather than a write the person asked for: it neither takes the busy
   * flag nor reads again on its own, so a page can run several at once, report
   * on each as it lands, and read once at the end.
   *
   * @param name — the pack whose files are gone.
   * @returns the record as it stands once the files are back.
   */
  const restore = async (name: string): Promise<PluginRecord> =>
    call<PluginRecord>(ENDPOINT, { action: "restore", name })

  const rows = React.useMemo(
    () => records.map((record) => toRow(record, state.active, t)),
    [records, state.active, t]
  )

  return {
    rows,
    /* A pack counts as delivered when any client holds it anywhere. */
    delivered: [...new Set(clients.flatMap((client) => Object.keys(client.delivered)))],
    clients,
    root,
    busy,
    failure,
    missing,
    refresh: read,
    checkUpdates: () => write<PluginUpdateSummary>({ action: "check-updates" }),
    update: (name) => write<PluginUpdateOutcome>({ action: "update", name }),

    add: (source) => write<PluginCollected>({ action: "add", source }),
    addFolder: (name, files) => write<PluginCollected>({ action: "add-folder", name, files }),
    restore,
    remove: (name) => write<void>({ action: "remove", name }),
    setTags: (name, tags) => write<void>({ action: "tags", name, tags }),
    install: (name, client, scope) =>
      deliver(client, (installer, tools) => installer.install(name, scope, tools)),
    uninstall: (name, client, scope) =>
      deliver(client, (installer, tools) => installer.remove(name, scope, tools)),
  }
}
