/**
 * Reading an address before anything is fetched: which form a person typed, and
 * whether it is one this hub will take. Three forms cover every way a pack
 * arrives — a git repository, an archive over HTTP, or a directory already on
 * this machine.
 *
 * An address is normalized here rather than kept as typed: `owner/repo` becomes
 * the repository address it names, so nothing downstream has to know which
 * shorthand a person pasted. A form that is not one of the three is refused with
 * the reason, because the alternative — treating a word as a name and looking it
 * up somewhere — is a marketplace's job, and a marketplace is somebody else's
 * index rather than an address to fetch.
 *
 * A local path must be absolute. The host's working directory means nothing to a
 * person typing into a browser, so resolving a relative path against it would
 * point somewhere neither of them chose.
 *
 * This module parses strings only; resolving a revision is the host's job.
 */
import type { PluginOrigin } from "./contract.ts"

/** An address read into the form the host fetches it by. */
export type PluginSourceSpec =
  /** A repository, optionally at a ref. */
  | { kind: "git"; url: string; ref?: string }
  /** A zip or tarball over HTTP. */
  | { kind: "archive"; url: string }
  /** A directory on this machine, absolute. */
  | { kind: "path"; path: string }

/** An address the hub will not take; {@link InvalidPluginSourceError.reason} is what the person reads. */
export class InvalidPluginSourceError extends Error {
  /** The address as typed, trimmed. */
  readonly source: string
  /** Why it is refused, as one sentence. */
  readonly reason: string

  /**
   * @param source — the address as typed, trimmed.
   * @param reason — why it is refused, as one sentence.
   */
  constructor(source: string, reason: string) {
    super(`${reason}: ${source}`)
    this.name = "InvalidPluginSourceError"
    this.source = source
    this.reason = reason
  }
}

function invalid(source: string, reason: string): InvalidPluginSourceError {
  return new InvalidPluginSourceError(source, reason)
}

/** Host shorthands git hosts understand, and what each one expands to. */
const GIT_SHORTHANDS: Readonly<Record<string, string>> = {
  github: "https://github.com/",
  gitlab: "https://gitlab.com/",
  bitbucket: "https://bitbucket.org/",
}

/** A git URL, an scp-like address, or the `github:owner/repo` shorthand. */
const GIT_URL = /^git(?:\+[a-z]+)?:\/\//i
const SCP_ADDRESS = /^[^@/:\s]+@[^:/\s]+:/i
const GIT_SHORTHAND = /^([a-z]+):(\S+)$/i
/** `owner/repo` with no scheme: what a person pastes from a repository page. */
const HOSTED_REPOSITORY = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/
/** An archive a plugin pack can be shipped as. */
const ARCHIVE = /\.(?:zip|tgz|tar\.gz)(?:\?.*)?$/i
/** A local path that names where it is, rather than where the host happens to be. */
const ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\/|\\\\)/

/**
 * Split a ref off a git address. A `#ref` fragment is how a URL pins one, and
 * `owner/repo@ref` is how a person writes the same shorthand the display form
 * uses — so both are read here and neither reaches the host as part of an
 * address.
 *
 * `at` says whether an `@` may be a ref at all. On a shorthand it may; on an
 * address that carries one for another reason (`git@host:`, `https://user@host`)
 * it may not.
 */
function splitRef(value: string, at: boolean): { url: string; ref?: string } {
  const marks = at ? [value.indexOf("#"), value.indexOf("@")] : [value.indexOf("#")]
  const cut = marks.filter((one) => one > 0).sort((left, right) => left - right)[0] ?? -1
  if (cut <= 0) return { url: value }
  const ref = value.slice(cut + 1)
  return ref === "" ? { url: value.slice(0, cut) } : { url: value.slice(0, cut), ref }
}

/**
 * Read an address into its form.
 *
 * @param raw — the address as typed.
 * @returns the parsed address, with any shorthand already expanded.
 * @throws {InvalidPluginSourceError} for an empty address, a relative path, or
 * anything that names neither a repository, an archive, nor a directory here.
 */
