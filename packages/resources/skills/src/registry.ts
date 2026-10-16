/**
 * The package's remote-registry surface. The contract itself lives in the
 * kernel, because a registry is a contribution point: a plugin declares one and
 * the page reads contributions without knowing which plugin made them.
 */
export type {
  RegistryPage,
  RegistryQuery,
  RemoteSkill,
  SkillRegistry,
} from "@context-hub/extensions"
