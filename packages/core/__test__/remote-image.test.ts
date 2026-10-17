/**
 * Downloading a picture is as narrow as the net proxy: public hosts only, each
 * redirect checked again, and the same size ceiling the asset library enforces.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { downloadRemoteImage, isPublicHostname } from "../src/host/remote-image.ts"

describe("a host a download may reach", () => {
  it("refuses this machine and its neighbours", () => {
    for (const host of [
      "localhost",
      "api.localhost",
      "printer.local",
      "::1",
      "fe80::1",
      "fc00::1",
      "fd12::1",
      "127.0.0.1",
      "10.0.0.7",
      "172.16.0.1",
      "192.168.1.20",
      "169.254.1.1",
      "server",
    ]) {
      expect(isPublicHostname(host), host).toBe(false)
    }
  })

  it("allows a public address", () => {
    for (const host of ["example.com", "8.8.8.8", "172.32.0.1", "11.0.0.1"]) {
      expect(isPublicHostname(host), host).toBe(true)
    }
  })
})

describe("downloading a remote image", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns the bytes as a named, typed file", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        })
    )

    const file = await downloadRemoteImage("https://example.com/demo.png")
    expect(file.name, "named after the address").toBe("demo.png")
    expect(file.type, "typed by the server").toBe("image/png")
    expect(new Uint8Array(await file.arrayBuffer()), "the server's bytes").toEqual(
      new Uint8Array([1, 2, 3])
    )
  })

  it("refuses an answer that is not an image", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
    )

    await expect(downloadRemoteImage("https://example.com/page")).rejects.toThrow(/not an image/)
  })

  it("refuses an image larger than the library keeps", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-length": String(6 * 1024 * 1024),
          },
        })
    )

    await expect(downloadRemoteImage("https://example.com/huge.png")).rejects.toThrow(/5 MB/)
  })

  it("follows a redirect to a public address", async () => {
    let calls = 0
    vi.stubGlobal("fetch", async () => {
      calls += 1
      if (calls === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://example.org/final.png" },
        })
      }
      return new Response(new Uint8Array([9]), {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    })

    const file = await downloadRemoteImage("https://example.com/moved.png")
    expect(file.name, "named after the final address").toBe("final.png")
    expect(calls, "one redirect was followed").toBe(2)
  })

  it("refuses a redirect into this machine", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private.png" },
        })
    )

    await expect(downloadRemoteImage("https://example.com/moved.png")).rejects.toThrow(
      /refusing to download from 127\.0\.0\.1/
    )
  })
})
