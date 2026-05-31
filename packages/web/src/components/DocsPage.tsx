import { useCallback, useEffect, useState } from "react";
import {
  getArtifact,
  listArtifacts,
  type ArtifactSummary,
} from "../api/docs";
import { Button, CodeBlock, Drawer, EmptyState, PageHeader } from "../ui";
import * as appCss from "../app/App.css";
import * as css from "./RunsConsole.css";

/**
 * Docs page (MIN-33). Lists the generated plan artifacts and, on selection,
 * shows the artifact's content in a side Drawer (rendered verbatim via
 * CodeBlock). Satisfies "user can open generated plan docs". Recovery-first:
 * HTTP load on mount.
 */
export function DocsPage() {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [openName, setOpenName] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setArtifacts(await listArtifacts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load docs");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDoc = useCallback(async (name: string) => {
    setOpenName(name);
    setContent(null);
    setError(null);
    try {
      const doc = await getArtifact(name);
      setContent(doc.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open doc");
    }
  }, []);

  return (
    <div className={appCss.pageBody}>
      <PageHeader
        eyebrow="Workspace"
        title="Docs"
        description="Generated plan documents, versioned per ticket."
      />

      {error ? (
        <p role="alert" className={css.errorText}>
          {error}
        </p>
      ) : null}

      {artifacts.length === 0 ? (
        <EmptyState
          title="No docs yet"
          description="Approved and proposed plans are written here as documents."
        />
      ) : (
        <div className={css.list} data-testid="docs-list">
          {artifacts.map((a) => (
            <button
              key={a.relPath}
              type="button"
              className={css.runRow}
              data-testid={`doc-row-${a.name}`}
              aria-label={a.name}
              onClick={() => void openDoc(a.name)}
            >
              <span className={css.runRowMain}>
                <span className={css.runRowTitle}>{a.name}</span>
                <span className={css.runRowMeta}>
                  {a.ticketId ? <span>ticket {a.ticketId}</span> : null}
                  {typeof a.version === "number" ? (
                    <span>v{a.version}</span>
                  ) : null}
                  <span>{a.modifiedAt}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <Drawer open={!!openName} onClose={() => setOpenName(null)} title={openName ?? undefined}>
        {openName ? (
          <section className={css.detail} aria-label="Doc content">
            {content === null ? (
              error ? null : (
                <p>Loading…</p>
              )
            ) : (
              <CodeBlock code={content} />
            )}
            <div className={css.actionRow}>
              <Button onClick={() => setOpenName(null)}>Close</Button>
            </div>
          </section>
        ) : null}
      </Drawer>
    </div>
  );
}
