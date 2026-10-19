/**
 * What the MCP page reads: the hub's own records and every client file that
 * declares a server, plus every action that changes either.
 *
 * The read itself is not made here. It belongs to the module's library — see
 * `./library-store.ts` — so a form can start it before this page is opened, and
 * the rows are already there when it is. What lives here is the wiring between
 * that read and React, and the writes: each one goes through the records port
 * and then asks the library to read again, so the rows follow the files.
 *
 * Failures arrive as message keys and leave as sentences, so a client's own
 * wording never reaches the screen untranslated. A failure of a *read* is the
 * library's and travels with its value; a failure of a change this page asked
 * for never reaches the library at all, and is kept here until the next change
 * clears it.
 */
import * as React from "react"
import { ServerIcon } from "lucide-react"

import { createCatalog, chosenProviders, type Catalog, type ExtensionIcon } from "@context-hub/extensions"
import { useCatalog, useChosenAgents, useExtensionSnapshot, useHub, useI18n } from "@context-hub/extensions/react"

import { buildCatalog, placesOf, type ScannedPlace } from "./catalog.ts"
import { McpError, failureText, mcpFailure } from "./contract.ts"
import type { McpDeclaration, McpIo } from "./contract.ts"
import {
  EMPTY_MCP_LIBRARY,
  loadRecords,
  targetScope,
  type McpLibraryValue,
} from "./library-store.ts"
import type { McpProbeReport } from "./probe.ts"
import { createRemoteRecords, documentOf, upsert } from "./records.ts"
import type {
  McpAgentPlace,
  McpCatalog,
  McpConfigFile,
  McpDraft,
  McpPatch,
  McpRecord,
  McpScanProblem,
} from "./types.ts"

/** What the page reads and calls. */
export interface McpLibrary {
  /** Whether this form can reach client files at all. */
  available: boolean
  /** Whether this form can run probes, which needs a host behind the page. */
  canProbe: boolean
  /** A call is in flight, so its controls are disabled. */
  busy: boolean
  /** The last failure, ready to show; null when the last call settled clean. */
  failure: string | null
  /** The merged catalog, or null while the first scan runs. */
  catalog: McpCatalog | null
  /** Every client file an enabled extension described. */
  places: McpAgentPlace[]
  /**
   * The hub's own records file, as a person reads it; empty while this form
   * cannot reach a host, which is the only source that knows it.
   */
  recordsFile: string
  /** Servers whose probe is running right now. */
  testing: readonly string[]
  /** Scan every file again and rebuild the rows. */
  refresh(): Promise<void>
  /** Prove one server now, cache and all; a failed probe is a result, not an error. */
  test(id: string): Promise<void>
  /**
   * Prove a declaration that is not recorded yet, which the add dialog uses to
   * try it out. Nothing is kept: a draft has no name to keep an answer under.
   */
  testDraft(declaration: McpDeclaration): Promise<McpProbeReport>
  /** Record a server; nothing is written into a client file yet. */
  create(draft: McpDraft): Promise<void>
  /**
   * Record the servers a client file declares and the hub does not hold, taken
   * as the files stand. It writes one document for the whole batch, so a menu
   * that adds several never leaves the file half updated.
   */
  adopt(ids: readonly string[]): Promise<void>
  /** Rewrite one server's record, carrying its declarations along when it is renamed. */
  update(id: string, patch: McpPatch): Promise<void>
  /** Drop one server's record; the declarations client files hold stay where they are. */
  remove(id: string): Promise<void>
  /** Write one server's declaration into one place's file. */
  install(id: string, place: string): Promise<void>
  /** Take that declaration back out, leaving the rest of the file alone. */
  uninstall(id: string, place: string): Promise<void>
  /** Keep the declaration but tell that client whether to connect it. */
  setEnabled(id: string, place: string, enabled: boolean): Promise<void>
  /** The file a place holds for one server, for the config-files pane. */
  file(id: string, place: string): Promise<McpConfigFile | null>
}

/**
 * What the page watches when this module is not loaded: always empty, never
 * reading. It exists so that watching a library is one code path rather than a
 * hook called inside a condition.
 */
const NO_LIBRARY: Catalog<McpLibraryValue> = createCatalog({
  initial: EMPTY_MCP_LIBRARY,
  read: async () => EMPTY_MCP_LIBRARY,
})

