/**
 * The four things a prompt can be delivered as.
 *
 * All of them write into a client's own files, so all of them go through the
 * place files port — the one seam that owns both roots and refuses a path that
 * climbs out of them. Nothing here touches a disk, which is what makes the
 * whole set checkable without one.
 *
 * Three of the four write one file named after the prompt; the fourth appends a
 * section to a file the person also edits. That difference is why they are
 * named here rather than offered as one action with options: an install can be
 * taken back by deleting a file, and a section cannot.
 */
import type { PlaceFiles, PlaceRef } from "@workspace/core/place-files"

import { commandFile } from "./command-file.ts"
import { withSection } from "./instruction.ts"
import { slugOf } from "./slug.ts"
import type { PromptPlace } from "./provider.ts"
import type { Prompt } from "./store.ts"

/** What one delivery turns a prompt into. */
export type Delivery = "install" | "commands" | "rule" | "instructions"

/**
 * The file one delivery writes.
 *
 * @param place — the agent place it goes to.
 * @param prompt — the prompt being delivered.
 * @param action — which of the four.
 * @throws when the action writes an instruction file and the place declares
 * none — the menu does not offer that row, so reaching it means a caller made
 * the action up.
 */
export function targetOf(
  place: PromptPlace,
  prompt: Prompt,
  action: Delivery
): PlaceRef {
  const file = slugOf(prompt.description)
  if (action === "instructions") {
    if (place.instructionFile === undefined) {
      throw new Error(`${place.id} reads no instruction file`)
    }
    return { scope: place.scope, file: place.instructionFile }
  }
  const dir = action === "rule" ? place.ruleDir : place.commandDir
  return { scope: place.scope, file: `${dir}/${file}.md` }
}

/** Whether one delivery is already in place, read from the file it writes. */
export async function delivered(
  files: PlaceFiles,
  place: PromptPlace,
  prompt: Prompt,
  action: Delivery
): Promise<boolean> {
  let ref: PlaceRef
  try {
    ref = targetOf(place, prompt, action)
  } catch {
    /* An action this place cannot take is not one it has taken. */
    return false
  }
  const text = await files.read(ref)
  if (text === null) return false
  /* A command is its own file, so the file being there is the whole answer. An
     instruction file holds everything the person wrote, so the answer is
     whether this prompt's section is among it. */
  if (action !== "instructions") return true
  return text.includes(`<!-- context-hub:${slugOf(prompt.description)} -->`)
}

/** The text one delivery puts in the file it writes. */
function textOf(prompt: Prompt, action: Delivery, existing: string | null): string {
  if (action === "instructions") {
    return withSection(existing, {
      slug: slugOf(prompt.description),
      title: prompt.description,
      body: prompt.prompt,
    })
  }
  return commandFile({
    name: prompt.description,
    body: prompt.prompt,
    /* Only a generated command carries the block an agent reads its name and
       description out of; an install is the prompt as it was written. */
    frontmatter: action === "commands",
  })
}

/**
 * Carry out one delivery.
 *
 * @param files — the form's place files port.
 * @param place — the agent place it goes to.
 * @param prompt — the prompt being delivered.
 * @param action — which of the four.
 */
export async function deliver(
  files: PlaceFiles,
  place: PromptPlace,
  prompt: Prompt,
  action: Delivery
): Promise<void> {
  const ref = targetOf(place, prompt, action)
  /* The read is what makes an instruction file additive: the section goes into
     what is already there rather than replacing it. It is also what makes the
     write safe — a whole-file write is the only kind this port has. */
  const existing = await files.read(ref)
  await files.write(ref, textOf(prompt, action, existing))
}

/**
 * Take one delivery back.
 *
 * @returns whether anything was there to take back.
 * @throws when asked to take back an instruction-file section: that file holds
 * the person's own text too, and removing a section from it is an edit this
 * action does not have in hand.
 */
export async function undeliver(
  files: PlaceFiles,
  place: PromptPlace,
  prompt: Prompt,
  action: Delivery
): Promise<boolean> {
  if (action === "instructions") {
    throw new Error("an instruction file's section is not removed from here")
  }
  const ref = targetOf(place, prompt, action)
  if ((await files.read(ref)) === null) return false
  await files.remove(ref)
  return true
}
