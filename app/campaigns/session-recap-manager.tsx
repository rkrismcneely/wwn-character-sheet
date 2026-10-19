"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CampaignSessionRecap, SessionRecapPage } from "@/lib/campaigns/session-recaps";
import { SessionRecapMarkdown } from "./session-recap-markdown";
import { formatRecapDate } from "./session-recap-date";

type Draft = { date: string; title: string; content: string };
function localToday() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function SessionRecapManager({ campaignId }: { campaignId: string }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SessionRecapPage | null>(null);
  const [editing, setEditing] = useState<CampaignSessionRecap | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>({ date: localToday(), title: "", content: "" });
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadPage = useCallback(async (p: number) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/session-recaps?page=${p}`, { cache: "no-store" });
      const result = await response.json() as SessionRecapPage & { error?: string };
      if (!response.ok || !Array.isArray(result.recaps)) throw new Error(result.error || "Recaps could not be loaded.");
      setData(result); setPage(result.page);
    } catch (err) { setError(err instanceof Error ? err.message : "Recaps could not be loaded."); }
    finally { setLoading(false); }
  }, [campaignId]);

  useEffect(() => {
    // Fetch after mount; keep the list independent of the live encounter session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPage(1);
  }, [loadPage]);

  function startNew() {
    setEditing("new"); setDraft({ date: localToday(), title: "", content: "" }); setError(""); setPreview(false);
  }
  function openRecap(recap: CampaignSessionRecap) {
    setEditing(recap); setDraft({ date: recap.date, title: recap.title, content: recap.content }); setError(""); setPreview(false);
  }
  function cancelEdit() { setEditing(null); setError(""); setPreview(false); }

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
      setEditing(null); setPreview(false);
      await loadPage(1);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the session recap."); }
    finally { setSaving(false); }
  }

  return <section className="gm-console-section session-recap-manager" aria-labelledby="gm-session-recaps-title">
    {editing ? <>
      <div className="campaign-section-heading">
        <div><p className="campaign-kicker">SESSION JOURNAL</p><h2 id="gm-session-recaps-title">{editing === "new" ? "New Session Recap" : "Edit Session Recap"}</h2></div>
        <button type="button" className="campaign-secondary" disabled={saving} onClick={cancelEdit}>Back to Recaps</button>
      </div>
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
        <button type="button" className="campaign-primary" onClick={startNew}>New Session</button>
      </div>
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
