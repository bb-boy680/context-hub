/**
 * The skill bridge's two ends, driven against each other over a real socket.
 *
 * The host half is covered by tests of their own (`store`, `place-skills`,
 * `package`, `registry`, `upstream`, `updates`) — all of them against the disk
 * store directly. Nothing reached the wire, and skills is the bridge with the
 * most surface: twenty-odd actions, two ways of naming them (a query action and
 * a path segment), and every parameter spelled once by the handler and once by
 * `remote-store.ts`.
 *
 * A name that drifts is a 400 the page catches and draws as an empty list or an
 * empty file — "this feature does not work" and "this library has nothing"
 * become the same picture (`docs/memory.md`, the `?action=files&id=` incident).
 * So every call goes through the package's own client against a real
 * `createHubServer` on a temporary hub home.
 *
 * Three actions are left out because they need something this machine cannot
 * promise: `listPackage` and `installPackage` run the skills CLI, and
 * `checkUpdates` reaches the network. They are the ones `updates.test.ts` and
 * `package.test.ts` already cover at the disk layer.
 */
import { mkdtempSync, promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createHubServer, type HubListener } from "@context-hub/core/host/server"

import { createSkillHandler } from "../handlers.ts"
import { createRemoteSkillStore } from "../src/remote-store.ts"
import { SKILL_ROUTE, type SkillPlaceRef, type SkillStore } from "../src/store.ts"

let home: string
let listener: HubListener
let store: SkillStore

/*
 * The folder this host works in, and the place inside it. Both are real, and
 * both are made while this file is being read rather than in a hook: the table
 * below names them, and a table is built before any hook runs.
 *
 * A place is always a directory *under* one of the two roots, never an absolute
 * path — which is also why this host is pointed at a temporary folder rather
 * than left to resolve one: a workspace place would otherwise be written into
 * the repository this suite is running in.
 */
const folder: string = mkdtempSync(path.join(tmpdir(), "context-hub-skill-bridge-folder-"))
const REF: SkillPlaceRef = { scope: "workspace", dir: ".agents/skills" }
const place = path.join(folder, REF.dir)

/** One call the page makes, and what its answer must carry. */
interface Call {
  label: string
  run: (store: SkillStore) => Promise<unknown>
  /** Keys the answer must carry; empty means the answer is not inspected. */
  keys: readonly string[]
  /** A refusal this call meets on purpose, and what that refusal says. */
  refuses?: RegExp
}

/** One skill in the library to work on, made fresh for the calls that need one. */
async function one(store: SkillStore, name: string): Promise<string> {
  return (await store.create({ name, description: "made by the check", tags: ["one"] })).name
}

