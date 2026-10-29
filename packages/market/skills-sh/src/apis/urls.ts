/** Where the APIs live; the display site is a different host. */
export const MARKET_ORIGIN = "https://skills.sh"
export const MARKET_SITE = "https://www.skills.sh"

/** A source's path segments, refused before they can reach a URL. */
export function sourceSegments(source: string): string[] {
  const segments = source.split("/")
  if (segments.length === 0 || segments.some((segment) => segment === "")) {
    throw new Error("market source is empty")
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("market source names a parent directory")
  }
  return segments.map(encodeURIComponent)
}

/** A skill id, refused before it can reach a URL. */
export function skillSegment(skill: string): string {
  if (skill === "" || skill === "." || skill === ".." || /[\\/]/.test(skill)) {
    throw new Error("market skill id is not a single name")
  }
  return encodeURIComponent(skill)
}

/** The page path for one skill, used by the detail dialog's external link. */
export function marketSkillUrl(source: string, skill: string, site = false): string {
  const root = site ? MARKET_SITE : MARKET_ORIGIN
  const segments = sourceSegments(source)
  /* A domain source has its own `/site/<domain>/<skill>` page; an owner/repo
     source uses the normal three-segment path. */
  const prefix = site && segments.length === 1 ? ["site", ...segments] : segments
  return `${root}/${prefix.join("/")}/${skillSegment(skill)}`
}
