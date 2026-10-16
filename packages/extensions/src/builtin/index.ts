/** Packs the kernel ships itself; a product composes additional packs beside them. */
import type { ExtensionModule } from "../types.ts"

import { englishLocale } from "./locale-en.ts"

export const builtinExtensions: ExtensionModule[] = [englishLocale]
