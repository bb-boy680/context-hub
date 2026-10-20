/**
 * The MCP page's one read of every client file, kept outside the page.
 *
 * The page used to read inside its own hook, so leaving it threw the rows away,
 * the probes it had started were abandoned with it, and nothing outside the page
 * could say what this hub had recorded. This holds the read instead: a form's
 * startup asks for it before anything is drawn, the page watches it, and every
 * answer — a scan, and a probe landing a second later — is published to whoever
 * is watching rather than kept in one component's state.
 *
 * It reads the form for what it needs by name — the client files, the records
 * file, the extension registry, the folder in use — so the same class runs
 * wherever the hub runs, and it renders the failures it reports because a probe
 * that fails while nobody is looking has no component to render it.
 */
import type { Context } from "@deepseek-ai/cordis"
import { Service } from "@deepseek-ai/cordis"
import { ServerIcon } from "lucide-react"

import type { ExtensionIcon } from "@context-hub/extensions"
import {
  chosenAgents,
  chosenProviders,
  createCatalog,
  mapLimit,
  type Catalog,
  type CatalogState,
  type Commit,
} from "@context-hub/extensions"

import {
  buildCatalog,
  placesOf,
  scanPlaces,
  type McpLog,
  type McpScan,
  type ScannedPlace,
} from "./catalog.ts"
import {
  McpError,
  failureText,
  mcpFailure,
  type McpDeclaration,
  type McpProvider,
} from "./contract.ts"
import {
  createRemoteProbe,
  probeAvailable,
  type McpCacheEntry,
  type McpProbePort,
  type McpProbeQuery,
  type McpProbeReport,
} from "./probe.ts"
import { createRemoteRecords, readRecords, type McpRecordsPort } from "./records.ts"
import type { McpCatalog, McpPlaceKind, McpRecord, McpServer } from "./types.ts"

/** How many probes run side by side; a stdio server takes seconds to answer. */
const PROBE_CONCURRENCY = 3

/** The name a form finds this under, and what says it is there. */
export const MCP_LIBRARY_SERVICE = "catalog.mcp"

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The MCP library's shared read; absent until this module is enabled. */
    "catalog.mcp"?: McpLibrary
  }
}

/** What has been read: every client file's answer, and the probes about it. */
export interface McpLibraryValue {
  /** The hub's own records, as its file holds them. */
  records: McpRecord[]
  /** What the last scan found, and when it ran; null before the first one. */
  scan: { answer: McpScan; at: number } | null
  /**
   * What the probe cache answered, by server name. A name the cache holds no
   * answer for is null until that server's own probe lands.
   */
  checks: Record<string, McpCacheEntry | null>
  /** Servers whose probe is running right now. */
  testing: readonly string[]
  /** Where the hub's own records live, as the host names it; empty until a
      read answers, which is the only thing that knows it. */
  recordsFile: string
  /** Whether a host answered for probes, which is what makes them worth offering. */
  canProbe: boolean
  /**
   * Why the last probe failed, as a sentence ready to show; null when none has.
   *
   * Probes run beside the read that asked for them rather than before it, so a
   * probe's failure is not the read's: the read has already answered, and the
   * rows it answered with are not wrong. This is where that failure travels,
   * and the next scan that lands is what clears it. A failure of the read
   * itself is the catalog's own and never appears here.
   */
  failure: string | null
}

/** The value nothing has answered with yet: no records, no scan, no probes. */
export const EMPTY_MCP_LIBRARY: McpLibraryValue = {
  records: [],
  scan: null,
  checks: {},
  testing: [],
  recordsFile: "",
  canProbe: false,
  failure: null,
}

/**
 * Read the records file through one port, naming its failure as this module's
 * own.
 *
 * The file is read rather than taken from a copy held elsewhere: another window
 * writes the same file, and a change built from a copy that missed that write
 * would drop what it never saw — which is why the write path reads it too.
 *
 * @param port — how this form reaches the file.
 * @param found — told the file's name when the host named one, so a read that
 *   cannot place the file leaves the name already on screen where it was.
 * @throws {McpError} `mcp.error.records`, carrying what the platform said.
 */
export async function loadRecords(
  port: McpRecordsPort,
  found: (file: string) => void
): Promise<McpRecord[]> {
  try {
    const answer = await port.read()
    if (answer.file !== "") found(answer.file)
    return readRecords(answer.document)
  } catch (error) {
    throw new McpError(
      "mcp.error.records",
      undefined,
      error instanceof Error ? error.message : String(error)
    )
  }
}

