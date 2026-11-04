import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, it } from "vitest"

import { createFsSkillStore } from "../src/host/skills-fs.ts"

it("keeps the recorded order across rebuild, update and restart, including numeric names", async () => {
  const home = await fs.mkdtemp(path.join(tmpdir(), "hub-skill-order-"))
  const root = path.join(home, "skills")
  let store: Awaited<ReturnType<typeof createFsSkillStore>> | undefined
  try {
    for (const name of ["z", "2", "a"]) {
      const dir = path.join(root, name)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\n`)
    }
    await fs.writeFile(path.join(root, "skills.json"), JSON.stringify(["z", "2", "a"].map((name) => ({ name }))))
    store = await createFsSkillStore({ home, userHome: home })
    const names = async () => (await store!.list()).items.map((item) => item.name)
    expect(await names()).toEqual(["z", "2", "a"])
    await store.update("2", { description: "updated" })
    await store.refresh()
    expect(await names()).toEqual(["z", "2", "a"])
    store.dispose()
    store = await createFsSkillStore({ home, userHome: home })
    expect(await names()).toEqual(["z", "2", "a"])
    expect((JSON.parse(await fs.readFile(path.join(root, "skills.json"), "utf8")) as { name: string }[])
      .map((entry) => entry.name)).toEqual(["z", "2", "a"])
  } finally {
    store?.dispose()
    await fs.rm(home, { recursive: true, force: true })
  }
})
