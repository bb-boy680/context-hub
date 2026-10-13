/**
 * Behaviour check for the registry an agent extension registers its skill
 * places into, and for which of those places a set of chosen agents makes
 * readable. It runs the service the skills module publishes, so what it proves
 * is what an agent plugin meets at run time.
 *
 * Run from the package: `node scripts/check-registry.ts`
 */
import { readablePlaces, type SkillPlace } from "../src/provider.ts"
import { createSkillService } from "../src/service.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

/** One place, as an agent extension declares it. */
function place(id: string, scope: "workspace" | "global", order: number): SkillPlace {
  return { id, labelKey: `${id}.tab`, icon: () => null, scope, dir: `.${id}/skills`, order }
}

const service = createSkillService()
const registry = service.registry

console.log("registry")

check("a fresh registry holds nothing", registry.providers().length === 0)

const agent = { id: "hub.target.one", places: [place("one", "global", 30)] }
const dispose = registry.register(agent)
check("registering adds the provider", registry.providers().length === 1)
check("and it keeps every place the provider declared", registry.providers()[0]?.places.length === 1)

const second = registry.register({
  id: "hub.target.two",
  places: [place("two", "global", 10)],
})
check(
  "providers come back in registration order",
  JSON.stringify(registry.providers().map((provider) => provider.id)) ===
    JSON.stringify(["hub.target.one", "hub.target.two"]),
  registry.providers().map((provider) => provider.id)
)

dispose()
check("its own disposer takes one back out", registry.providers().length === 1)
check("and leaves the other alone", registry.providers()[0]?.id === "hub.target.two")
dispose()
check("disposing twice is not an error and removes nothing more", registry.providers().length === 1)
second()

console.log("readable places")

const providers = [
  { id: "hub.target.one", places: [place("one-global", "global", 30)] },
  {
    id: "hub.target.two",
    places: [place("two-workspace", "workspace", 20), place("two-global", "global", 10)],
  },
]

check(
  "a workspace place is read with no agent chosen",
  JSON.stringify(readablePlaces(providers, []).map((each) => each.id)) ===
    JSON.stringify(["two-workspace"]),
  readablePlaces(providers, []).map((each) => each.id)
)
check(
  "a machine-wide place is held back until its own agent is chosen",
  JSON.stringify(readablePlaces(providers, ["hub.target.two"]).map((each) => each.id)) ===
    JSON.stringify(["two-global", "two-workspace"]),
  readablePlaces(providers, ["hub.target.two"]).map((each) => each.id)
)
check(
  "choosing one agent does not read another's places",
  !readablePlaces(providers, ["hub.target.two"]).some((each) => each.id === "one-global")
)
check(
  "the places are ordered by their own rank",
  JSON.stringify(
    readablePlaces(providers, ["hub.target.one", "hub.target.two"]).map((each) => each.id)
  ) === JSON.stringify(["two-global", "two-workspace", "one-global"]),
  readablePlaces(providers, ["hub.target.one", "hub.target.two"]).map((each) => each.id)
)

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} failed`}`)
if (failures > 0) process.exitCode = 1
