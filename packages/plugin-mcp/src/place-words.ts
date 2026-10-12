/**
 * The words every place list on the MCP page draws. The lists themselves know no
 * keys: a module hands them the strings it owns, so the same rows read "places"
 * here and "技能位置" there without either module reaching into the other's
 * namespace.
 */
import type { PlaceWords } from "@workspace/extensions/components/place-picker"

/**
 * The MCP module's strings for a place list.
 *
 * @param t — the active locale's lookup.
 * @returns the strings a place menu draws.
 */
export function placeWords(t: (key: string) => string): PlaceWords {
  return {
    search: t("mcp.place.search"),
    searchClear: t("mcp.place.searchClear"),
    searchEmpty: t("mcp.place.searchEmpty"),
    count: (total) =>
      t("mcp.detail.place.count").replace("{count}", String(total)),
  }
}
