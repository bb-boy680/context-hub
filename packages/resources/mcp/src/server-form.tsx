/**
 * The server form: the name, the transport, the endpoint, and the environment
 * rows — plus the record's own description and types where the host edits them
 * here rather than in a panel of its own. One component serves the add dialog
 * and the detail pane, so a server is described the same way wherever it is
 * edited, and the values it edits are the form's own shape — {@link valuesOf}
 * and {@link declarationOf} are the two conversions between that shape and the
 * declaration every file carries.
 */
import { InfoIcon, PlusIcon, Trash2Icon } from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import { splitArguments, type McpDeclaration, type McpTransport } from "./contract.ts"
import { useI18n } from "@context-hub/extensions/react"
import { TagEditor } from "@context-hub/extensions/components"
import { Button } from "@context-hub/shadcn-ui/components/button"
import { Textarea } from "@context-hub/shadcn-ui/components/textarea"

/** The transports the form picks between. */
const TRANSPORTS: McpTransport[] = ["stdio", "sse", "http"]

/** The red line every field a submit found empty carries. */
const ERROR = "text-[12px] leading-[1.3] text-destructive"

/** One `name`/`value` row: an environment variable, or a request header. */
export interface McpPair {
  name: string
  value: string
}

/** The values one declaration is written from, which is what this form edits. */
export interface ServerFormValues {
  name: string
  transport: McpTransport
  command: string
  /** The arguments as one line, split on the way back into a declaration. */
  args: string
  url: string
  pairs: McpPair[]
}

/** The record's own fields beside the declaration, which the add dialog edits too. */
export interface ServerRecordValues {
  /** One sentence on what the server offers. */
  description: string
  /** The types it carries. */
  tags: string[]
}

/** The message for every required field a submit found empty, keyed by the field. */
export interface ServerFormErrors {
  name?: string
  command?: string
  url?: string
}

/** The messages for the fields the values leave empty; null when every one is filled. */
export function formErrors(
  values: ServerFormValues,
  t: (key: string) => string
): ServerFormErrors | null {
  const errors: ServerFormErrors = {}
  if (values.name.trim() === "") errors.name = t("mcp.add.error.name")
  if (values.transport === "stdio") {
    if (values.command.trim() === "") errors.command = t("mcp.add.error.command")
  } else if (values.url.trim() === "") {
    errors.url = t("mcp.add.error.url")
  }
  return errors.name === undefined && errors.command === undefined && errors.url === undefined
    ? null
    : errors
}

/** The values a form opens with for one server; an unknown declaration opens empty. */
export function valuesOf(declaration: McpDeclaration | null, name: string): ServerFormValues {
  if (declaration === null) {
    return { name, transport: "stdio", command: "", args: "", url: "", pairs: [emptyPair()] }
  }
  if (declaration.transport === "stdio") {
    return {
      name,
      transport: "stdio",
      command: declaration.command,
      args: declaration.args.join(" "),
      url: "",
      pairs: rowsOf(declaration.env),
    }
  }
  return {
    name,
    transport: declaration.transport,
    command: "",
    args: "",
    url: declaration.url,
    pairs: rowsOf(declaration.headers),
  }
}

/** The declaration the form's current values describe. */
export function declarationOf(values: ServerFormValues): McpDeclaration {
  if (values.transport === "stdio") {
    return {
      transport: "stdio",
      command: values.command.trim(),
      args: splitArguments(values.args),
      env: mapOf(values.pairs),
    }
  }
  return {
    transport: values.transport,
    url: values.url.trim(),
    headers: mapOf(values.pairs),
  }
}

/** One blank row, so a section shows the shape of a pair rather than nothing. */
function emptyPair(): McpPair {
  return { name: "", value: "" }
}

/** A map's entries as rows, with one blank row when it holds none. */
function rowsOf(map: Record<string, string>): McpPair[] {
  const rows = Object.entries(map).map(([name, value]) => ({ name, value }))
  return rows.length === 0 ? [emptyPair()] : rows
}

/** The rows as a map, dropping the ones that name nothing. */
function mapOf(rows: McpPair[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows) {
    if (row.name.trim() !== "") map[row.name.trim()] = row.value
  }
  return map
}

