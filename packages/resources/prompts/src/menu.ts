/**
 * One place's menu, as data: which entries it offers and which of them the
 * files already hold.
 *
 * A provider declares its forms, so the page cannot enumerate them. This is the
 * one place that turns a declaration and a held answer into rows, which is also
 * what makes the menu checkable without a browser.
 */
import type { PromptHeld, PromptPlace } from "./provider.ts"

/** One row of a place's menu. */
export interface PromptMenuEntry {
  /** The held key: the form's id, or `${form}:${option}`. */
  readonly key: string
  readonly labelKey: string
  /** The word for taking this entry back, where the provider names one. */
  readonly removeLabelKey?: string
  /** Whether the files already hold this entry. */
  readonly held: boolean
  /** The form `install` or `remove` is called with. */
  readonly form: string
  /** The option `install` or `remove` is called with, where the form has them. */
  readonly option?: string
}

/** One form's entries; a form with options also carries the heading over them. */
export interface PromptMenuGroup {
  readonly id: string
  /** The heading, present only for a form that groups options. */
  readonly labelKey?: string
  readonly entries: readonly PromptMenuEntry[]
}

/**
 * Every entry one place offers, in declaration order.
 *
 * A form without options is one row held under the form's own id. A form with
 * options is a heading and one row per option held under `form:option` — the
 * form's own flag means nothing there, so it is not read.
 */
export function promptMenu(place: PromptPlace, held: PromptHeld): PromptMenuGroup[] {
  return place.forms.map((form) => {
    if (form.options === undefined || form.options.length === 0) {
      return {
        id: form.id,
        entries: [
          {
            key: form.id,
            labelKey: form.labelKey,
            ...(form.removeLabelKey === undefined
              ? {}
              : { removeLabelKey: form.removeLabelKey }),
            held: held[form.id] === true,
            form: form.id,
          },
        ],
      }
    }
    return {
      id: form.id,
      labelKey: form.labelKey,
      entries: form.options.map((option) => {
        const key = `${form.id}:${option.id}`
        return {
          key,
          labelKey: option.labelKey,
          ...(option.removeLabelKey === undefined
            ? {}
            : { removeLabelKey: option.removeLabelKey }),
          held: held[key] === true,
          form: form.id,
          option: option.id,
        }
      }),
    }
  })
}
