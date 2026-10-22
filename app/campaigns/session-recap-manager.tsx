"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { CampaignSessionRecap, SessionRecapPage } from "@/lib/campaigns/session-recaps";
import { SessionRecapMarkdown } from "./session-recap-markdown";
import { formatRecapDate } from "./session-recap-date";
import { MAX_OBSIDIAN_IMPORT_BYTES, parseObsidianSessionRecap } from "@/lib/campaigns/obsidian-recap-import";

type Draft = { date: string; title: string; content: string };
const recapCacheDurationMs = 60_000;
const recapPageCache = new Map<string, { data: SessionRecapPage; savedAt: number }>();
const sessionRecapChangedEvent = "twe:session-recaps-changed";
function cachedPage(campaignId: string) {
  const cached = recapPageCache.get(campaignId);
  return cached && Date.now() - cached.savedAt < recapCacheDurationMs ? cached.data : null;
}
function localToday() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function SessionRecapManager({ campaignId }: { campaignId: string }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SessionRecapPage | null>(() => cachedPage(campaignId));
  const [editing, setEditing] = useState<CampaignSessionRecap | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>({ date: localToday(), title: "", content: "" });
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(() => !cachedPage(campaignId));
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const loadPage = useCallback(async (p: number) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/session-recaps?page=${p}`, { cache: "no-store" });
      const result = await response.json() as SessionRecapPage & { error?: string };
      if (!response.ok || !Array.isArray(result.recaps)) throw new Error(result.error || "Recaps could not be loaded.");
      setData(result); setPage(result.page);
      if (p === 1) recapPageCache.set(campaignId, { data: result, savedAt: Date.now() });
    } catch (err) { setError(err instanceof Error ? err.message : "Recaps could not be loaded."); }
    finally { setLoading(false); }
  }, [campaignId]);

  useEffect(() => {
    // Fetch after mount; keep the list independent of the live encounter session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const cached = cachedPage(campaignId);
    if (cached) { setData(cached); setPage(cached.page); setLoading(false); return; }
    void loadPage(1);
  }, [campaignId, loadPage]);

  function startNew() {
    setEditing("new"); setDraft({ date: localToday(), title: "", content: "" });
    setError(""); setPreview(false); setImportNotice("");
  }

  async function importObsidianNote(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || saving || importing) return;
    setError(""); setImporting(true);
    try {
      if (file.size > MAX_OBSIDIAN_IMPORT_BYTES) {
        throw new Error("That file is too large to import. Choose a Markdown note smaller than 128 KB.");
      }
      const imported = parseObsidianSessionRecap(await file.text(), file.name, localToday());
      // Only fill a new draft; the selected file is never uploaded or saved
      // until the GM explicitly reviews and clicks Save Session Recap.
      setEditing("new");
      setDraft({ date: imported.date, title: imported.title, content: imported.content });
      setPreview(true);
      setImportNotice(imported.dateInferred
        ? `Imported “${file.name}”. No date was found, so today's date is selected. Check the date before saving.`
        : `Imported “${file.name}”. Review the date, title and formatting before saving.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to import this Markdown note.");
    } finally {
      setImporting(false);
    }
  }
  function openRecap(recap: CampaignSessionRecap) {
    setEditing(recap); setDraft({ date: recap.date, title: recap.title, content: recap.content });
    setError(""); setPreview(false); setImportNotice("");
  }
  function cancelEdit() { setEditing(null); setError(""); setPreview(false); setImportNotice(""); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/session-recaps`, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, ...(editing === "new" ? {} : { id: editing.id, updatedAt: editing.updatedAt }) }),
      });
      const result = await response.json() as { recap?: CampaignSessionRecap; error?: string };
      if (!response.ok || !result.recap) throw new Error(result.error || "Could not save the session recap.");
      setEditing(null); setPreview(false); setImportNotice("");
      recapPageCache.delete(campaignId);
      window.dispatchEvent(new CustomEvent(sessionRecapChangedEvent, { detail: { campaignId } }));
      await loadPage(1);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the session recap."); }
    finally { setSaving(false); }
  }

  return <section className="gm-console-section session-recap-manager" aria-labelledby="gm-session-recaps-title">
    <input ref={importFileRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain"
      aria-label="Choose an Obsidian Markdown note" hidden
      onChange={event => void importObsidianNote(event)} />
    {editing ? <>
      <div className="campaign-section-heading">
        <div><p className="campaign-kicker">SESSION JOURNAL</p><h2 id="gm-session-recaps-title">{editing === "new" ? "New Session Recap" : "Edit Session Recap"}</h2></div>
        <button type="button" className="campaign-secondary" disabled={saving} onClick={cancelEdit}>Back to Recaps</button>
      </div>
      {importNotice && <p className="session-recap-import-notice" role="status">{importNotice}</p>}
      <form className="session-recap-form" onSubmit={event => void save(event)}>
        <div className="session-recap-form-fields">
          <label><span>Session date</span><input type="date" required value={draft.date} onChange={event => setDraft(current => ({ ...current, date: event.target.value }))} /></label>
          <label><span>Title</span><input type="text" required maxLength={120} placeholder="What happened this session?" value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></label>
        </div>
        <div className="session-recap-editor-heading"><label htmlFor="session-recap-body">Recap (Markdown)</label><button type="button" className="campaign-quiet" aria-pressed={preview} onClick={() => setPreview(v => !v)}>{preview ? "Edit Markdown" : "Preview Markdown"}</button></div>
        {preview ? <div className="session-recap-editor-preview" aria-label="Markdown preview"><SessionRecapMarkdown content={draft.content} /></div>
          : <textarea id="session-recap-body" required rows={14} maxLength={30000} value={draft.content}
              placeholder={"## The adventure continues…\n\n- A discovery\n- An unexpected encounter\n\n**Next time:** …"}
              onChange={event => setDraft(current => ({ ...current, content: event.target.value }))} />}
        <p className="session-recap-editor-help">Markdown supports headings, **bold**, *italic*, lists, links, tables, quotes and code. Players see the formatted recap after you save it.</p>
        {error && <p className="campaign-error" role="alert">{error}</p>}
        <div className="session-recap-form-actions"><button type="submit" className="campaign-primary" disabled={saving || !draft.date || !draft.title.trim() || !draft.content.trim()}>{saving ? "Saving…" : "Save Session Recap"}</button><button type="button" className="campaign-secondary" disabled={saving} onClick={cancelEdit}>Cancel</button></div>
      </form>
    </> : <>
      <div className="campaign-section-heading">
        <div><p className="campaign-kicker">CAMPAIGN JOURNAL</p><h2 id="gm-session-recaps-title">Session Recaps</h2></div>
        <div className="session-recap-heading-actions">
          <button type="button" className="campaign-secondary" disabled={importing || loading}
            onClick={() => importFileRef.current?.click()}>{importing ? "Importing…" : "Import from Obsidian"}</button>
          <button type="button" className="campaign-primary" onClick={startNew}>New Session</button>
        </div>
      </div>
      <p className="session-recap-import-help">Import an existing Markdown note (.md) from your Obsidian vault using your device’s file picker.</p>
      {error && <p className="campaign-error" role="alert">{error}</p>}
      {loading && <p className="campaign-empty-copy" role="status">Loading session recaps…</p>}
      {!loading && !data?.recaps.length && <p className="campaign-empty-copy">No session recaps yet. Select New Session to record the first one.</p>}
      {!loading && data && <div className="session-recap-cards">{data.recaps.map(recap =>
        <button type="button" className="session-recap-card" key={recap.id} onClick={() => openRecap(recap)}>
          <span className="session-recap-card-date">{formatRecapDate(recap.date)}</span>
          <strong>{recap.title}</strong><span className="session-recap-card-action">Open & edit →</span>
        </button>)}</div>}
      {!loading && data && data.totalPages > 1 && <nav className="session-recap-pagination" aria-label="Session recap pages">
        <button type="button" className="campaign-secondary" aria-label="Previous recaps page" disabled={page <= 1} onClick={() => void loadPage(page - 1)}>‹</button>
        <span>Page {page} / {data.totalPages}</span>
        <button type="button" className="campaign-secondary" aria-label="Next recaps page" disabled={page >= data.totalPages} onClick={() => void loadPage(page + 1)}>›</button>
      </nav>}
    </>}
  </section>;
}
