/**
 * The library as the page uses it: the rows, what each agent already holds, and
 * the writes the screen offers.
 *
 * The bridge holds the files and the truth about them; this side keeps the last
 * answer it was given and asks again after every write, because every write can
 * change more than it named — collecting a pack rewrites the index and the
 * marketplace, and an update can land on agent copies too.
 *
 * The agents' own answers are folded here, not in the bridge: what each agent
 * holds is read by that agent's extension, and this side only joins the answers
 * into the rows the page draws.
 */
import { PlugIcon } from "lucide-react"
import * as React from "react"

import type { ExtensionIcon } from "@workspace/extensions"
import { useExtensionSnapshot, useHub, useI18n } from "@workspace/extensions/react"

import {
  type PackContents,
  type PluginInstallReport,
  type PluginInstallScope,
} from "./contract.ts"
import {
  PLUGIN_SERVICE,
  type PluginInstaller,
  type PluginPlace,
  type PluginService,
  type PluginSwitches,
  type PluginTools,
} from "./provider.ts"
import type { PluginRecord, PluginUpdateCheck, PluginUpdateSummary } from "./revision.ts"
import { collectScanned, composeRows, type ScannedPack } from "./rows.ts"
import { probeInstallers } from "./scan.ts"
import type { PluginFileEntry, PluginRow } from "./types.ts"

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
  /* An installer carries no mark of its own: it shows the icon its own extension
     declares, which is the same one the catalog row draws. */
  const iconFor = React.useCallback(
    (id: string): ExtensionIcon =>
      snapshot.entries.find((entry) => entry.manifest.id === id)?.manifest.icon ?? PlugIcon,
    [snapshot]
  )
  const [records, setRecords] = React.useState<PluginRecord[]>([])
  const [scanned, setScanned] = React.useState<ScannedPack[]>([])
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
    if (service === null || tools === null) {
      setClients([])
      setScanned([])
      return
    }
    /* Every client is asked at once, and each answer stands on its own: see
       ./scan.ts for why both of those matter. An agent whose program is missing,
       or which cannot answer at all, is still listed — a person then sees that
       the hub looked for it rather than wondering why an agent they use is
       absent, and one that failed says so in its own words. */
    const probes = await probeInstallers(service.registry.installers(), tools)
    setClients(
      probes.map((one) => ({
        id: one.installer.id,
        label: one.installer.label,
        icon: iconFor(one.installer.id),
        places: one.installer.places,
        switches: one.switches,
        available: one.available,
        ...(one.error === undefined ? {} : { error: one.error }),
      }))
    )
    /* Only a client that answered contributes packs to the rows: one that failed
       knows of none, and drawing its empty answer as "holds nothing" is the one
       thing the error is carried to prevent. */
    setScanned(
      collectScanned(
        probes
          .filter((one) => one.error === undefined)
          .map((one) => ({
            client: one.installer.id,
            label: one.installer.label,
            icon: iconFor(one.installer.id),
            places: one.installer.places,
            switches: one.switches,
            packs: one.packs,
          }))
      )
    )
  }, [service, revision, iconFor, tools])

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
      if (tools === null) throw new Error("the plugin library is not running")
      setBusy(true)
      try {
        await act(installer, tools)
        await read()
        setFailure(null)
      } catch (error: unknown) {
        setFailure(error instanceof Error ? error.message : String(error))
        throw error
      } finally {
        setBusy(false)
      }
    },
    [service, tools, read]
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
    () => composeRows(records, scanned, state.active, t),
    [records, scanned, state.active, t]
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
    clients,
    root,
    busy,
    failure,
    missing,
    refresh: read,
    checkUpdates: () => write<PluginUpdateSummary>({ action: "check-updates" }),
    checkUpdate: (name) => write<PluginUpdateCheck>({ action: "check-update", name }),
    update: (name) => write<PluginUpdateOutcome>({ action: "update", name }),

    add: (source) => write<PluginCollected>({ action: "add", source }),
    adopt,
    addFolder: (name, files) => write<PluginCollected>({ action: "add-folder", name, files }),
    restore,
    remove: (name) => write<void>({ action: "remove", name }),
    setTags: (name, tags) => write<void>({ action: "tags", name, tags }),
    install: (name, client, scope) =>
      deliver(client, (installer, tools) => installer.install(name, scope, tools)),
    uninstall: (name, client, scope) => {
      /* The agent's own id for the pack, not the pack's name: it names the
         marketplace the pack really came from, and an agent holds packs this hub
         never delivered. It answered with that id when it was asked what it
         holds, so this side never has to guess at it. */
      const own = scanned
        .find((one) => one.name === name)
        ?.held.find((one) => one.client === client)?.id
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
