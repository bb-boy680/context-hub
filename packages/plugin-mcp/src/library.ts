/**
 * The page's one read of MCP state, and every action that changes it.
 *
 * The module owns the records and the screen; each agent extension owns one
 * client's file. This hook is where the two meet: it asks the registry for the
 * places, reads every file through the provider that described it, merges the
 * answer with the records, and routes each action to the provider whose place
 * it names.
 *
 * Failures arrive as message keys and leave as sentences, so a client's own
 * wording never reaches the screen untranslated.
 */
import * as React from "react"
import { ServerIcon } from "lucide-react"

import type { ExtensionIcon } from "@workspace/extensions"
import type {
  McpDeclaration,
  McpFailure,
  McpIo,
  McpProvider,
  McpService,
} from "./contract.ts"
import { McpError, mcpFailure } from "./contract.ts"
import { createRemoteProbe, probeAvailable, type McpCacheEntry, type McpProbeQuery, type McpProbeReport } from "./probe.ts"
import { useExtensionSnapshot, useHub, useI18n } from "@workspace/extensions/react"

import {
  RECORDS_KEY,
  buildCatalog,
  placesOf,
  readRecords,
  scanPlaces,
  upsert,
  type McpLog,
  type McpScan,
  type ScannedPlace,
} from "./catalog.ts"
import type {
  McpAgentPlace,
  McpCatalog,
  McpConfigFile,
  McpDraft,
  McpPatch,
  McpPlaceKind,
  McpRecord,
  McpScanProblem,
  McpServer,
  McpTag,
} from "./types.ts"

/** How many probes run side by side; a stdio server takes seconds to answer. */
const PROBE_CONCURRENCY = 3

/** Every tag a server may carry; the first is the row's "any tag" chip. */
export const MCP_TAGS: readonly string[] = [
  "all",
  "vcs",
  "browser",
  "files",
  "database",
  "messaging",
  "projects",
  "observability",
  "docs",
]

/** The tag chips, with their labels resolved for the active language. */
export function tagList(t: (key: string) => string): McpTag[] {
  return MCP_TAGS.map((id) => ({ id, label: t(`mcp.tag.${id}`) }))
}

/** The sentence one failure reads as: its key resolved, its placeholders filled. */
export function failureText(t: (key: string) => string, failure: McpFailure): string {
  let text = t(failure.key)
  for (const [name, value] of Object.entries(failure.params ?? {})) {
    text = text.replace(`{${name}}`, value)
  }
  return text
}

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