/**
 * The shared read of MCP state, and the probes that answer for it.
 *
 * It is a service rather than a plain value so that a form's startup can find it
 * by name and start it, the way it starts the services it provides itself — and
 * the base class is what puts it there: constructing one registers it under
 * {@link MCP_LIBRARY_SERVICE} for as long as the module stays loaded. Nothing
 * is read on the way in; the first `load()` is what asks.
 */
export class McpLibrary extends Service {
  private readonly catalog: Catalog<McpLibraryValue>
  private readonly port: McpProbePort = createRemoteProbe()
  private readonly records: McpRecordsPort = createRemoteRecords()
  /** Whether a host answers for probes; asked once, remembered for the session. */
  private availability: Promise<boolean> | null = null
  /**
   * One probe per server at a time.
   *
   * Two reads that overlap — the development build mounts twice, and a scan a
   * scope change reschedules runs beside the one it replaces — share a single
   * probe rather than starting a second one against the same server, and a
   * person asking for one now shares a probe already out.
   */
  private readonly probing = new Map<string, Promise<McpCacheEntry>>()
  /** Whether the read under way was asked to prove every server again. */
  private forced = false
  /**
   * What the last read was about: the folder in use, and the agents chosen.
   * Either one decides which files a scan reads, so the pair is what says
   * whether an announcement needs a read at all.
   */
  private seen: string
  /** The translator; a failure this read reports has no page to render it. */
  private readonly t = (key: string): string => this.ctx.i18n.t(key)
  /** One diagnostic line a provider wrote, passed through to the host. */
  private readonly log: McpLog = (level, message) => this.ctx.host.log(level, message)

  constructor(ctx: Context) {
    super(ctx, MCP_LIBRARY_SERVICE)
    this.catalog = createCatalog<McpLibraryValue>({
      initial: EMPTY_MCP_LIBRARY,
      read: (commit) => this.read(commit),
    })
    this.seen = this.key()

    /* Two things decide which files a scan reads, and each is a reason to read
       again: the extensions that describe places — an agent enabled while the
       page is open appears in it, one disabled leaves — and what the sidebar
       chose, which is the folder in use together with the agents this hub
       delivers to. Both are watched here rather than by the page, because the
       read outlives any page. */
    ctx.on("extensions/changed", () => {
      if (this.started) void this.catalog.reload()
    })
    ctx.get("hub.workspaces")?.subscribe(() => {
      const now = this.key()
      if (!this.started || now === this.seen) return
      /* Moved on before the read: a key that stays behind makes every later
         announcement look like a change, and each one a read of its own. */
      this.seen = now
      void this.catalog.reload()
    })
  }

  /**
   * What decides which files a read scans: the folder every workspace place
   * resolves inside, and the agents whose places are read at all.
   */
  private key(): string {
    const workspaces = this.ctx.get("hub.workspaces")
    const folder = workspaces?.current()?.current ?? ""
    return `${folder}\n${chosenAgents(workspaces).join(",")}`
  }

  /** The records port this library reads and writes through. */
  store(): McpRecordsPort {
    return this.records
  }

  state(): CatalogState<McpLibraryValue> {
    return this.catalog.state()
  }

  /**
   * The rows the page draws, built from what has been read so far.
   *
   * The page's hook used to be the only place this fold existed; the global
   * search needs the same rows, so it is published here rather than written a
   * second time with a different idea of what a server is. `null` means there
   * has not been a scan yet — not that the library is empty.
   */
  rows(): McpCatalog | null {
    const value = this.catalog.state().value
    if (value === null || value.scan === null) return null
    return buildCatalog(
      value.records,
      value.scan.answer,
      this.places(),
      [],
      value.scan.at,
      value.checks
    )
  }

  subscribe(listener: () => void): () => void {
    return this.catalog.subscribe(listener)
  }

  /**
   * Whether anyone has asked this to be read.
   *
   * Before that there is nothing to read *again*, and the noise of the kernel
   * still starting up — every extension activating emits a change — is not a
   * reason to read. A read then would scan for half the agents and start probes
   * for them, and be thrown away and done again the moment the last one
   * finished.
   */
  private started = false

  /** Read if nothing has been read. A form's startup does this before a page asks. */
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
   * Read again and prove every server again, cache and all.
   *
   * A cached answer is the answer: a server the cache holds one for waits for a
   * person, however its declaration or scope has moved since. Asking to check
   * the servers is that person asking, so this is the one read that runs them
   * all.
   */
  refresh(): Promise<void> {
    this.started = true
    this.forced = true
    return this.catalog.reload()
  }

