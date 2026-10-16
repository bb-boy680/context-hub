/**
 * What an agent extension works with: the service name it requires and the
 * provider it registers under it.
 *
 * It carries no rendering, so a check runs it under plain Node, and an agent
 * plugin reads these types whether it was built inside this repository or
 * installed as a folder.
 */
export {
  PROMPT_SERVICE,
  type PromptDocument,
  type PromptPlace,
  type PromptProvider,
  type PromptProviderRegistry,
  type PromptService,
} from "./provider.ts"
