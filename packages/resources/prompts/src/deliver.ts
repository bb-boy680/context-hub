/**
 * The things a prompt can be delivered as.
 *
 * All of them write into a client's own files, so all of them go through the
 * place files port — the one seam that owns both roots and refuses a path that
 * climbs out of them. Nothing here touches a disk, which is what makes the
 * whole set checkable without one.
 *
 * Three of the four write one file named after the prompt; the fourth appends a
 * section to a file the person also edits. That difference is why they are
 * named here rather than offered as one action with options: a generated file
 * can be taken back by deleting it, and a section is removed by its own marker.
 */
import type { PlaceFiles, PlaceRef } from "@context-hub/core/place-files"

import { commandFile } from "./command-file.ts"
import { withSection, withoutSection } from "./instruction.ts"
import { slugOf } from "./slug.ts"
import type { PromptPlace } from "./provider.ts"
import type { Prompt } from "./store.ts"

/** What one delivery turns a prompt into. */
export type Delivery = "commands" | "rule" | "agent" | "instructions"

/**
 * The root a place's generated files sit under.
 *
 * A place names directories inside one root — `.agents/commands`,
 * `.agents/rules` — and the root is what a person recognises when the place has
 * no name of its own.
 */
export function generatedUnder(place: PromptPlace): string {
  const parts = place.commandDir.split("/")
  return parts.length > 1 ? parts.slice(0, -1).join("/") : place.commandDir
}

/**
 * The file one delivery writes.
 *
 * @param place — the agent place it goes to.
 * @param prompt — the prompt being delivered.
 * @param action — which of the four.
 * @param document — which of the place's files to add to; required by, and only
 * read by, `instructions`.
 * @throws when the action adds to a document and the place declares no such one
 * — the menu does not offer that row, so reaching it means a caller made the
 * action up.
 */
export function targetOf(
  place: PromptPlace,
  prompt: Prompt,
  action: Delivery,
  document?: string
): PlaceRef {
  if (action === "instructions") {
    const target = place.documents?.find((one) => one.id === document)
    if (target === undefined) {
      throw new Error(`${place.id} has no ${document ?? "instruction"} file to add to`)
    }
    return { scope: place.scope, file: target.file }
  }
  if (action === "agent") {
    if (place.agentDir === undefined) {
      throw new Error(`${place.id} has no agents directory`)
    }
    return { scope: place.scope, file: `${place.agentDir}/${slugOf(prompt.name)}.md` }
  }
  const dir = action === "rule" ? place.ruleDir : place.commandDir
  return { scope: place.scope, file: `${dir}/${slugOf(prompt.name)}.md` }
}

/** Whether one delivery is already in place, read from the file it writes. */
export async function delivered(
  files: PlaceFiles,
  place: PromptPlace,
  prompt: Prompt,
  action: Delivery,
  document?: string
): Promise<boolean> {
  let ref: PlaceRef
  try {
    ref = targetOf(place, prompt, action, document)
  } catch {
    /* An action this place cannot take is not one it has taken. */
    return false
  }
  const text = await files.read(ref)
  if (text === null) return false
  /* A command is its own file, so the file being there is the whole answer. A
     document holds everything the person wrote, so the answer is whether this
     prompt's section is among it. */
  if (action !== "instructions") return true
  return text.includes(`<!-- context-hub:${slugOf(prompt.name)} -->`)
}

/** The text one delivery puts in the file it writes. */
function textOf(prompt: Prompt, action: Delivery, existing: string | null): string {
  if (action === "instructions") {
    return withSection(existing, {
      slug: slugOf(prompt.name),
      title: prompt.name,
      body: prompt.prompt,
    })
  }
  return commandFile({
    name: prompt.name,
    description: prompt.description,
    body: prompt.prompt,
    /* A generated command and an agents file carry the block an agent reads a
       name and a description out of; a rule is the prompt as it was written. */
    frontmatter: action === "commands" || action === "agent",
  })
}

/**
 * Carry out one delivery.
 *
 * @param files — the form's place files port.
 * @param place — the agent place it goes to.
 * @param prompt — the prompt being delivered.
 * @param action — which of the four.
 * @param document — which of the place's files to add to; `instructions` only.
 */