/** A labelled section: the small caption above one control group. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11.5px] leading-[1.3] font-semibold tracking-[0.6px] text-muted-soft">
        {label}
      </span>
      {children}
    </div>
  )
}

/** A bordered input on the canvas's 40px field. */
function Field({
  value,
  placeholder,
  onChange,
  mono = false,
  invalid = false,
  className,
}: {
  value: string
  placeholder?: string
  onChange: (value: string) => void
  /** A machine value — a command, an argument list, a URL — which the canvas sets in monospace. */
  mono?: boolean
  /** A value a submit found missing, which the field marks in red. */
  invalid?: boolean
  className?: string
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-10 min-w-0 grow rounded-md border border-border px-3 text-[12.5px] leading-[1.3] text-foreground outline-none placeholder:text-muted-soft focus:border-ring",
        mono && "font-mono",
        invalid && "border-destructive focus:border-destructive",
        className
      )}
    />
  )
}

/** The line under a field a submit found empty, absent while the field is filled. */
function FieldError({ message }: { message: string | undefined }) {
  return message === undefined ? null : <span className={ERROR}>{message}</span>
}

/** A `name` + `value` pair, as the environment and header rows both are. */
function PairRow({
  name,
  value,
  nameLabel,
  valueLabel,
  onName,
  onValue,
  onRemove,
  removeLabel,
}: {
  name: string
  value: string
  nameLabel: string
  valueLabel: string
  onName: (value: string) => void
  onValue: (value: string) => void
  onRemove: () => void
  removeLabel: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      {/* The key column takes 200px while there is room and gives it up first
          when there is not, so the value column stays readable either way. */}
      <Field
        value={name}
        placeholder={nameLabel}
        onChange={onName}
        mono
        className="w-[200px] min-w-[88px] shrink grow-0 basis-[200px]"
      />
      <Field value={value} placeholder={valueLabel} onChange={onValue} />
      <Button
        variant="outline"
        size="icon"
        aria-label={removeLabel}
        onClick={onRemove}
        className="size-10 shrink-0 rounded-md"
      >
        <Trash2Icon className="size-4 text-muted-foreground" />
      </Button>
    </div>
  )
}

/**
 * The form one server is described with. The host decides the frame around it —
 * the add dialog puts it in its own body, the detail pane in a card beside the
 * server's panel — and every field inside is the same in both. The host also
 * owns the values, because its own save button is what hands them on.
 */
