import { afterEach, expect, it, vi } from "vitest"

import { createRemoteWorkspaceService } from "../src/lib/workspaces.ts"

const page = (agentOrder: string[]) => ({ folders: [], current: null, agents: [], agentOrder })

afterEach(() => vi.unstubAllGlobals())

it("does not let an older refresh overwrite a saved Agent order", async () => {
  let finishRead!: (response: Response) => void
  const read = new Promise<Response>((resolve) => { finishRead = resolve })
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
    init.method === "GET" ? read : Promise.resolve(Response.json(page(["m", "z", "a"])))
  ))
  const service = createRemoteWorkspaceService()
  const refreshing = service.refresh()
  expect(await service.setAgentOrder(["m", "z", "a"])).toBe(true)
  finishRead(Response.json(page(["z", "a", "m"])))
  await refreshing
  expect(service.current()?.agentOrder).toEqual(["m", "z", "a"])
})

it("serialises Agent ordering and workspace actions", async () => {
  let releaseFirst!: (response: Response) => void
  const first = new Promise<Response>((resolve) => { releaseFirst = resolve })
  const fetcher = vi.fn()
    .mockReturnValueOnce(first)
    .mockResolvedValueOnce(Response.json(page(["m", "z", "a"])))
  vi.stubGlobal("fetch", fetcher)
  const service = createRemoteWorkspaceService()
  const saving = service.setAgentOrder(["m", "z", "a"])
  const choosing = service.setAgent("a", true)
  await Promise.resolve()
  expect(fetcher).toHaveBeenCalledTimes(1)
  releaseFirst(Response.json(page(["m", "z", "a"])))
  expect(await saving).toBe(true)
  expect(await choosing).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