/** Read and write MCP state for the form in use. */
export function useMcpLibrary(): McpLibrary {
  const ctx = useHub()
  const { t } = useI18n()
  const snapshot = useExtensionSnapshot()
  const revision = snapshot.revision
  const service = React.useMemo(() => ctx.get("mcp") ?? null, [ctx])
  const files = ctx.host.files
  /* The module's own library, or nothing to watch when it was never loaded. */
  const shared = React.useMemo(() => ctx.get("catalog.mcp") ?? null, [ctx])
  const library = shared ?? NO_LIBRARY
  /* The records port a form with no library still has: every write below goes
     through it, and reading the file back is one of them. */
  const port = React.useMemo(() => createRemoteRecords(), [])
  const store = shared?.store() ?? port

  React.useEffect(() => {
    /* Somebody has to be the first to ask. A form's startup does this before
       anything is drawn; until it does, the page is what asks. */
    void shared?.load()
  }, [shared])

  const value = useCatalog(library, (held) => held.value ?? EMPTY_MCP_LIBRARY)
  const status = useCatalog(library, (held) => held.status)
  const readFailure = useCatalog(library, (held) => held.failure)

  /* What this page asked for and has not been cleared of: a change that failed,
     which the read after it never saw. */
  const [pending, setPending] = React.useState(false)
  const [actionFailure, setActionFailure] = React.useState<string | null>(null)

  /* A place carries no mark of its own: it shows the icon its own extension
     declares, which is the same one the catalog row draws. */
  const iconFor = React.useCallback(
    (id: string): ExtensionIcon =>
      snapshot.entries.find((entry) => entry.manifest.id === id)?.manifest.icon ?? ServerIcon,
    [snapshot]
  )

  /* Which providers exist is what a scan follows: an extension being enabled or
     disabled changes it, and the snapshot's revision is what says so. Which of
     them are read is the sidebar's choice — a client nobody chose has no file
     this hub scans, probes, or offers as an install target. */
  const chosen = useChosenAgents()
  const providers = React.useMemo(() => {
    void revision
    return chosenProviders(service?.providers() ?? [], chosen)
  }, [service, revision, chosen])
  const scanned = React.useMemo(() => placesOf(providers, iconFor), [providers, iconFor])
  const places = React.useMemo(() => scanned.map((entry) => entry.place), [scanned])

  const catalog = React.useMemo(() => {
    if (value.scan === null) return null
    const problems: McpScanProblem[] = value.scan.answer.problems.map((problem) => ({
      place: problem.place,
      message: failureText(t, problem.failure),
    }))
    return buildCatalog(value.records, value.scan.answer, scanned, problems, value.scan.at, value.checks)
  }, [value, scanned, t])

  const log = React.useCallback(
    (level: "info" | "warn" | "error", message: string) => {
      ctx.host.log(level, message)
    },
    [ctx]
  )

  /**
   * Change the records file, starting from what it holds right now, then show
   * the rows it holds after the change.
   *
   * The document is read again rather than taken from this page's copy: another
   * window writes the same file, and a change built from a copy that missed
   * that write would drop what it never saw. Reading inside the write queue is
   * what keeps the read and the write one step. The rows are published before
   * the read that follows confirms them, so a save shows what it saved.
   */
  const edit = React.useCallback(
    async (change: (current: McpRecord[]) => McpRecord[]): Promise<void> => {
      const current = await loadRecords(store, (file) => {
        shared?.update((draft) => {
          draft.recordsFile = file
        })
      })
      const next = change(current)
      if (next === current) return
      await store.save(next.map(documentOf))
      shared?.update((draft) => {
        draft.records = next
      })
    },
    [store, shared]
  )

  /** One row of the catalog, or a failure naming the server that is not there. */
  const rowOf = React.useCallback(
    (id: string) => {
      const found = catalog?.servers.find((server) => server.id === id)
      if (found === undefined) throw new McpError("mcp.error.unknown", { name: id })
      return found
    },
    [catalog]
  )

  /** The provider that owns one place, or a failure naming it. */
  const providerAt = React.useCallback(
    (place: string): { found: ScannedPlace; io: McpIo } => {
      /* Read from the places this page offers, so a place whose agent was
         un-chosen is not one a write can still reach. */
      const found = scanned.find((entry) => entry.place.id === place)
      if (found === undefined) throw new McpError("mcp.error.unknownPlace", { place })
      if (files === null) throw new McpError("mcp.error.noFiles")
      return { found, io: { files, log } }
    },
    [scanned, files, log]
  )

  /** Run one change, then read every file again. `force` re-probes as well. */
  const run = React.useCallback(
    async (action: () => Promise<void>, force = false) => {
      setPending(true)
      setActionFailure(null)
      try {
        await action()
        /* The library reads again, and the page watches it: nothing here has to
           know what the answer looks like. */
        await (force ? shared?.refresh() : shared?.reload())
      } catch (error) {
        setActionFailure(failureText(t, mcpFailure(error, "mcp.error.action")))
      } finally {
        setPending(false)
      }
    },
    [shared, t]
  )

  return {
    available: files !== null,
    canProbe: value.canProbe,
    /* A form with no client files is not reading one, and a read that has
       answered is not still going: what is left is a page waiting to be told. */
    busy:
      pending ||
      (files !== null && shared !== null && (status === "idle" || status === "loading")),
    /* A change this page asked for is the newest thing that happened; the
       library's own failure is the read's, and its value's is a probe's. */
    failure: actionFailure ?? readFailure ?? value.failure,
    catalog,
    places,
    recordsFile: value.recordsFile,
    testing: value.testing,

    async refresh() {
      await run(async () => undefined, true)
    },

    async test(id) {
      /* A probe that cannot reach the server is a result, so only a call that
         never got to run one is a failure here. */
      setActionFailure(null)
      try {
        const server = rowOf(id)
        const declaration = server.detail.declaration
        if (declaration === null) throw new McpError("mcp.error.incomplete")
        if (shared === null) throw new McpError("mcp.error.noProbe")
        await shared.test(
          {
            name: id,
            declaration,
            scope: targetScope(server, scanned),
          },
          (catalog?.servers ?? []).map((held) => held.id)
        )
      } catch (error) {
        setActionFailure(failureText(t, mcpFailure(error, "mcp.error.probe")))
      }
    },

    async testDraft(declaration) {
      if (shared === null) throw new McpError("mcp.error.noProbe")
      return shared.testDraft(declaration)
    },

    async create(draft) {
      if (declarationOf(draft.declaration) === null) throw new McpError("mcp.error.incomplete")
      await run(async () => {
        await edit((current) => {
          if (current.some((record) => record.name === draft.name)) {
            throw new McpError("mcp.error.duplicate", { name: draft.name })
          }
          return upsert(current, {
            name: draft.name,
            declaration: draft.declaration,
            description: draft.description ?? "",
            tags: draft.tags ?? [],
          })
        })
      })
    },

    async adopt(ids) {
      await run(async () => {
        let refused = 0
        let added = 0
        await edit((current) => {
          let next = current
          for (const id of ids) {
            if (next.some((record) => record.name === id)) continue
            const declaration = rowOf(id).detail.declaration
            if (declaration === null) {
              refused += 1
              continue
            }
            /* The declaration is taken as the file wrote it, and the sentence
               the server publishes is left where it is: a record's own
               description is a person's words, not the server's. */
            next = upsert(next, { name: id, declaration, description: "", tags: [] })
            added += 1
          }
          return next
        })
        /* Nothing was taken in and something could not be read, so the person
           is told why rather than left with a button that appears to do nothing. */
        if (added === 0 && refused > 0) throw new McpError("mcp.error.incomplete")
      })
    },

    async update(id, patch) {
      const held = value.records.find((record) => record.name === id)
      const name = patch.name ?? id
      const declaration = patch.declaration ?? held?.declaration ?? rowOf(id).detail.declaration
      if (declaration === null || declarationOf(declaration) === null) {
        throw new McpError("mcp.error.incomplete")
      }
      if (name !== id && value.records.some((record) => record.name === name)) {
        throw new McpError("mcp.error.duplicate", { name })
      }
      await run(async () => {
        /* Rewriting the declaration is what a save means: it reaches every file
           that already holds this server, and a rename moves the key with it so
           no client is left pointing at a name the hub no longer uses. */
        for (const install of rowOf(id).detail.installs) {
          const { found, io } = providerAt(install.place)
          if (name !== id) await found.provider.uninstall(io, install.place, id)
          await found.provider.install(io, install.place, name, declaration)
        }

        await edit((current) => {
          if (name !== id && current.some((record) => record.name === name)) {
            throw new McpError("mcp.error.duplicate", { name })
          }
          return upsert(
            current.filter((record) => record.name !== id),
            {
              name,
              declaration,
              description: patch.description ?? held?.description ?? "",
              tags: patch.tags ?? held?.tags ?? [],
            }
          )
        })
      })
    },

    async remove(id) {
      await run(async () => {
        await edit((current) => {
          if (!current.some((record) => record.name === id)) {
            throw new McpError("mcp.error.noRecord", { name: id })
          }
          return current.filter((record) => record.name !== id)
        })
      })
    },

    async install(id, place) {
      await run(async () => {
        const declaration = rowOf(id).detail.declaration
        if (declaration === null) throw new McpError("mcp.error.incomplete")
        const { found, io } = providerAt(place)
        await found.provider.install(io, place, id, declaration)
      })
    },

    async uninstall(id, place) {
      await run(async () => {
        const { found, io } = providerAt(place)
        await found.provider.uninstall(io, place, id)
      })
    },

    async setEnabled(id, place, enabled) {
      await run(async () => {
        const { found, io } = providerAt(place)
        /* The place's own scope is what the switch is about: it is the root the
           person was looking at when they flipped it. */
        const { scope } = found.place
        if (!found.place.switchable || found.provider.setEnabled === undefined) {
          throw new McpError("mcp.error.selfManaged")
        }
        await found.provider.setEnabled(io, place, scope, id, enabled)
      })
    },

    async file(id, place) {
      const { found, io } = providerAt(place)
      const text = await files?.read(found.place)
      if (text === undefined || text === null) return null
      const lines =
        found.provider.locate === undefined
          ? null
          : ((await found.provider.locate(io, place, id)) ?? null)
      return { place, path: found.place.path, content: text, lines }
    },
  }
}

/** Whether a declaration says enough to be written into a file. */
function declarationOf(declaration: McpDeclaration): McpDeclaration | null {
  if (declaration.transport === "stdio") {
    return declaration.command.trim() === "" ? null : declaration
  }
  return declaration.url.trim() === "" ? null : declaration
}
