import { describe, expect, it, vi } from "vitest"

import { createMenuActionQueue } from "../src/menu-action-queue.ts"

describe("createMenuActionQueue", () => {
  it("buffers actions until the page subscribes, in order", () => {
    const queue = createMenuActionQueue<string>()
    queue.push("about")
    queue.push("reload-resources")

    const listener = vi.fn()
    queue.subscribe(listener)

    expect(listener.mock.calls).toEqual([["about"], ["reload-resources"]])
  })

  it("delivers immediately once subscribed", () => {
    const queue = createMenuActionQueue<string>()
    const listener = vi.fn()
    queue.subscribe(listener)

    queue.push("refresh-plugins")

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith("refresh-plugins")
  })

  it("stops delivering after unsubscribe and does not replay delivered actions", () => {
    const queue = createMenuActionQueue<string>()
    const first = vi.fn()
    const unsubscribe = queue.subscribe(first)
    queue.push("about")
    unsubscribe()

    queue.push("reload-resources")
    expect(first.mock.calls).toEqual([["about"]])

    const second = vi.fn()
    queue.subscribe(second)
    expect(second.mock.calls).toEqual([["reload-resources"]])
  })

  it("does not let an old cleanup clear a newer subscriber", () => {
    const queue = createMenuActionQueue<string>()
    const first = vi.fn()
    const unsubscribeFirst = queue.subscribe(first)
    const second = vi.fn()
    queue.subscribe(second)

    unsubscribeFirst()
    queue.push("about")

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith("about")
  })
})