  /**
   * Touch the read value up in place.
   *
   * A page that has just written the records file shows the rows it wrote
   * before the scan that confirms them lands; a page clearing the last probe
   * failure shows that too.
   */
  update(recipe: (draft: McpLibraryValue) => void): void {
    this.catalog.update(recipe)
  }

  /**
   * Prove one server now, and put the answer on its row.
   *
   * A server that cannot be reached is a result — the row says so — so this
   * throws only when no probe could be run at all, which is what the page
   * reports as a failure.
   *
   * @param target — the server, its declaration, and the scope to run it in.
   * @param names — every name the catalog holds, so the cache can drop the
   *   answers of servers that are gone.
   * @throws {McpError} `mcp.error.noProbe` when no host answers for probes.
   */
  async test(target: McpProbeQuery, names: readonly string[]): Promise<void> {
    this.update((draft) => {
      draft.failure = null
    })
    this.mark(target.name, true)
    try {
      if (!(await this.reachable())) throw new McpError("mcp.error.noProbe")
      const entry = await this.probeOnce(target, names)
      this.update((draft) => {
        draft.checks = { ...draft.checks, [target.name]: entry }
      })
    } finally {
      this.mark(target.name, false)
    }
  }

  /**
   * Prove a declaration the catalog does not hold yet, which the add dialog
   * uses to try one out. Nothing is kept: a draft has no name to keep an answer
   * under.
   *
   * @throws {McpError} `mcp.error.noProbe` when no host answers for probes.
   */
  async testDraft(declaration: McpDeclaration): Promise<McpProbeReport> {
    if (!(await this.reachable())) throw new McpError("mcp.error.noProbe")
    return this.port.probe({ declaration, scope: "workspace", save: false })
  }

  /**
   * Read the records file and every place's file through the provider that
   * described it, then bring the probe cache up to date.
   *
   * The list is published the moment it is read, and the probes run beside it
   * rather than before it: a server that takes seconds to wake up must not hold
   * up the rows. `commit` is bound to this read, so an answer that lands after
   * a newer read has started is dropped instead of written over a newer answer.
   *
   * @param commit — publish part of this read before the whole of it is ready.
   * @returns the whole answer, as this read left it.
   */
  private async read(commit: Commit<McpLibraryValue>): Promise<McpLibraryValue> {
    const files = this.ctx.host.files
    /* A form that reaches no client file has nothing to scan; the page says so
       rather than reporting a failure about a file nobody asked for. */
    if (files === null) return EMPTY_MCP_LIBRARY
    /* Which folder is in use decides what every workspace place holds, and the
       form answers that from its own copy: a scan that ran before its list
       arrived would read those places against nothing. */
    await this.ctx.get("hub.workspaces")?.refresh()

    const force = this.forced
    this.forced = false
    /* Probes belong to the read that asked for them; a newer read starts over. */
    commit((draft) => {
      draft.testing = []
    })

    let declared: McpRecord[]
    let answer: McpScan
    try {
      /* The records are read first: their failure names itself, while a scan of
         client files has its own sentence. */
      declared = await loadRecords(this.records, (file) => {
        commit((draft) => {
          draft.recordsFile = file
        })
      })
      answer = await scanPlaces(this.places(), files, this.log)
    } catch (error) {
      /* Thrown as the sentence the page reads: the catalog keeps the last
         answer and says what went wrong with the one that did not arrive. The
         cause travels with it, for whoever reads the log. */
      throw new Error(failureText(this.t, mcpFailure(error, "mcp.error.scan")), { cause: error })
    }

    const at = Date.now()
    /* The list is readable now; its probes run beside it, not before it. */
    commit((draft) => {
      draft.records = declared
      draft.scan = { answer, at }
      draft.failure = null
    })
    /* Nothing waits for the probes, so nothing is left to report an unexpected
       throw: it is an answer that did not arrive, and is reported as one rather
       than rejected into the console. */
    void this.probeAll(answer, at, force, declared, commit).catch((error: unknown) => {
      commit((draft) => {
        draft.failure = failureText(this.t, mcpFailure(error, "mcp.error.probe"))
      })
    })
    return this.catalog.state().value ?? EMPTY_MCP_LIBRARY
  }

