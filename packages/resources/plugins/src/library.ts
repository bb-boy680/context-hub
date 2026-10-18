/**
 * The library as the page uses it: the rows, what each agent already holds, and
 * the writes the screen offers.
 *
 * The bridge holds the files and the truth about them; the read that collects
 * both halves of the answer lives in `./library-store.ts`, and this file is how
 * the page watches it and what every write goes through. Every write asks for
 * that read again, because every write can change more than it named — collecting
 * a pack rewrites the index and the marketplace, and an update can land on agent
 * copies too.
 *
 * The agents' own answers are not folded in the bridge: what each agent holds is
 * read by that agent's extension, and the fold that turns those answers into rows
 * happens on this side, in `./rows.ts`.
 */
import * as React from "react"

import { createCatalog, type Catalog, type ExtensionIcon } from "@context-hub/extensions"
import { useCatalog, useHub, useI18n, useSettings } from "@context-hub/extensions/react"

import {
  PLUGIN_NAME_TAKEN,
  PLUGIN_ROUTE,
  PluginNameTakenError,
  type PackContents,
  type PluginInstallReport,
  type PluginInstallScope,
} from "./contract.ts"
import { NOTHING_READ, PLUGIN_LIBRARY_SERVICE, type PluginLibraryValue } from "./library-store.ts"
import {
  PLUGIN_SERVICE,
  type PluginInstaller,
  type PluginPlace,
  type PluginService,
  type PluginSwitches,
  type PluginTools,
} from "./provider.ts"
import type { PluginRecord, PluginUpdateCheck, PluginUpdateSummary } from "./revision.ts"
import { composeRows } from "./rows.ts"
import type { PluginFileEntry, PluginRow } from "./types.ts"

/** The route the library answers on. */
const ENDPOINT = PLUGIN_ROUTE

