import { describe, expect, it } from "vitest"

import { serverUrlFrom } from "../src/server-output.ts"

describe("serverUrlFrom", () => {
  it("reads the URL from a complete line", () => {
    expect(serverUrlFrom("context hub server listening on http://127.0.0.1:52341\n")).toBe(
      "http://127.0.0.1:52341"
    )
  })

  it("waits when the line has not ended yet", () => {
    expect(serverUrlFrom("context hub server listening on http://127.0.0.1:52")).toBeNull()
  })

  it("finds the line among the server's other output", () => {
    const output = [
      "context hub server listening on http://127.0.0.1:52341",
      "serving the built page from /tmp/hub",
      "",
    ].join("\n")
    expect(serverUrlFrom(output)).toBe("http://127.0.0.1:52341")
  })
})
