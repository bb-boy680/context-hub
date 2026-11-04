import { isAlias, isMap, isScalar, isSeq, parseAllDocuments } from "yaml"

export type YamlNode = {
  kind: "map" | "seq" | "scalar" | "alias"
  range: readonly [number, number, number]
  tag?: string
  anchor?: string
  value?: unknown
  items?: YamlNode[]
  pairs?: { key: YamlNode; value: YamlNode | null }[]
}

/** 解析为可序列化的节点和原文范围；自定义 JS 标签只保留文本。 */
export function parseYamlDocument(text: string): YamlNode | null {
  const documents = parseAllDocuments(text, {
    keepSourceTokens: true,
    prettyErrors: false,
    uniqueKeys: true,
    customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (value: string) => value }],
  })
  if (documents.length !== 1) throw new Error("YAML must contain exactly one document")
  const document = documents[0]!
  if (document.errors.length || document.warnings.length) {
    throw new Error("invalid or unsupported YAML")
  }

  function convert(node: unknown): YamlNode {
    if (!isMap(node) && !isSeq(node) && !isScalar(node) && !isAlias(node)) {
      throw new Error("unsupported YAML node")
    }
    if (!node.range) throw new Error("YAML node has no source range")
    const base = {
      range: node.range as [number, number, number],
      ...(node.tag === undefined ? {} : { tag: node.tag }),
      ...(!("anchor" in node) || !node.anchor ? {} : { anchor: node.anchor }),
    }
    if (isMap(node)) return {
      ...base,
      kind: "map",
      pairs: node.items.map(({ key, value }) => ({ key: convert(key), value: value === null ? null : convert(value) })),
    }
    if (isSeq(node)) return { ...base, kind: "seq", items: node.items.map(convert) }
    if (isAlias(node)) return { ...base, kind: "alias", value: node.source }
    return { ...base, kind: "scalar", value: node.value }
  }

  return document.contents === null ? null : convert(document.contents)
}

/** 替换指定原文范围并重新解析，不重新打印其他节点。 */
export function spliceYamlDocument(text: string, start: number, end: number, replacement: string): string {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length) {
    throw new Error("invalid YAML edit range")
  }
  parseYamlDocument(text)
  const next = text.slice(0, start) + replacement + text.slice(end)
  parseYamlDocument(next)
  return next
}
