/** 扩展声明的通用 JSON 清单条件，宿主不识别具体客户端。 */
export interface PluginManifestRule {
  file: string
  required: readonly {
    path: readonly string[]
    kind: "nonempty-string" | "nonempty-string-array" | "nonempty-string-or-array"
  }[]
}

function relativeManifest(file: unknown): file is string {
  return typeof file === "string" && file !== "" && file.split("/").every((part) =>
    part !== "" && part !== "." && part !== ".." && !/[\\:]/.test(part))
}

/** 在跨进程边界重新校验扩展声明的规则。 */
export function pluginManifestRules(value: unknown): PluginManifestRule[] {
  if (!Array.isArray(value) || value.length > 128) throw new Error("invalid plugin manifest rules")
  return value.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw new Error("invalid plugin manifest rule")
    const rule = item as { file?: unknown; required?: unknown }
    if (!relativeManifest(rule.file) || !Array.isArray(rule.required) || rule.required.length === 0 || rule.required.length > 16) {
      throw new Error("invalid plugin manifest rule")
    }
    const required = rule.required.map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new Error("invalid plugin manifest condition")
      const condition = entry as { path?: unknown; kind?: unknown }
      if (!Array.isArray(condition.path) || condition.path.length === 0 || condition.path.length > 16 ||
        condition.path.some((part) => typeof part !== "string" || part === "" || part === "__proto__" || part === "constructor" || part === "prototype") ||
        !["nonempty-string", "nonempty-string-array", "nonempty-string-or-array"].includes(String(condition.kind))) {
        throw new Error("invalid plugin manifest condition")
      }
      return { path: condition.path as string[], kind: condition.kind as PluginManifestRule["required"][number]["kind"] }
    })
    return { file: rule.file, required }
  })
}

/** 条件只检查字面 JSON 值；不执行清单里的代码。 */
export function matchesPluginManifestRule(document: unknown, rule: PluginManifestRule): boolean {
  return rule.required.every(({ path, kind }) => {
    let value: unknown = document
    for (const part of path) {
      if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.hasOwn(value, part)) return false
      value = (value as Record<string, unknown>)[part]
    }
    const string = typeof value === "string" && value.trim() !== ""
    const array = Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim() !== "")
    return kind === "nonempty-string" ? string : kind === "nonempty-string-array" ? array : string || array
  })
}
