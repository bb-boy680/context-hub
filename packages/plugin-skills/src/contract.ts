/**
 * What an agent extension works with: the service name it requires and the
 * provider it registers under it.
 *
 * It carries no rendering, so a check runs it under plain Node, and an agent
 * plugin reads these types whether it was built inside this repository or
 * installed as a folder.
 */
export {
  SKILL_SERVICE,
  type SkillPlace,
  type SkillProvider,
  type SkillProviderRegistry,
  type SkillService,
} from "./provider.ts"