export function parsePluginSource(raw: string): PluginSourceSpec {
  const source = raw.trim()
  if (source === "") throw invalid(source, "the address must not be empty")

  /* A local path, which must name where it is: a relative one would be resolved
     against a working directory the person cannot see. */
  const withoutScheme = source.replace(/^file:\/\//i, "")
  if (ABSOLUTE.test(withoutScheme)) return { kind: "path", path: withoutScheme }
  if (/^\.{1,2}(?:[\\/]|$)/.test(source) || source === "~" || /^~[\\/]/.test(source)) {
    throw invalid(source, "a path here must be absolute, like /packs/one or C:\\packs\\one")
  }

  /* An scp-like git address, whose `@` belongs to the user rather than a ref. */
  if (SCP_ADDRESS.test(source)) {
    const { url, ref } = splitRef(source, false)
    return { kind: "git", url, ...(ref === undefined ? {} : { ref }) }
  }

  /* A repository a git host knows by shorthand, which may carry a ref either way. */
  const shorthand = GIT_SHORTHAND.exec(source)
  const host = shorthand === null ? undefined : GIT_SHORTHANDS[shorthand[1]?.toLowerCase() ?? ""]
  if (shorthand !== null && host !== undefined) {
    const { url, ref } = splitRef(shorthand[2] as string, true)
    return { kind: "git", url: `${host}${url}`, ...(ref === undefined ? {} : { ref }) }
  }

  if (GIT_URL.test(source)) {
    const { url, ref } = splitRef(source, false)
    return { kind: "git", url, ...(ref === undefined ? {} : { ref }) }
  }

  if (/^https?:\/\//i.test(source)) {
    /* An archive keeps its address whole: a `#` there is not a ref this hub
       could check out, and the server is the one that named the file. */
    if (ARCHIVE.test(source)) return { kind: "archive", url: source }
    const { url, ref } = splitRef(source, false)
    if (!HOSTED_REPOSITORY.test(url.replace(/^https?:\/\/[^/]+\//i, ""))) {
      throw invalid(source, "a URL must point at a repository or an archive")
    }
    return { kind: "git", url, ...(ref === undefined ? {} : { ref }) }
  }

  /* `owner/repo`, the form a repository page hands out, with a ref either way. */
  const hosted = splitRef(source, true)
  if (HOSTED_REPOSITORY.test(hosted.url)) {
    return {
      kind: "git",
      url: `https://github.com/${hosted.url}`,
      ...(hosted.ref === undefined ? {} : { ref: hosted.ref }),
    }
  }

  throw invalid(source, "give a repository (owner/repo), an archive URL, or an absolute path")
}

/**
 * Whether a path names where it is, rather than where whatever is reading it
 * happens to stand. A label a page gives a chosen folder is not one: a browser is
 * told nothing about where a folder sits, so what it can say is a name.
 *
 * @param value — the path as it was read.
 */
export function isAbsolutePath(value: string): boolean {
  return ABSOLUTE.test(value)
}

/**
 * A local path as the place it names rather than as it was typed: the two
 * separators name the same directory on the platform whose paths carry a
 * backslash, and a trailing one names nothing extra.
 */
function samePlace(path: string): string {
  return path.replace(/[\\/]+/g, "/").replace(/\/$/, "")
}

/**
 * Whether a stored source is the one an address names, so the pack that landed
 * from it is the pack already here.
 *
 * A ref counts: a pack taken at one branch is not the pack at another, and
 * taking the second one is a real add rather than a repeat.
 *
 * @param spec — the address as it was read.
 * @param source — where a collected pack came from.
 */
export function sourceMatches(spec: PluginSourceSpec, source: PluginOrigin): boolean {
  switch (spec.kind) {
    case "git":
      return (
        source.kind === "git" &&
        spec.url === source.url &&
        (spec.ref ?? "") === (source.ref ?? "")
      )
    case "archive":
      return source.kind === "archive" && spec.url === source.url
    case "path":
      return source.kind === "path" && samePlace(spec.path) === samePlace(source.path)
  }
}

/**
 * The same address as text a person can read back, so a stored source can be
 * shown and re-parsed where the field is not the point.
 */
export function formatPluginSource(spec: PluginSourceSpec): string {
  switch (spec.kind) {
    case "git":
      return spec.ref === undefined ? spec.url : `${spec.url}#${spec.ref}`
    case "archive":
      return spec.url
    case "path":
      return spec.path
  }
}
