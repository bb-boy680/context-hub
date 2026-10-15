/**
 * The one service an agent plugin publishes into when it knows how that agent
 * installs a plugin.
 *
 * The plugins module owns the page, the library, the update checks and the
 * delivery bookkeeping; it does not know a single agent's command line. Each
 * agent extension knows exactly one agent — which program to call, which
 * subcommands deliver a pack, which scopes that agent has — and registers an
 * installer here, so adding an agent is a plugin rather than a case inside this
 * module.
 *
 * This is a service, not a contribution: a contribution carries data for the
 * screen to render, while an installer carries behaviour the module calls.
 */
import type { PackDescription, PluginInstallReport, PluginInstallScope } from "./contract.ts"

/** The service name the plugins module publishes and every agent plugin requires. */
export const PLUGIN_SERVICE = "plugins"

/**
 * What one installer call may reach.
 *
 * The agent's own command line is the installer's business; running it, and
 * knowing where the library is, are this module's. So an installer is handed
 * these rather than reaching for a disk or a process itself, which is also what
 * lets it be written once and drive every form of the app.
 */
export interface PluginTools {
  /**
   * The directory packs are collected into. Registering it with the agent is
   * what makes them installable, so an installer reads it rather than assuming
   * a path.
   */
  root(): Promise<string>
  /**
   * Write every marketplace index the library root carries. A caller does this
   * before registering the root, because an index that does not list a pack the
   * person just collected would make that pack invisible to the agent.
   */
  syncMarketplace(): Promise<void>
  /**
   * Run one console program with structured arguments.
   *
   * Arguments travel as a list, never as a shell string: nothing a person typed
   * is re-parsed, and a path with a space stays one argument.
   *
   * @returns what the program printed on standard output.
   * @throws {PluginInstallError} when it exits non-zero, with its own words.
   */
  run(program: string, args: readonly string[]): Promise<string>
  /**
   * Whether a program is on this machine.
   */
  has(program: string): Promise<boolean>
  /**
   * Read what a pack says about itself where it sits.
   *
   * An agent's own list names a pack and the folder it is in; what the pack
   * carries — its description and its picture — is written down in that folder,
   * and reading it is this hub's job rather than any one agent's. A directory
   * holding no manifest answers with empty fields rather than failing: a pack
   * may have none, and a row that says nothing is honest where an invented
   * sentence would not be.
   *
   * The picture it ships is copied into the hub's asset library and comes back
   * as a reference into it, so what a row draws is a file the hub holds.
   *
   * @param directory — the pack's directory, as the agent named it.
   * @param name — the pack's name, which its picture is kept under in the library.
   */
  describe(directory: string, name: string): Promise<PackDescription>
}

/**
 * One pack a client holds, whether or not this hub had anything to do with it.
 *
 * A client's own answer to "what is installed here" is the only source for the
 * packs this hub never delivered, which is what lets a person adopt them. Every
 * field is the client's own; which of these the hub delivered is the hub's own
 * question, answered by whether `marketplace` names its library.
 */
export interface PluginHeld {
  /** The pack's name: what the client lists it by, and the name this hub records it under. */
  name: string
  /** The client's full id, `<name>@<marketplace>`, which its own commands take back. */
  id: string
  version: string
  /** The place the client installed it at, in the client's own word — `user`, `project`, and so on. */
  scope: string
  /** Whether the client currently switches it on. */
  enabled: boolean
  /**
   * Whether the workspace in use switches it on.
   *
   * A second answer beside {@link enabled} because the two can disagree: an
   * agent keeps one switch per pack, and the repository standing in for a pack
   * its machine has switched on may have switched it off, which is the one this
   * hub may speak for and the one its row offers.
   */
  workspaceEnabled: boolean
  /** The marketplace it came from; `null` when the client names none. */
  marketplace: string | null
  /**
   * The directory the client loads the pack from — its own copy, or the folder
   * it reads in place — read as the source recording it would name: a directory
   * on this machine, which is what it is.
   */
  source?: { kind: "local"; path: string }
  /** What the pack says about itself there; the fields are empty when it carries no manifest. */
  pack: PackDescription
}