/** Read and write MCP state for the form in use. */
export function useMcpLibrary(): McpLibrary {
  const ctx = useHub()
  const { t } = useI18n()
  const snapshot = useExtensionSnapshot()
  const revision = snapshot.revision
  const service = React.useMemo(() => ctx.get("mcp") ?? null, [ctx])
  const files = ctx.host.files

  /* A place carries no mark of its own: it shows the icon its own extension
     declares, which is the same one the catalog row draws. */
  const iconFor = React.useCallback(
    (id: string): ExtensionIcon =>
      snapshot.entries.find((entry) => entry.manifest.id === id)?.manifest.icon ?? ServerIcon,
    [snapshot]
  )

  /* Which providers exist is what a scan follows: an extension being enabled or
     disabled changes it, and the snapshot's revision is what says so. */
  const providers = React.useMemo(() => {
    void revision
    return service?.registry.providers() ?? []
  }, [service, revision])
  const places = React.useMemo(
    () => placesOf(providers, iconFor).map((entry) => entry.place),
    [providers, iconFor]
  )
  const placeKey = places.map((place) => place.id).join("|")
  const [records, setRecords] = React.useState<McpRecord[]>(() =>
    readRecords(ctx.host.storage.read(RECORDS_KEY))
  )
  /* The scan and the moment it ran travel together: the page says how long ago
     it checked, and both are replaced by the same read. */
  const [scan, setScan] = React.useState<{ answer: McpScan; at: number } | null>(null)
  /* What the probe cache answered, by server name; a name the cache cannot
     answer for is null until its own probe lands. */
  const [checks, setChecks] = React.useState<Record<string, McpCacheEntry | null>>({})
  const [testing, setTesting] = React.useState<readonly string[]>([])
  const [canProbe, setCanProbe] = React.useState(false)
  const [busy, setBusy] = React.useState(files !== null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const generation = React.useRef(0)
  const availability = React.useRef<Promise<boolean> | null>(null)
  const probing = React.useRef(new Map<string, Promise<McpCacheEntry>>())
  const port = React.useMemo(() => createRemoteProbe(), [])

  /** Whether a host answers for probes; asked once, remembered for the session. */
  const reachable = React.useCallback(async (): Promise<boolean> => {
    availability.current ??= probeAvailable()
    const ok = await availability.current
    if (ok) setCanProbe(true)
    return ok
  }, [])

  /**
   * One probe per server at a time. Two reads that overlap — the development
   * build mounts its effects twice, and a scope change reschedules one — share
   * a single probe instead of starting a second one against the same server.
   */
  const probeOnce = React.useCallback(
    (target: McpProbeQuery, names: readonly string[]): Promise<McpCacheEntry> => {
      const held = probing.current.get(target.name)
      if (held !== undefined) return held
      const running = port.probe({
        name: target.name,
        declaration: target.declaration,
        scope: target.scope,
        names,
        save: true,
      })
      probing.current.set(target.name, running)
      void running.then(
        () => probing.current.delete(target.name),
        () => probing.current.delete(target.name)
      )
      return running
    },
    [port]
  )

  const log = React.useCallback<McpLog>(
    (level, message) => {
      ctx.host.log(level, message)
    },
    [ctx]
  )

  /**
   * Probe the servers one scan found. With `force` false the cache answers
   * first and only the misses run; with it true every server runs again, which
   * is what a manual check means. Each answer lands on its own row as it
   * arrives, three probes at a time, so a server that takes seconds to wake up
   * never holds up the ones beside it.
   */
  const probeAll = React.useCallback(
    async (answer: McpScan, at: number, force: boolean, current: number) => {
      if (!(await reachable())) return
      if (current !== generation.current) return
      const places = currentPlaces(service, iconFor)
      /* The records are read from the store rather than from state: this runs
         inside a callback that must not be rebuilt every time they change. */
      const servers = buildCatalog(
        readRecords(ctx.host.storage.read(RECORDS_KEY)),
        answer,
        places,
        [],
        at
      ).servers
      const targets = probeTargets(servers, places)
      if (targets.length === 0) return
      const names = targets.map((target) => target.name)

      let known: Readonly<Record<string, McpCacheEntry | null>> | null = null
      if (!force) {
        try {
          known = await port.cache(targets)
        } catch (error) {
          setFailure(failureText(t, mcpFailure(error, "mcp.error.probe")))
          return
        }
        if (current !== generation.current) return
        setChecks({ ...known })
      }

      const queue = targets.filter((target) => force || known?.[target.name] === null)
      const worker = async (): Promise<void> => {
        for (;;) {
          /* A newer scan owns the screen from here on; it starts its own run. */
          if (current !== generation.current) return
          const next = queue.shift()
          if (next === undefined) return
          setTesting((all) => [...all, next.name])
          try {
            const entry = await probeOnce(next, names)
            if (current !== generation.current) return
            setChecks((all) => ({ ...all, [next.name]: entry }))
          } catch (error) {
            if (current !== generation.current) return
            setFailure(failureText(t, mcpFailure(error, "mcp.error.probe")))
          } finally {
            if (current === generation.current) {
              setTesting((all) => all.filter((name) => name !== next.name))
            }
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(PROBE_CONCURRENCY, queue.length) }, worker)
      )
    },
    [service, iconFor, ctx, port, probeOnce, reachable, t]
  )

  /**
   * Read every place's file through the provider that described it, then bring
   * the probe cache up to date: a server whose answer no longer applies is
   * probed once, and one the cache still answers for waits for a person.
   */
  const read = React.useCallback(
    async (force = false) => {
      if (files === null) return
      /* Which places exist is a reload key: it decides what the scan reads. */
      void placeKey
      const current = ++generation.current
      /* Probes belong to the scan that asked for them; a new one starts over. */
      setTesting([])
      try {
        const answer = await scanPlaces(currentPlaces(service, iconFor), files, log)
        /* A slower earlier scan must not overwrite a newer one. */
        if (current !== generation.current) return
        const at = Date.now()
        setScan({ answer, at })
        setFailure(null)
        /* The list is readable now; its probes run beside it, not before it. */
        setBusy(false)
        await probeAll(answer, at, force, current)
      } catch (error) {
        if (current !== generation.current) return
        setFailure(failureText(t, mcpFailure(error, "mcp.error.scan")))
      } finally {
        if (current === generation.current) setBusy(false)
      }
    },
    [service, iconFor, placeKey, files, log, t, probeAll]
  )

  React.useEffect(() => {
    /* Deferred a microtask: the scan's state change belongs to the read that
       follows, and the linter only sees the call itself. */
    queueMicrotask(() => void read())
  }, [read])

  const catalog = React.useMemo(() => {
    if (scan === null) return null
    /* The revision is a reload key too: a provider appearing decides the places. */
    void revision
    const problems: McpScanProblem[] = scan.answer.problems.map((problem) => ({
      place: problem.place,
      message: failureText(t, problem.failure),
    }))
    return buildCatalog(
      records,
      scan.answer,
      placesOf(currentProviders(service), iconFor),
      problems,
      scan.at,
      checks
    )
  }, [scan, records, service, revision, iconFor, t, checks])

  /** Save the records and hand them to the form's own state store. */
  const keep = React.useCallback(
    (next: McpRecord[]) => {
      setRecords(next)
      ctx.host.storage.write(RECORDS_KEY, next)
    },
    [ctx]
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
      const found = placesOf(currentProviders(service), iconFor).find(
        (entry) => entry.place.id === place
      )
      if (found === undefined) throw new McpError("mcp.error.unknownPlace", { place })
      if (files === null) throw new McpError("mcp.error.noFiles")
      return { found, io: { files, log } }
    },
    [service, iconFor, files, log]
  )
  /** Run one change, then read every file again. `force` re-probes as well. */
  const run = React.useCallback(
    async (action: () => Promise<void>, force = false) => {
      setBusy(true)
      setFailure(null)
      try {
        await action()
        await read(force)
      } catch (error) {
        setFailure(failureText(t, mcpFailure(error, "mcp.error.action")))
      } finally {
        setBusy(false)
      }
    },
    [read, t]
  )

  return {
    available: files !== null,
    canProbe,
    busy,
    failure,
    catalog,
    places,
    testing,

    async refresh() {
      await run(async () => undefined, true)
    },

    async test(id) {
      /* A probe that cannot reach the server is a result, so only a call that
         never got to run one is a failure here. */
      setFailure(null)
      setTesting((all) => [...all, id])
      try {
        const server = rowOf(id)
        const declaration = server.detail.declaration
        if (declaration === null) throw new McpError("mcp.error.incomplete")
        if (!(await reachable())) throw new McpError("mcp.error.noProbe")
        const entry = await probeOnce(
          {
            name: id,
            declaration,
            scope: targetScope(server, currentPlaces(service, iconFor)),
          },
          (catalog?.servers ?? []).map((held) => held.id)
        )
        setChecks((all) => ({ ...all, [id]: entry }))
      } catch (error) {
        setFailure(failureText(t, mcpFailure(error, "mcp.error.probe")))
      } finally {
        setTesting((all) => all.filter((name) => name !== id))
      }
    },

    async testDraft(declaration) {
      if (!(await reachable())) throw new McpError("mcp.error.noProbe")
      return port.probe({ declaration, scope: "workspace", save: false })
    },

    async create(draft) {
      await run(async () => {
        if (records.some((record) => record.name === draft.name)) {
          throw new McpError("mcp.error.duplicate", { name: draft.name })
        }
        if (declarationOf(draft.declaration) === null) throw new McpError("mcp.error.incomplete")
        keep(
          upsert(records, {
            name: draft.name,
            declaration: draft.declaration,
            description: draft.description ?? "",
            tags: draft.tags ?? [],
          })
        )
      })
    },

    async update(id, patch) {
      await run(async () => {
        const held = records.find((record) => record.name === id)
        const name = patch.name ?? id
        const declaration = patch.declaration ?? held?.declaration ?? rowOf(id).detail.declaration
        if (declaration === null || declarationOf(declaration) === null) {
          throw new McpError("mcp.error.incomplete")
        }
        if (name !== id && records.some((record) => record.name === name)) {
          throw new McpError("mcp.error.duplicate", { name })
        }

        /* Rewriting the declaration is what a save means: it reaches every file
           that already holds this server, and a rename moves the key with it so
           no client is left pointing at a name the hub no longer uses. */
        for (const install of rowOf(id).detail.installs) {
          const { found, io } = providerAt(install.place)
          if (name !== id) await found.provider.uninstall(io, install.place, id)
          await found.provider.install(io, install.place, name, declaration)
        }

        keep(
          upsert(
            records.filter((record) => record.name !== id),
            {
              name,
              declaration,
              description: patch.description ?? held?.description ?? "",
              tags: patch.tags ?? held?.tags ?? [],
            }
          )
        )
      })
    },

    async remove(id) {
      await run(async () => {
        if (!records.some((record) => record.name === id)) {
          throw new McpError("mcp.error.noRecord", { name: id })
        }
        keep(records.filter((record) => record.name !== id))
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
        if (found.provider.setEnabled === undefined) throw new McpError("mcp.error.selfManaged")
        await found.provider.setEnabled(io, place, id, enabled)
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

/** The providers registered right now, read at call time rather than captured. */
function currentProviders(service: McpService | null): readonly McpProvider[] {
  return service?.registry.providers() ?? []
}

/** The places those providers describe, read at call time. */
function currentPlaces(service: McpService | null, iconFor: (id: string) => ExtensionIcon): ScannedPlace[] {
  return placesOf(currentProviders(service), iconFor)
}

/**
 * The scope a server is probed under: the scope of the first place that holds
 * it, which is where its declaration came from. A server that only exists as a
 * record runs under the workspace.
 */
function targetScope(server: McpServer, places: readonly ScannedPlace[]): McpPlaceKind {
  const held = server.detail.installs.find((install) => install.installed)
  return places.find((entry) => entry.place.id === held?.place)?.place.scope ?? "workspace"
}

/** What a probe would run for each row. Rows with no readable declaration are left out. */
function probeTargets(
  servers: readonly McpServer[],
  places: readonly ScannedPlace[]
): McpProbeQuery[] {
  const targets: McpProbeQuery[] = []
  for (const server of servers) {
    const declaration = server.detail.declaration
    if (declaration === null) continue
    targets.push({ name: server.id, declaration, scope: targetScope(server, places) })
  }
  return targets
}

/** Whether a declaration says enough to be written into a file. */
function declarationOf(declaration: McpDeclaration): McpDeclaration | null {
  if (declaration.transport === "stdio") {
    return declaration.command.trim() === "" ? null : declaration
  }
  return declaration.url.trim() === "" ? null : declaration
}
