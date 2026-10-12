/**
 * The 配置文件 tab: the `mcpServers` object this server installs as, assembled
 * from the hub's own record of it.
 *
 * The client file itself is not what the pane shows. One of them carries every
 * project's settings beside the servers, so a whole file would bury the entry;
 * and the entry is exactly what installation writes, so what a person reads
 * here is what a client file will hold. The rest of a client file belongs to
 * that client, which is why the entry is the pane's whole subject.
 *
 * It is a reading surface: copying is the only action, because editing here
 * would fight the form.
 */
import { CodeCard } from "@workspace/extensions/components"
import { useI18n } from "@workspace/extensions/react"

/** The text this pane shows, assembled by the dialog from the server's record. */
export interface FilesText {
  /** The text itself, written the way a client file holds it. */
  text: string
  /** The path whose extension picks the grammar of {@link FilesText.text}. */
  path: string
}

/** The configuration files pane: the object installation writes, or nothing to show. */
export function FilesPane({ files }: { files: FilesText | null }) {
  const { t } = useI18n()

  if (files === null) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-border bg-card p-5">
        <span className="text-[12.5px] leading-[1.5] text-muted-foreground">
          {t("mcp.detail.files.empty")}
        </span>
      </div>
    )
  }

  return (
    <CodeCard
      path={files.path}
      text={files.text}
      words={{ copy: t("mcp.detail.files.copy"), copied: t("mcp.detail.files.copied") }}
      className="h-full"
    />
  )
}