export function ServerForm({
  values,
  onChange,
  notice,
  errors = null,
  record,
  onRecord,
  tagSuggestions = [],
}: {
  values: ServerFormValues
  onChange: (values: ServerFormValues) => void
  notice?: string
  /** The messages for every required field the host's last submit found empty. */
  errors?: ServerFormErrors | null
  /** The record's own fields, which a host that edits them elsewhere leaves out. */
  record?: ServerRecordValues
  onRecord?: (record: ServerRecordValues) => void
  /** Every type the servers carry, for the editor's quick picks. */
  tagSuggestions?: readonly string[]
}) {
  const { t } = useI18n()
  const remote = values.transport !== "stdio"
  const pairLabel = t(remote ? "mcp.add.header" : "mcp.add.environment")
  const pairs = values.pairs

  const setPairs = (next: McpPair[]) => onChange({ ...values, pairs: next })

  return (
    <div className="flex flex-col gap-5">
      <Section label={t("mcp.detail.field.name")}>
        <Field
          value={values.name}
          placeholder={t("mcp.add.namePlaceholder")}
          invalid={errors?.name !== undefined}
          onChange={(name) => onChange({ ...values, name })}
        />
        <FieldError message={errors?.name} />
      </Section>

      <Section label={t("mcp.detail.field.transport")}>
        <div className="flex h-9 items-center gap-0.5 rounded-full bg-secondary p-[3px]">
          {TRANSPORTS.map((transport) => (
            <button
              key={transport}
              type="button"
              aria-pressed={values.transport === transport}
              onClick={() => onChange({ ...values, transport })}
              className={cn(
                "flex h-[30px] flex-1 items-center justify-center rounded-full border font-mono text-[12px]",
                values.transport === transport
                  ? cn(
                      "bg-card font-semibold text-foreground",
                      transport === "http" ? "border-transparent" : "border-border"
                    )
                  : "border-transparent font-medium text-muted-foreground"
              )}
            >
              {transport}
            </button>
          ))}
        </div>
        {values.transport === "sse" ? (
          <span className="text-[12px] leading-[1.3] text-muted-foreground">
            {t("mcp.add.sseDeprecated")}
          </span>
        ) : null}
      </Section>

      {/* The description and the types belong to the record, not to the
          declaration the transport picks apart, so they follow the transport
          rather than sitting among the fields a client file is written from. */}
      {record === undefined || onRecord === undefined ? null : (
        <>
          <Section label={t("mcp.add.description")}>
            <Textarea
              value={record.description}
              placeholder={t("mcp.add.descriptionPlaceholder")}
              onChange={(event) => onRecord({ ...record, description: event.target.value })}
              className="min-h-[72px] resize-none rounded-md border-border px-3 py-2.5 text-[12.5px] leading-[1.5] placeholder:text-muted-soft focus-visible:border-ring focus-visible:ring-0 md:text-[12.5px]"
            />
          </Section>
          <Section label={t("mcp.add.tags")}>
            <TagEditor
              tags={record.tags}
              suggestions={tagSuggestions}
              onChange={(tags) => onRecord({ ...record, tags })}
              words={{
                add: t("mcp.detail.tag.add"),
                placeholder: t("mcp.detail.tag.placeholder"),
                remove: t("mcp.detail.tag.remove"),
              }}
            />
          </Section>
        </>
      )}

      {remote ? (
        <Section label={t("mcp.add.url")}>
          <Field
            value={values.url}
            placeholder={t("mcp.add.urlPlaceholder")}
            invalid={errors?.url !== undefined}
            onChange={(url) => onChange({ ...values, url })}
            mono
          />
          <FieldError message={errors?.url} />
        </Section>
      ) : (
        <>
          <Section label={t("mcp.detail.field.command")}>
            <Field
              value={values.command}
              placeholder={t("mcp.add.commandPlaceholder")}
              invalid={errors?.command !== undefined}
              onChange={(command) => onChange({ ...values, command })}
              mono
            />
            <FieldError message={errors?.command} />
          </Section>
          <Section label={t("mcp.detail.field.arguments")}>
            <Field
              value={values.args}
              placeholder={t("mcp.add.argumentsPlaceholder")}
              onChange={(args) => onChange({ ...values, args })}
              mono
            />
            <span className="text-[12px] leading-[1.3] text-muted-foreground">
              {t("mcp.detail.field.argumentsHint")}
            </span>
          </Section>
        </>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex h-7 items-center justify-between">
          <span className="text-[11.5px] leading-[1.3] font-semibold tracking-[0.6px] text-muted-soft">
            {pairLabel}
          </span>
          <Button
            variant="outline"
            className="h-7 gap-1.5 rounded-full px-3 text-[12.5px] font-medium"
            onClick={() => setPairs([...pairs, emptyPair()])}
          >
            <PlusIcon className="size-[13px]" />
            {t(remote ? "mcp.add.addHeader" : "mcp.add.addVariable")}
          </Button>
        </div>
        {pairs.map((pair, index) => (
          <PairRow
            key={index}
            name={pair.name}
            value={pair.value}
            nameLabel={t("mcp.detail.field.variableName")}
            valueLabel={t("mcp.detail.field.variableValue")}
            removeLabel={t("mcp.detail.action.removeVariable")}
            onName={(name) =>
              setPairs(pairs.map((entry, at) => (at === index ? { ...entry, name } : entry)))
            }
            onValue={(value) =>
              setPairs(pairs.map((entry, at) => (at === index ? { ...entry, value } : entry)))
            }
            onRemove={() => {
              const rest = pairs.filter((_, at) => at !== index)
              setPairs(rest.length === 0 ? [emptyPair()] : rest)
            }}
          />
        ))}
        {remote ? (
          <span className="text-[12px] leading-[1.3] text-muted-foreground">
            {t("mcp.add.pairHint")}
          </span>
        ) : null}
      </div>

      {notice === undefined ? null : (
        <div className="flex h-11 items-center gap-2.5 rounded-md border border-notice-border bg-notice-bg px-3.5">
          <InfoIcon className="size-[15px] shrink-0 text-copy" />
          <span className="text-[12.5px] leading-[1.3] text-copy">{notice}</span>
        </div>
      )}
    </div>
  )
}
