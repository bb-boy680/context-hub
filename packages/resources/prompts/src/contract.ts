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
  type PromptForm,
  type PromptFormOption,
  type PromptHeld,
  type PromptIo,
  type PromptPlace,
  type PromptProvider,
  type PromptService,
} from "./provider.ts"
export { type PromptTools } from "./toolkit.ts"
export { type PromptFailure } from "./failure.ts"