/** What one call to the bridge returns when it refuses. */
interface ErrorBody {
  error?: string
  /** Set when the page can word the refusal better than the host's sentence. */
  code?: string
  name?: string
  from?: string
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

/** One pack's files, as the files panel lists them, out of the hub's own copy. */
export async function packFiles(name: string): Promise<PluginFileEntry[]> {
  return call<PluginFileEntry[]>(`${ENDPOINT}?action=files&name=${encodeURIComponent(name)}`)
}

/**
 * One pack's files as the directory they sit in holds them.
 *
 * A pack no library record holds is not in the hub's own copy at all — it is a
 * directory an agent reads in place — so its panel reads that directory.
 */
export async function packFilesIn(dir: string): Promise<PluginFileEntry[]> {
  return call<PluginFileEntry[]>(`${ENDPOINT}?action=files&dir=${encodeURIComponent(dir)}`)
}

/**
 * One file's text, out of the hub's own copy.
 *
 * @returns the text, or null when the pack does not hold that file — an empty
 * panel is honest, where a stand-in would be invented content.
 */
export async function packFile(name: string, path: string): Promise<string | null> {
  const answer = await call<{ text: string }>(
    `${ENDPOINT}?action=file&name=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}`
  ).catch(() => null)
  return answer?.text ?? null
}

/** One file's text, out of the directory an agent reads the pack in. */
export async function packFileIn(dir: string, path: string): Promise<string | null> {
  const answer = await call<{ text: string }>(
    `${ENDPOINT}?action=file&dir=${encodeURIComponent(dir)}&path=${encodeURIComponent(path)}`
  ).catch(() => null)
  return answer?.text ?? null
}

/**
 * What one pack carries, out of the hub's own copy.
 *
 * A pack's contents are read from its directory rather than from anything the
 * library records, so this is a read of the disk each time it is asked — which
 * is why the dialog asks once as it opens rather than on every render.
 */
export async function packContents(name: string): Promise<PackContents> {
  return call<PackContents>(`${ENDPOINT}?action=contents&name=${encodeURIComponent(name)}`)
}

/** What one pack carries, read out of the directory an agent keeps it in. */
export async function packContentsIn(dir: string): Promise<PackContents> {
  return call<PackContents>(`${ENDPOINT}?action=contents&dir=${encodeURIComponent(dir)}`)
}

/** The file a pack says what it is for in, which is what a cover falls back to. */
export const README_FILE = "README.md"

/**
 * One file as a `data:` URL, which is how a picture reaches the bridge.
 *
 * The bridge takes one JSON body per write, so a file travels inside it while it
 * is still recognizable as the file it is — name, type and bytes — which is
 * exactly what `@context-hub/core`'s `readSource` reads back out at the far end.
 */
export function dataUrlOf(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("a file could not be read"))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

/**
 * Where a pack's own pictures are readable, as the prefix a document's relative
 * references resolve under.
 *
 * A README points at the pictures beside it — `assets/logo.png` — and those are
 * the pack's files, so they are served by the same route its text is read from,
 * out of whichever of the two copies answers for this pack. A pack the hub
 * neither holds nor can name a directory for has nowhere to read one from, which
 * is what leaves such a document's pictures unresolved.
 */
export function packImageBase(plugin: PluginRow): string | undefined {
  const where = plugin.stored
    ? `name=${encodeURIComponent(plugin.id)}`
    : plugin.directory === undefined
      ? undefined
      : `dir=${encodeURIComponent(plugin.directory)}`
  return where === undefined ? undefined : `${ENDPOINT}?action=raw&${where}&path=`
}

/**
 * One pack's own README, for a cover that has no picture to show.
 *
 * A pack is read where it lives, by the same rule its files panel uses: out of
 * the hub's own copy when it holds one, and otherwise out of the directory an
 * agent reads it in. A pack the hub neither holds nor can name a directory for
 * has no README to show, which is not a read that can fail.
 *
 * Nothing is cached: a row carries no revision to key a cache on, so a pack
 * updated while this session is open would keep drawing the text it replaced.
 *
 * @param plugin — the row whose README is shown.
 * @returns the text; `undefined` while it is still being read, `null` when the
 * pack has none to show.
 */
export function usePackReadme(plugin: PluginRow): string | null | undefined {
  /* Where this pack is read from — its own directory, or the hub's copy by name
     — which is the same pair of places its files panel reads. */
  const dir = plugin.stored ? null : (plugin.directory ?? null)
  const read = React.useCallback(
    () => (dir === null ? packFile(plugin.id, README_FILE) : packFileIn(dir, README_FILE)),
    [dir, plugin.id]
  )
  const [text, setText] = React.useState<string | null | undefined>(undefined)

  /* Every surface showing a pack is keyed by the pack, so this only runs again
     when the same pack starts being read from somewhere else — which is what
     adopting one does. */
  React.useEffect(() => {
    let live = true
    /* The read is queued rather than started in the effect's own body, because a
       state update there is what the hooks lint refuses. */
    queueMicrotask(() => {
      if (!live) return
      void read()
        .then((body) => {
          if (live) setText(body)
        })
        /* A README that cannot be read is one this cover has none of; what
           stopped the read is the files panel's to say. */
        .catch(() => {
          if (live) setText(null)
        })
    })
    return () => {
      live = false
    }
  }, [read])

  return text
}

/**
 * One call to this route, answered as JSON.
 *
 * Shared with `./library-store.ts`, which is where the library's own read lives
 * now and which reaches the same route through this one helper.
 *
 * @param path — the whole path, query and all.
 * @param body — what to send; absent makes it a read.
 * @throws {Error} when the host refused it, with the reason it gave.
 */
export async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as ErrorBody
    if (detail.code === PLUGIN_NAME_TAKEN) {
      throw new PluginNameTakenError(detail.name ?? "", detail.from ?? "")
    }
    throw new Error(detail.error ?? `${String(response.status)} ${response.statusText}`)
  }
  return (await response.json()) as T
}

/** A refusal's own words, whichever side of the bridge it came from. */
export function reasonOf(failure: unknown) {
  return failure instanceof Error ? failure.message : String(failure)
}

/** One client this hub can deliver to, and what it already holds. */
export interface PluginClient {
  id: string
  /** The agent's own name, as this hub's catalog lists it. */
  label: string
  /** The mark the agent's own extension declares. */
  icon: ExtensionIcon
  /** The places it keeps packs in, in its own order, each saying if it can be switched. */
  places: readonly PluginPlace[]
  /**
   * What its files record about each pack's switch, by place and by pack id.
   *
   * Read by the hub rather than answered by the client, which reports one value
   * per pack: this is what says which of two files switched a pack which way.
   */
  switches: PluginSwitches
  /** Whether the agent is on this machine; one that is not says so instead of failing. */
  available: boolean
  /**
   * Why this client could not be read, in its own words; absent when it answered.
   *
   * A client that is here but whose list could not be read holds an unknown set
   * of packs, which is not the same as holding none — so the one row that failed
   * names the reason rather than drawing itself as an agent holding nothing.
   */
  error?: string
}