  /**
   * Probe the servers one scan found. With `force` false the cache answers
   * first and only the servers it holds no answer for run; with it true every
   * server runs again, which is what a manual check means. Each answer lands on
   * its own row as it arrives, three probes at a time, so a server that takes
   * seconds to wake up never holds up the ones beside it.
   *
   * @param commit — this read's committer; a superseded read's answers are dropped.
   */
  private async probeAll(
    answer: McpScan,
    at: number,
    force: boolean,
    declared: readonly McpRecord[],
    commit: Commit<McpLibraryValue>
  ): Promise<void> {
    if (!(await this.reachable())) return
    const places = this.places()
    const servers = buildCatalog(declared, answer, places, [], at).servers
    const targets = probeTargets(servers, places)
    if (targets.length === 0) return
    const names = targets.map((target) => target.name)

    let known: Readonly<Record<string, McpCacheEntry | null>> | null = null
    if (!force) {
      try {
        known = await this.port.cache(names)
      } catch (error) {
        commit((draft) => {
          draft.failure = failureText(this.t, mcpFailure(error, "mcp.error.probe"))
        })
        return
      }
      commit((draft) => {
        draft.checks = { ...known }
      })
    }

    /* A cached answer is the answer: a server the cache holds one for waits for
       a person, however its declaration, scope or workspace has moved since.
       Only a server with no answer at all is probed on its own. */
    const queue = targets.filter((target) => force || known?.[target.name] === null)
    await mapLimit(PROBE_CONCURRENCY, queue, async (next) => {
      commit((draft) => {
        draft.testing = [...draft.testing, next.name]
      })
      try {
        const entry = await this.probeOnce(next, names)
        commit((draft) => {
          draft.checks = { ...draft.checks, [next.name]: entry }
        })
      } catch (error) {
        commit((draft) => {
          draft.failure = failureText(this.t, mcpFailure(error, "mcp.error.probe"))
        })
      } finally {
        commit((draft) => {
          draft.testing = draft.testing.filter((name) => name !== next.name)
        })
      }
    })
  }

  /**
   * One probe per server at a time, shared by everything that asks for it.
   *
   * The promise is held until it settles, so a second caller reaching the same
   * server while the first probe is out waits for that probe rather than
   * starting another one against it.
   */
  private probeOnce(target: McpProbeQuery, names: readonly string[]): Promise<McpCacheEntry> {
    const held = this.probing.get(target.name)
    if (held !== undefined) return held
    const running = this.port.probe({
      name: target.name,
      declaration: target.declaration,
      scope: target.scope,
      names,
      save: true,
    })
    this.probing.set(target.name, running)
    void running.then(
      () => this.probing.delete(target.name),
      () => this.probing.delete(target.name)
    )
    return running
  }

  /** Whether a host answers for probes; asked once, remembered for the session. */
  private async reachable(): Promise<boolean> {
    this.availability ??= probeAvailable()
    const ok = await this.availability
    if (ok) {
      this.update((draft) => {
        draft.canProbe = true
      })
    }
    return ok
  }

  /** Say one server is being probed right now, or that it is not. */
  private mark(name: string, on: boolean): void {
    this.update((draft) => {
      draft.testing = on
        ? [...draft.testing, name]
        : draft.testing.filter((held) => held !== name)
    })
  }

  /** The providers registered right now, read at call time rather than captured. */
  private providers(): readonly McpProvider[] {
    return this.ctx.get("mcp")?.providers() ?? []
  }

  /**
   * The places those providers describe, read at call time.
   *
   * A provider belongs to one agent, and the sidebar's choice says which agents
   * this hub works with: a client nobody chose has no file scanned, so nothing
   * of it is read, probed or offered as an install target.
   */
  private places(): ScannedPlace[] {
    const chosen = chosenAgents(this.ctx.get("hub.workspaces"))
    return placesOf(chosenProviders(this.providers(), chosen), (id) => this.icon(id))
  }

  /**
   * The mark of the extension that registered a provider.
   *
   * A place carries no mark of its own: it shows the icon its own extension
   * declares, which is the same one the catalog row draws. That mark lives on
   * the agent's target contribution — a provider id and its plugin's manifest id
   * need not match, so the manifest is not where to look.
   */
  private icon(id: string): ExtensionIcon {
    const targets = this.ctx.get("targets")?.placements() ?? []
    return targets.find((placement) => placement.value.id === id)?.value.icon ?? ServerIcon
  }
}

/**
 * The scope a server is probed under: the scope of the first place that holds
 * it, which is where its declaration came from. A server that only exists as a
 * record runs under the workspace.
 */
export function targetScope(server: McpServer, places: readonly ScannedPlace[]): McpPlaceKind {
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
