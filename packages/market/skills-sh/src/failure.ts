import { isTimeout } from "./apis/http.ts"

/** What a toast should say about a failed market read. */
export function failureText(error: unknown, t: (key: string) => string): string {
  if (isTimeout(error)) return t("market.state.timeout")
  return error instanceof Error ? error.message : String(error)
}