const CALLS: readonly Call[] = [
  { label: "the whole catalog", run: (s) => s.list(), keys: ["items", "total", "counts", "root"] },
  {
    label: "the catalog one page at a time",
    run: (s) => s.list({ offset: 0, limit: 2, sort: "name" }),
    keys: ["items", "total"],
  },
  { label: "a filtered catalog", run: (s) => s.list({ q: "bridge", tag: "one" }), keys: ["items"] },
  { label: "every tag in use", run: (s) => s.tags(), keys: [] },
  {
    label: "one skill",
    run: async (s) => s.get(await one(s, "bridge-get")),
    keys: ["name", "description", "body", "files"],
  },
  {
    label: "adding one",
    run: (s) => s.create({ name: "bridge-create", description: "made by the check" }),
    keys: ["name", "description"],
  },
  {
    label: "changing one",
    run: async (s) => s.update(await one(s, "bridge-update"), { description: "changed", enabled: false }),
    keys: ["name", "description"],
  },
  {
    label: "taking one out",
    run: async (s) => {
      await s.remove(await one(s, "bridge-remove"))
      return { ok: true }
    },
    keys: [],
  },
  {
    label: "one file of a skill",
    run: async (s) => s.readFile(await one(s, "bridge-read"), "SKILL.md"),
    keys: [],
  },
  {
    label: "writing one file of a skill",
    run: async (s) => {
      const id = await one(s, "bridge-write")
      await s.writeFile(id, "notes.md", "# notes\n")
      return { text: await s.readFile(id, "notes.md") }
    },
    keys: [],
  },
  {
    label: "recording a pasted address",
    run: async (s) => s.addAssetSource(await one(s, "bridge-source"), "https://example.invalid/a.png"),
    keys: ["ref", "kind"],
  },
  {
    label: "uploading bytes",
    run: async (s) => s.putAsset(await one(s, "bridge-upload"), new File([new Uint8Array([1, 2])], "a.png")),
    keys: ["ref", "kind"],
  },
  {
    label: "dropping an uploaded file",
    run: async (s) => {
      const id = await one(s, "bridge-drop")
      const asset = await s.putAsset(id, new File([new Uint8Array([3, 4])], "b.png"))
      await s.deleteAsset(id, asset.ref)
      return { ok: true }
    },
    keys: [],
  },
  {
    label: "counting the library's pictures",
    run: (s) => s.assetStats(),
    keys: ["remote", "localized"],
  },
  {
    label: "reading a place",
    run: (s) => s.placeSkills(REF),
    keys: ["root", "display", "skills"],
  },
  {
    label: "one skill in a place, after installing it there",
    run: async (s) => {
      const id = await one(s, "bridge-place")
      await s.installInto(id, REF)
      return s.placeSkill(id, REF)
    },
    keys: ["name"],
  },
  {
    label: "one file of a skill in a place",
    run: async (s) => {
      const id = await one(s, "bridge-placefile")
      await s.installInto(id, REF)
      return s.placeFile(id, "SKILL.md", REF)
    },
    keys: [],
  },
  {
    label: "installing into a place",
    run: async (s) => ({ mode: await s.installInto(await one(s, "bridge-install"), REF) }),
    keys: ["mode"],
  },
  {
    label: "installing into a place by copy",
    run: async (s) => ({
      mode: await s.installInto(await one(s, "bridge-copy"), REF, "copy"),
    }),
    keys: ["mode"],
  },
  {
    label: "taking one out of a place",
    run: async (s) => {
      const id = await one(s, "bridge-removefrom")
      await s.installInto(id, REF)
      await s.removeFrom(id, REF)
      return { ok: true }
    },
    keys: [],
  },
  {
    label: "deleting one in a place",
    run: async (s) => {
      const id = await one(s, "bridge-deletein")
      await s.installInto(id, REF)
      await s.deleteInPlace(id, REF)
      return { ok: true }
    },
    keys: [],
  },
  {
    label: "adopting one out of a place",
    run: async (s) => {
      /* A skill that exists only in the place: written there directly, so
         adopting it is the only way the library gets it. */
      await fs.mkdir(path.join(place, "adopted-here"), { recursive: true })
      await fs.writeFile(
        path.join(place, "adopted-here", "SKILL.md"),
        "---\nname: adopted-here\ndescription: from the place\n---\n\nBody.\n",
        "utf8"
      )
      return { mode: await s.adoptFrom("adopted-here", REF) }
    },
    keys: ["mode"],
  },
  {
    label: "adopting one out of a place by copy",
    run: async (s) => {
      await fs.mkdir(path.join(place, "adopted-copy"), { recursive: true })
      await fs.writeFile(
        path.join(place, "adopted-copy", "SKILL.md"),
        "---\nname: adopted-copy\ndescription: copied from the place\n---\n\nBody.\n",
        "utf8"
      )
      return { mode: await s.adoptFrom("adopted-copy", REF, "copy") }
    },
    keys: ["mode"],
  },
  {
    label: "re-reading the disk",
    run: async (s) => {
      await s.refresh()
      return { ok: true }
    },
    keys: [],
  },
  {
    label: "a folder of skills a person dragged in",
    run: (s) =>
      s.importFolder([
        {
          name: "bridge-imported",
          files: [
            {
              path: "SKILL.md",
              base64: Buffer.from(
                "---\nname: bridge-imported\ndescription: dragged in\n---\n\nBody.\n",
                "utf8"
              ).toString("base64"),
            },
          ],
        },
      ]),
    keys: ["installed", "failed"],
  },
  {
    label: "asking whether a skill has moved upstream",
    run: async (s) => s.checkUpdate(await one(s, "bridge-check")),
    keys: [],
    /* Collected from a folder rather than an address, so there is no upstream
       to ask. The call is here anyway: it is the action and the id parameter
       that are under test, and an id that drifted reads as a missing one. */
    refuses: /./,
  },
]

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-skill-bridge-home-"))
  const server = createHubServer({
    middlewares: [createSkillHandler({ home, folder })],
    log: () => undefined,
  })
  listener = await server.listen()
  store = createRemoteSkillStore(listener.url)
})

afterAll(async () => {
  await listener.close()
  await fs.rm(home, { recursive: true, force: true })
  await fs.rm(folder, { recursive: true, force: true })
})

describe("every call the page makes", () => {
  it.each(CALLS)("$label is answered", async (call) => {
    let answer: unknown
    try {
      answer = await call.run(store)
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error)
      if (call.refuses !== undefined) {
        expect(said).toMatch(call.refuses)
        return
      }
      /* Named rather than rethrown: the message is what says which end is wrong,
         and the two screens of a drifted name look nothing alike. */
      throw new Error(`the two ends disagree about "${call.label}": ${said}`, { cause: error })
    }

    expect(call.refuses, `it answered instead of refusing: ${JSON.stringify(answer)}`).toBeUndefined()
    if (call.keys.length === 0) return
    expect(answer, "the answer is not an object").toBeTypeOf("object")
    expect(Object.keys(answer as object)).toEqual(expect.arrayContaining([...call.keys]))
  })
})

describe("a request this bridge does not own", () => {
  it("is passed on rather than answered here", async () => {
    const response = await fetch(`${listener.url}/hub/something-else`)
    expect(response.status).toBe(404)
  })

  it("is not claimed by a path that merely starts with the route", async () => {
    /* `/hub/skillsXYZ` is not this route. Matching by prefix reads `XYZ` as a
       skill id, so a stray path answers about a skill nobody named. */
    expect((await fetch(`${listener.url}${SKILL_ROUTE}X`)).status).toBe(404)
  })
})
