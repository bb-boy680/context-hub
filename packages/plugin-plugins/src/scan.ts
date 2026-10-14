/**
 * Asking every client what it holds, all at once, and keeping each answer on its
 * own.
 *
 * One client's command line says nothing about another's, so asking them in turn
 * only makes the page wait for the sum of them: a client whose program is slow —
 * or whose own timeout has to expire before it gives up — holds back every row
 * behind it. They are asked together instead.
 *
 * Together means one of them failing must not become the answer for all of them.
 * So each probe is settled where it is, and what a failing one carries back is
 * its own reason rather than a rejection: a client that is here but cannot be
 * read holds an unknown set of packs, which is not the same as holding none, and
 * only the reason tells the two apart. That is why this answers with a probe
 * rather than with the packs alone.
 *
 * Nothing here reaches a disk or a client: the installers and the toolkit that
 * runs a program arrive as arguments, which is what lets this run against stubs.
 */
import type { PluginHeld, PluginInstaller, PluginTools } from "./provider.ts"

/** One client's answer about the packs it holds, or why there is none. */
export interface ClientProbe {
  /** The installer that was asked, so a caller reads its id, label and scopes from one place. */
  readonly installer: PluginInstaller
  /**
   * Whether the agent is on this machine.
   *
   * False when it is not there — and also when that could not be established at
   * all, which `error` is what tells apart.
   */
  readonly available: boolean
  /** What the client holds; empty when it is absent, or when reading it failed. */
  readonly packs: readonly PluginHeld[]
  /**
   * Why this client could not be read, in its own words — absent when it
   * answered. A probe that failed and a client holding nothing look the same
   * everywhere else, and this is the field that separates them.
   */
  readonly error?: string
}

/** The message a thrown value carries. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Ask one client what it holds.
 *
 * The two questions are asked in order because the second needs the first: a
 * client that is not here has no list to read. Either one failing is that
 * client's own failure rather than the scan's, so neither is thrown on — the
 * reason travels back in the answer.
 *
 * @param installer — the client to ask.
 * @param tools — the toolkit it asks with.
 * @returns what it holds, or why that could not be read.
 */
async function probe(installer: PluginInstaller, tools: PluginTools): Promise<ClientProbe> {
  try {
    if (!(await installer.available(tools))) return { installer, available: false, packs: [] }
  } catch (error) {
    /* Whether the program is on this machine could not be established, so this
       client is not offered as a target — but having failed to look is not the
       same as having looked and not found it, and the reason is what says so. */
    return { installer, available: false, packs: [], error: messageOf(error) }
  }
  try {
    return { installer, available: true, packs: await installer.held(tools) }
  } catch (error) {
    /* The client is here and did not answer. What it holds is unknown, so it
       reads empty rather than gone, and its own words say why. */
    return { installer, available: true, packs: [], error: messageOf(error) }
  }
}

/**
 * Ask every client what it holds, all at once.
 *
 * @param installers — the registered installers, in the order they registered.
 * @param tools — the toolkit handed to each installer.
 * @returns one answer per installer, in the order they were given, with none
 * dropped: a client that failed answers with its reason.
 */
export function probeInstallers(
  installers: readonly PluginInstaller[],
  tools: PluginTools
): Promise<ClientProbe[]> {
  /* `probe` settles rather than throws, so this gathers every client: no
     rejection reaches here to cut the list short. */
  return Promise.all(installers.map((installer) => probe(installer, tools)))
}
