import { describe, expect, it } from "vitest"
import { parseYamlDocument, spliceYamlDocument } from "../src/yaml-document.ts"

describe("YAML document ranges", () => {
  it("preserves tagged expressions without evaluating them and splices only the chosen range", () => {
    const text = "# keep\r\n- id: sample\r\n  config: !!js globalThis.__yamlProbe++\r\n  disabled: false # comment\r\n"
    const global = globalThis as typeof globalThis & { __yamlProbe?: number }
    global.__yamlProbe = 0
    const root = parseYamlDocument(text)!
    const row = root.items![0]!
    const config = row.pairs!.find((pair) => pair.key.value === "config")!.value!
    expect(config.tag).toBe("tag:yaml.org,2002:js")
    expect(config.value).toBe("globalThis.__yamlProbe++")
    const disabled = row.pairs!.find((pair) => pair.key.value === "disabled")!.value!
    const result = spliceYamlDocument(text, disabled.range[0], disabled.range[1], "true")
    expect(result).toBe(text.replace("disabled: false", "disabled: true"))
    expect(global.__yamlProbe).toBe(0)
    delete global.__yamlProbe
  })

  it("locates flow values and block scalars without rewriting surrounding bytes", () => {
    const text = "---\nflow: { value: 1, other: two }\nblock: |-\n  keep # literal\n...\n"
    const root = parseYamlDocument(text)!
    const flow = root.pairs!.find((pair) => pair.key.value === "flow")!.value!
    const value = flow.pairs!.find((pair) => pair.key.value === "value")!.value!
    const block = root.pairs!.find((pair) => pair.key.value === "block")!.value!
    expect(block.value).toBe("keep # literal")
    const changed = spliceYamlDocument(text, value.range[0], value.range[1], "2")
    expect(changed).toBe(text.replace("value: 1", "value: 2"))
  })

  it("keeps anchors and aliases visible and refuses duplicate keys or multiple documents", () => {
    const root = parseYamlDocument("a: &base {x: 1}\nb: *base\n")!
    expect(root.pairs![0]!.value!.anchor).toBe("base")
    expect(root.pairs![1]!.value!.kind).toBe("alias")
    expect(() => parseYamlDocument("a: 1\na: 2\n")).toThrow()
    expect(() => parseYamlDocument("secret-value: [private-token\n")).toThrow("invalid or unsupported YAML")
    expect(() => parseYamlDocument("---\na: 1\n---\nb: 2\n")).toThrow()
    expect(() => spliceYamlDocument("a: 1\n", 0, 20, "x")).toThrow()
    expect(() => spliceYamlDocument("a: 1\n", 0, 1, "[")).toThrow()
  })
})
