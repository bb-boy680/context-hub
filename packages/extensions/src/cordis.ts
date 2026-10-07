/**
 * Single import site for the kernel framework. TypeScript folds the augmented
 * `Context` members into the symbol only when the package root is imported as
 * a value, so every module here imports the framework through this file.
 */
import { Context, Service } from "@deepseek-ai/cordis"
import type { Fiber, Plugin } from "@deepseek-ai/cordis"

export { Context, Service }
export type { Fiber, Plugin }
