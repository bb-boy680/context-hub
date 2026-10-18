/**
 * The variable library as one shared read, rather than one read per visit to
 * the page.
 *
 * The page used to create its own store and read on mount, so leaving it threw
 * the document away, coming back read it again, and nothing outside the page
 * could see the names a global search should find. This holds the read instead:
 * the page asks for it, the form's startup starts it before anything is drawn,
 * and everyone who draws a variable watches the same answer.
 *
 * A write still goes through the store — the host owns the files — but its
 * answer is the whole next document, so it is published here instead of being
 * read back. `remember` is that step; a form whose catalog has not answered yet
 * reloads instead, because there is no value to update in place.
 */
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"

import { createCatalog, type Catalog, type CatalogState } from "@context-hub/extensions"

import type {
  VariableDocument,
  VariableDraft,
  VariablePatch,
  VariableStore,
} from "./store.ts"

/** The name a form finds this under, and what says it is there. */
export const VARIABLE_LIBRARY_SERVICE = "catalog.variables"

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The variable library's shared read; absent until this module is enabled. */
    "catalog.variables"?: VariableLibrary
    /** The form-owned library; absent when this form cannot reach one. */
    "hub.variables"?: VariableStore
  }
}

/** What has been read: the whole library, which is what the page draws. */
export interface VariableLibraryValue {
  /** The library, or `null` before a read and when this form has none. */
  document: VariableDocument | null
}

/** Nothing read yet, and the answer for a form that has no library. */
export const NOTHING_READ: VariableLibraryValue = { document: null }

/**
 * The shared read of the variable library.
 *
 * It is a service rather than a plain value so a form's startup can find it by
 * name and start it, the way it starts the services it provides itself — and
 * the base class is what puts it there: constructing one registers it under
 * {@link VARIABLE_LIBRARY_SERVICE} for as long as the module stays loaded.
 * Nothing is read on the way in; the first `load()` is what asks.
 */
export class VariableLibrary extends Service {
  private readonly catalog: Catalog<VariableLibraryValue>

  constructor(ctx: Context) {
    super(ctx, VARIABLE_LIBRARY_SERVICE)
    this.catalog = createCatalog<VariableLibraryValue>({
      /* Empty until something has been read: a page that has not been answered
         yet draws its own emptiness rather than an invented library. */
      initial: NOTHING_READ,
      read: async () => {
        const store = this.store()
        return { document: store === null ? null : await store.read() }
      },
    })
  }

  /** The library this form provided, or `null` when it can reach none. */
  store(): VariableStore | null {
    return this.ctx.get("hub.variables") ?? null
  }

  state(): CatalogState<VariableLibraryValue> {
    return this.catalog.state()
  }

  subscribe(listener: () => void): () => void {
    return this.catalog.subscribe(listener)
  }

  /** Read if nothing has been read. The form's startup does this first. */
  load(): Promise<void> {
    return this.catalog.load()
  }

  /** Read again: what a page calls when a write was not the source of truth. */
  reload(): Promise<void> {
    return this.catalog.reload()
  }

  /** Touch the held value up in place; part of what a catalog is. */
  update(recipe: (draft: VariableLibraryValue) => void): void {
    this.catalog.update(recipe)
  }

  /** Add one or more variables in one write. */
  create(drafts: readonly VariableDraft[]): Promise<VariableDocument> {
    return this.write((store) => store.create(drafts))
  }

  /** Change one variable by its current name. */
  edit(name: string, patch: VariablePatch): Promise<VariableDocument> {
    return this.write((store) => store.update(name, patch))
  }

  /** Delete one variable by name. */
  remove(name: string): Promise<VariableDocument> {
    return this.write((store) => store.remove(name))
  }

  /** Add a group, even before a variable uses it. */
  createGroup(group: string): Promise<VariableDocument> {
    return this.write((store) => store.createGroup(group))
  }

  /** Rename a group; its variables follow. */
  renameGroup(from: string, to: string): Promise<VariableDocument> {
    return this.write((store) => store.renameGroup(from, to))
  }

  /** Delete a group, moving its variables to the default one. */
  removeGroup(group: string): Promise<VariableDocument> {
    return this.write((store) => store.removeGroup(group))
  }

  /**
   * Run one write and publish the document it answered with.
   *
   * The read is awaited first so a write started while the startup read is
   * still in flight lands on the answered value rather than being dropped by
   * the catalog, which has nothing to update before its first answer.
   */
  private async write(
    act: (store: VariableStore) => Promise<VariableDocument>
  ): Promise<VariableDocument> {
    const store = this.store()
    if (store === null) throw new Error("this form has no variable library")
    await this.load()
    const next = await act(store)
    if (this.catalog.state().value === null) await this.catalog.reload()
    else this.catalog.update((draft) => {
      draft.document = next
    })
    return next
  }
}
