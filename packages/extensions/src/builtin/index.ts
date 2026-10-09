/** Packs the kernel ships itself; a product composes additional packs beside them. */
import type { ExtensionDefinition } from "../types.ts"

import { englishLocale } from "./locale-en.ts"
import { codexTarget, copilotTarget } from "./targets.ts"

export const builtinExtensions: ExtensionDefinition[] = [
  codexTarget,
  copilotTarget,
  englishLocale,
]