export async function deliver(
  files: PlaceFiles,
  place: PromptPlace,
  prompt: Prompt,
  action: Delivery,
  document?: string
): Promise<void> {
  const ref = targetOf(place, prompt, action, document)
  /* The read is what makes a document additive: the section goes into what is
     already there rather than replacing it. It is also what makes the write
     safe — a whole-file write is the only kind this port has. */
  const existing = await files.read(ref)
  await files.write(ref, textOf(prompt, action, existing))
}

/**
 * Take one delivery back.
 *
 * @returns whether anything was there to take back.
 * @throws when asked to take back a document's section and the place declares
 * no such document.
 */
export async function undeliver(
  files: PlaceFiles,
  place: PromptPlace,
  prompt: Prompt,
  action: Delivery,
  document?: string
): Promise<boolean> {
  const ref = targetOf(place, prompt, action, document)
  if (action === "instructions") {
    const existing = await files.read(ref)
    if (existing === null) return false
    const next = withoutSection(existing, slugOf(prompt.name))
    if (next === null) return false
    /* A file whose whole content was this section is a file the hub made; an
       empty one left behind would still read as "the prompt is here". */
    if (next.trim() === "") await files.remove(ref)
    else await files.write(ref, next)
    return true
  }
  if ((await files.read(ref)) === null) return false
  await files.remove(ref)
  return true
}

/**
 * What one place already holds of one prompt.
 *
 * Nothing records a delivery, so this is read from the files each time: a file
 * with the prompt's name in a place's directory is the whole answer.
 */
export interface Held {
  readonly commands: boolean
  readonly rule: boolean
  readonly agent: boolean
  /** The ids of the documents whose section is in the file. */
  readonly documents: readonly string[]
}

/** A place that holds none of it. */
export const NOTHING_HELD: Held = {
  commands: false,
  rule: false,
  agent: false,
  documents: [],
}

/** Whether a place holds anything at all, including a place with no answer yet. */
export function holdsSomething(held: Held | undefined): boolean {
  return (
    held !== undefined &&
    (held.commands || held.rule || held.agent || held.documents.length > 0)
  )
}

/**
 * Read what one place holds of one prompt, from the files themselves.
 *
 * @throws when a place names a file the port refuses; the caller decides what
 * an unreadable place means.
 */
export async function heldAt(
  files: PlaceFiles,
  place: PromptPlace,
  prompt: Prompt
): Promise<Held> {
  const documents = place.documents ?? []
  const [commands, rule, agent, sections] = await Promise.all([
    delivered(files, place, prompt, "commands"),
    delivered(files, place, prompt, "rule"),
    place.agentDir === undefined ? false : delivered(files, place, prompt, "agent"),
    Promise.all(
      documents.map(
        async (one) =>
          [one.id, await delivered(files, place, prompt, "instructions", one.id)] as const
      )
    ),
  ])
  return {
    commands,
    rule,
    agent,
    documents: sections.filter(([, there]) => there).map(([id]) => id),
  }
}

/** One agent that holds a prompt, as its mark. */
export interface HeldMark {
  /** The agent's id: two scopes of one agent are one mark. */
  readonly id: string
  readonly icon: PromptPlace["icon"]
  /** The labels of the places that hold it, joined the way a title reads. */
  readonly label: string
}

/**
 * The marks for the agents holding one prompt.
 *
 * A place is one agent under one root, and a row of marks answers "which
 * agents", not "which files": the workspace and machine-wide places of one
 * agent share an icon and a name, so they share a mark.
 *
 * @param places — every place a delivery can go to, in reading order.
 * @param holds — what each place holds, keyed by place id.
 * @param labelOf — a place's name in the active locale.
 */
export function heldMarks(
  places: readonly PromptPlace[],
  holds: Readonly<Record<string, Held>>,
  labelOf: (place: PromptPlace) => string
): HeldMark[] {
  const marks = new Map<string, { icon: PromptPlace["icon"]; labels: string[] }>()
  for (const place of places) {
    if (!holdsSomething(holds[place.id])) continue
    const seen = marks.get(place.agent)
    if (seen === undefined) {
      marks.set(place.agent, { icon: place.icon, labels: [labelOf(place)] })
      continue
    }
    const label = labelOf(place)
    if (!seen.labels.includes(label)) seen.labels.push(label)
  }
  return [...marks].map(([id, mark]) => ({
    id,
    icon: mark.icon,
    label: mark.labels.join(" · "),
  }))
}