/** The library as the page works with it. */
export interface PluginLibrary {
  /** Every collected pack, newest change first. */
  rows: PluginRow[]
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
  /**
   * Ask one pack's source whether it moved, and keep the answer.
   *
   * A person looking at one pack should not have to check the whole library; the
   * answer lands on the record, so the row that shows it is read from there.
   *
   * @throws {Error} when the pack's source cannot be asked at all.
   */
  checkUpdate(name: string): Promise<PluginUpdateCheck>
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
   * Take a pack an agent holds into the library.
   *
   * @param name — the pack to take in, by the name the agent listed it under.
   * @returns the record that is in the library now, and whether it was already there.
   * @throws {Error} when no agent holds a pack by that name, or when the one that does named no directory.
   */
  adopt(name: string): Promise<PluginCollected>
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
  /**
   * Add pictures a person chose for one pack, newest first.
   *
   * A source is a `data:` URL for a file from this machine, or the address of one
   * somebody else serves; the pack's record is what says which pictures it has,
   * so the pane that draws them reads the row back after this.
   *
   * @param sources — the pictures to take over, in the order they were chosen.
   */
  addAssets(name: string, sources: string[]): Promise<void>
  /** Drop one picture a person added, and the file the hub kept for it. */
  removeAsset(name: string, ref: string): Promise<void>
  /** Deliver a pack to one client, at one scope. */
  install(name: string, client: string, scope: PluginInstallScope): Promise<void>
  /** Take it back out of that client and scope, whatever marketplace it came from. */
  uninstall(name: string, client: string, scope: PluginInstallScope): Promise<void>
  /**
   * Switch a client's use of a pack on or off in one scope.
   *
   * The scope is the one its own file records: the hub writes the repository's
   * file, which is the one it can name, and never the person's own.
   */
  setEnabled(
    name: string,
    client: string,
    scope: PluginInstallScope,
    on: boolean
  ): Promise<void>
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

/**
 * What a page watches when this module is not loaded: always empty, never
 * reading. It exists so that watching a library is one code path rather than a
 * hook called inside a condition.
 */
const NO_LIBRARY: Catalog<PluginLibraryValue> = createCatalog({
  initial: NOTHING_READ,
  read: async () => NOTHING_READ,
})

/* Which agents this hub can deliver to is a plugin question, not a library one:
   the installers live in the agent plugins, and this page reads the registry
   they registered into. That registry is what the library's own read asks, and
   it reads again whenever the catalog changes, so enabling an agent adds it to
   the menu without a reload of the page. */
export function usePluginLibrary(): PluginLibrary {
  const { t, state } = useI18n()
  const { downloadRemoteImages } = useSettings()
  const ctx = useHub()
  const shared = React.useMemo(() => ctx.get(PLUGIN_LIBRARY_SERVICE) ?? null, [ctx])
  const catalog = shared ?? NO_LIBRARY
  const service = React.useMemo(
    (): PluginService | null => ctx.get(PLUGIN_SERVICE) ?? null,
    [ctx]
  )
  /**
   * The tools an installer is handed here.
   *
   * The published ones reach programs; the client files are this form's own, so
   * they are added where the form is known. An installer reads a client's
   * settings to find out which of its files switches a pack on, which the client
   * itself answers only once for the pack.
   */
  const tools = React.useMemo(
    (): PluginTools | null => (service === null ? null : { ...service.tools, files: ctx.host.files }),
    [service, ctx]
  )
  const [busy, setBusy] = React.useState(false)
  const [writeFailure, setWriteFailure] = React.useState<string | null>(null)

  React.useEffect(() => {
    /* Somebody has to be the first to ask. A form's startup does this before
       anything is drawn; until it does, the page is what asks. */
    void shared?.load()
  }, [shared])

  const value = useCatalog(catalog, (snapshot) => snapshot.value ?? NOTHING_READ)
  const readFailure = useCatalog(catalog, (snapshot) => snapshot.failure)

  /** Read the library again: what every write ends with, and what the person's own refresh button asks for. */
  const reload = React.useCallback(async () => {
    await shared?.reload()
  }, [shared])

  /** Run one write, then read everything again: any write can change more than it named. */
  const write = React.useCallback(
    async <T,>(body: Record<string, unknown>): Promise<T> => {
      setBusy(true)
      try {
        const answer = await call<T>(ENDPOINT, body)
        await reload()
        setWriteFailure(null)
        return answer
      } finally {
        setBusy(false)
      }
    },
    [reload]
  )

  /**
   * Run one installer's own action, then read everything again.
   *
   * The failure is kept as well as thrown: the agent's own words name the real
   * cause, and a caller that only toasts would lose them on the next render.
   */
  const deliver = React.useCallback(
    async (
      client: string,
      act: (installer: PluginInstaller, tools: PluginTools) => Promise<PluginInstallReport>
    ) => {
      if (service === null) throw new Error("the plugin library is not running")
      const installer = service.installers().find((one) => one.id === client)
      if (installer === undefined) throw new Error(`no installer named ${client}`)
      if (tools === null) throw new Error("the plugin library is not running")
      setBusy(true)
      try {
        await act(installer, tools)
        await reload()
        setWriteFailure(null)
      } catch (error: unknown) {
        setWriteFailure(reasonOf(error))
        throw error
      } finally {
        setBusy(false)
      }
    },
    [service, tools, reload]
  )

  /**
   * Fetch one pack again from the address its record carries.
   *
   * A repair rather than a write the person asked for: it neither takes the busy
   * flag nor reads again on its own, so a page can run several at once, report
   * on each as it lands, and read once at the end. Nothing starts it but the page
   * seeing a pack in `missing` — a read that finds one is not a reason to fetch
   * it, which is what keeps a library read at startup from turning into a
   * download.
   *
   * @param name — the pack whose files are gone.
   * @returns the record as it stands once the files are back.
   */
  const restore = async (name: string): Promise<PluginRecord> =>
    call<PluginRecord>(ENDPOINT, { action: "restore", name })

  /* What the clients hold, as the read folded it; every write that acts on a
     client's own record reads it from here. */
  const scanned = value.scanned

  const rows = React.useMemo(
    () => composeRows(value.records, scanned, state.active, t),
    [value.records, scanned, state.active, t]
  )

  /**
   * Take a pack an agent holds into the library.
   *
   * The agent's own answer says where the pack sits, and that directory is what
   * the library copies — the same collect an address goes through, so nothing
   * here has to know how a pack is laid out.
   */
  const adopt = React.useCallback(
    (name: string): Promise<PluginCollected> => {
      const pack = scanned.find((one) => one.name === name)
      if (pack?.source === undefined) return Promise.reject(new Error(t("plugins.adopt.unknown")))
      return write<PluginCollected>({ action: "add", source: pack.source.path })
    },
    [scanned, write, t]
  )

  /**
   * The agent's own id for one pack it holds.
   *
   * It names the marketplace the pack really came from, and an agent holds packs
   * this hub never delivered. The agent answered with that id when it was asked
   * what it holds, so this side never has to guess at it.
   */
  const heldId = React.useCallback(
    (name: string, client: string): string | undefined =>
      scanned.find((one) => one.name === name)?.held.find((one) => one.client === client)?.id,
    [scanned]
  )

  return {
    rows,
    clients: value.clients,
    root: value.root,
    /* A write in flight, and only a write: a read never blocks the screen — the
       page draws the last answer it has while another one is being made. */
    busy,
    /* A read that failed keeps the library it last read and says so; a write that
       failed keeps its own words, which name what the person just did. */
    failure: writeFailure ?? readFailure,
    missing: value.missing,
    refresh: reload,
    checkUpdates: () => write<PluginUpdateSummary>({ action: "check-updates" }),
    checkUpdate: (name) => write<PluginUpdateCheck>({ action: "check-update", name }),
    update: (name) => write<PluginUpdateOutcome>({ action: "update", name }),

    add: (source) => write<PluginCollected>({ action: "add", source }),
    adopt,
    addFolder: (name, files) => write<PluginCollected>({ action: "add-folder", name, files }),
    restore,
    remove: (name) => write<void>({ action: "remove", name }),
    setTags: (name, tags) => write<void>({ action: "tags", name, tags }),
    addAssets: (name, sources) =>
      write<void>({
        action: "asset-add",
        name,
        sources,
        download: downloadRemoteImages,
      }),
    removeAsset: (name, ref) => write<void>({ action: "asset-remove", name, ref }),
    install: (name, client, scope) =>
      deliver(client, (installer, tools) => installer.install(name, scope, tools)),
    uninstall: (name, client, scope) => {
      /* The agent's own id for the pack, not the pack's name: it names the
         marketplace the pack really came from, and an agent holds packs this hub
         never delivered. It answered with that id when it was asked what it
         holds, so this side never has to guess at it. */
      const own = heldId(name, client)
      if (own === undefined) {
        return Promise.reject(new Error(t("plugins.uninstall.unknown")))
      }
      return deliver(client, (installer, tools) => installer.remove(own, scope, tools))
    },
    setEnabled: (name, client, scope, on) => {
      const own = heldId(name, client)
      if (own === undefined) {
        return Promise.reject(new Error(t("plugins.uninstall.unknown")))
      }
      return deliver(client, (installer, tools) => {
        /* An agent that keeps no such switch is refused here rather than left
           looking as though the press did nothing. */
        if (installer.setEnabled === undefined) {
          return Promise.reject(new Error(t("plugins.enable.selfManaged")))
        }
        return installer.setEnabled(own, scope, on, tools)
      })
    },
  }
}
