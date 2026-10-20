/**
 * What a prompt provider gets to work with: the file-naming and section rules
 * this module already owns, in one value a plugin that imports nothing can take
 * apart.
 *
 * A provider runs in the extension that knows one agent, so it cannot import
 * this package's internals — it receives these functions off the service. They
 * are the same ones the built-in workspace provider uses, which is what keeps a
 * generated file named and fenced the same way wherever it lands.
 */
import { commandFile, describeBody } from "./command-file.ts"
import { PromptError } from "./failure.ts"
import { withSection, withoutSection } from "./instruction.ts"
import { slugOf } from "./slug.ts"

/** One piece of a prompt form a place already holds. */
export interface PromptTools {
  /** A prompt's display name as the file name every form writes. */
  slugOf(name: string): string
  /** The first line of a body, for a description a prompt did not give. */
  describeBody(body: string): string
  /** The whole text of a generated command, rule or agents file. */
  commandFile(input: {
    name: string
    description: string
    body: string
    frontmatter: boolean
  }): string
  /** A prompt's marked section added to, or replaced in, an instruction file. */
  withSection(
    existing: string | null,
    input: { slug: string; title: string; body: string }
  ): string
  /** That section taken out, or `null` when it was never there. */
  withoutSection(existing: string, slug: string): string | null
  /** A failure the provider names, so the page shows its own sentence. */
  PromptError: typeof PromptError
}

/** The toolkit itself, assembled in one place so nothing can go missing from it. */
export const promptTools: PromptTools = {
  slugOf,
  describeBody,
  commandFile,
  withSection,
  withoutSection,
  PromptError,
}
