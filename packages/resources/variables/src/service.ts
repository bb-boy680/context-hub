/**
 * The module's public surface for other plugins.
 *
 * The variable panel is the one thing another module needs to draw: MCP's
 * fields open it when the user types `$`, but the panel itself belongs to this
 * module so there is one implementation of reading, filtering and inserting a
 * name. A consumer reaches it as `ctx.variables.components.VariablePicker`;
 * when this module is disabled the service is absent and the consumer falls
 * back to a plain field.
 */
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"
import type { ComponentType } from "react"

import {
  VariableInput,
  type VariableInputProps,
} from "./components/variable-input.tsx"
import {
  VariablePicker,
  type VariablePickerProps,
} from "./components/variable-picker.tsx"

/** The name the service is registered under, and what `ctx.variables` reads. */
export const VARIABLES_SERVICE = "variables"

/** What another plugin can mount from this module. */
export interface VariablesComponents {
  VariablePicker: ComponentType<VariablePickerProps>
  VariableInput: ComponentType<VariableInputProps>
}

/** The service; constructing it is what makes `ctx.variables` exist. */
export class VariablesService extends Service {
  readonly components: VariablesComponents = { VariablePicker, VariableInput }

  constructor(ctx: Context) {
    super(ctx, VARIABLES_SERVICE)
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Present while the variables module is enabled. */
    variables?: VariablesService
  }
}