/**
 * One agent, as the plugins module uses it. Every method names a pack by its id
 * and works on that agent alone, so an installer never sees the library.
 */
export interface PluginInstaller {
  /** Stable id, unique across every installer; the page's menu is keyed by it. */
  readonly id: string
  /** The agent's name, as a menu row lists it. */
  readonly label: string
  /**
   * The scopes this agent installs into, in the order its own menu lists them.
   * An agent with no notion of scope declares the one it does have.
   */
  readonly scopes: readonly PluginInstallScope[]
  /** Whether the agent this installer drives is on this machine. */
  available(tools: PluginTools): Promise<boolean>
  /**
   * Every pack this client holds, including the ones this hub never delivered.
   *
   * Which of them came from this hub is not asked separately: it is the ones
   * whose `marketplace` names the hub's own library, and the caller is the side
   * that knows that name.
   */
  held(tools: PluginTools): Promise<PluginHeld[]>
  /** Deliver one pack to this agent at one scope, out of this hub's own library. */
  install(name: string, scope: PluginInstallScope, tools: PluginTools): Promise<PluginInstallReport>
  /**
   * Take one pack back out of this agent at that scope.
   *
   * The id is the agent's own — `<name>@<marketplace>`, as the agent itself
   * listed it — and not the pack's name. An agent holds packs this hub never
   * delivered, and each was installed from the marketplace that supplied it, so
   * naming this hub's own marketplace here would point at a copy that is not
   * there and the removal would fail.
   */
  remove(id: string, scope: PluginInstallScope, tools: PluginTools): Promise<PluginInstallReport>
  /**
   * Turn this agent's use of an installed pack on or off, without moving any
   * files.
   *
   * The id is the agent's own — `<name>@<marketplace>`, as the agent itself
   * listed it — for the same reason `remove` takes one: the pack may have come
   * from a marketplace this hub knows nothing about, and this hub's own name
   * would point at a copy that is not there.
   *
   * Absent for an agent that has no such switch, which is a fact about the agent
   * rather than a gap: the page offers the switch only where it exists.
   */
  setEnabled?(
    id: string,
    scope: PluginInstallScope,
    on: boolean,
    tools: PluginTools
  ): Promise<PluginInstallReport>
}

/** Where an agent extension registers how it installs plugins. */
export interface PluginInstallerRegistry {
  /** Every installer registered right now, in registration order. */
  installers(): readonly PluginInstaller[]
  /**
   * Add one installer.
   *
   * @returns a disposer that takes it back out; an installer registered inside a
   * plugin's `inject` callback is disposed with that callback.
   */
  register(installer: PluginInstaller): () => void
}

/** The service the plugins module publishes. */
export interface PluginService {
  readonly registry: PluginInstallerRegistry
  readonly tools: PluginTools
}

/**
 * The service this module publishes, added to the kernel's map of services a
 * plugin may require.
 *
 * The module that publishes a service is the module that types it: a plugin
 * requiring `plugins` reads `plugins.plugins` with this type, and a name no
 * module declared is a name no plugin can inject.
 */
declare module "@workspace/extensions" {
  interface ExtensionServices {
    /** This module's registry and toolkit; see {@link PluginService}. */
    plugins: PluginService
  }
}

/** Create the registry an agent extension registers into. */
export function createPluginInstallerRegistry(): PluginInstallerRegistry {
  const held: PluginInstaller[] = []
  return {
    installers: () => held,
    register(installer) {
      held.push(installer)
      return () => {
        const at = held.indexOf(installer)
        if (at !== -1) held.splice(at, 1)
      }
    },
  }
}

/** A delivery that failed, with what the program itself said. */
export class PluginInstallError extends Error {
  /** The program's own words, kept because they name the real cause. */
  readonly output: string

  /**
   * @param message — what failed, as one sentence.
   * @param output — the program's own output.
   */
  constructor(message: string, output = "") {
    super(message)
    this.name = "PluginInstallError"
    this.output = output
  }
}
