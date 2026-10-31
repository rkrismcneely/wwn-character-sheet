"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { CampaignSessionRecap, SessionRecapPage } from "@/lib/campaigns/session-recaps";
import { SessionRecapMarkdown } from "./session-recap-markdown";
import { formatRecapDate } from "./session-recap-date";
import { SessionRecapRecordingSetup } from "./session-recap-recording-setup";
import { SessionRecapAudioUploader } from "./session-recap-audio-uploader";
import { SessionRecapFullTranscriptManager } from "./session-recap-full-transcript-manager";
import { SessionRecapTranscriptionOptions } from "./session-recap-transcription-options";
import { SessionRecapAIWriter } from "./session-recap-ai-writer";
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
  const [createMethod, setCreateMethod] = useState<"manual" | "recording">("recording");
  const [loading, setLoading] = useState(() => !cachedPage(campaignId));
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [addingToJournal,setAddingToJournal]=useState(false);
  const [transcriptRefresh,setTranscriptRefresh]=useState(0);
  const [journalNotice,setJournalNotice]=useState("");
  const [importNotice, setImportNotice] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [uploadBusy,setUploadBusy] = useState(false);
  const trackUploadBusy = useCallback((active:boolean)=>setUploadBusy(active),[]);

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
    if (cachedPage(campaignId)) return;
    const timer = window.setTimeout(() => void loadPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [campaignId, loadPage]);

  function startNew() {
    setEditing("new"); setCreateMethod("recording"); setDraft({ date: localToday(), title: "", content: "" });
    setError(""); setPreview(false); setImportNotice(""); setJournalNotice("");
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
      setEditing("new"); setCreateMethod("manual");
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
  async function addToJournal(){
    if(!editing||editing==="new"||!editing.isPublished||saving||addingToJournal)return;
    setAddingToJournal(true);setError("");setJournalNotice("");
    try{
      const url="/api/campaigns/"+encodeURIComponent(campaignId)+"/journal";
      const response=await fetch(url,{cache:"no-store"});
      const data=await response.json() as {entries?:{id:string;kind:string;title:string;icon?:string;parentId?:string|null;content:string}[];error?:string};
      if(!response.ok||!Array.isArray(data.entries))throw new Error(data.error||"Journal could not be loaded.");
      const marker="<!-- twe-session-recap:"+editing.id+" -->";
      const duplicate=data.entries.find(entry=>entry.kind==="page"&&entry.content.includes(marker));
      if(duplicate){setJournalNotice("Already in the Journal as “"+duplicate.title+"”.");return;}
      const folder=data.entries.find(entry=>entry.kind==="folder"&&entry.icon==="twe-role:session notes")??data.entries.find(entry=>entry.kind==="folder"&&entry.title.trim().toLowerCase()==="session notes");
      if(!folder)throw new Error("Choose a Session Notes folder category in the Journal before adding this recap.");
      const created=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"page",title:editing.date.slice(2)+" — "+editing.title,content:marker+"\n\n"+editing.content,visibility:"gm",icon:"calendar-days",...(folder?{parentId:folder.id}:{})})});
      const result=await created.json() as {entry?:{id:string};error?:string};
      if(!created.ok||!result.entry)throw new Error(result.error||"Could not add recap to Journal.");
      setJournalNotice(folder?"Added to the Journal under "+folder.title+".":"Added to the Journal.");
      window.dispatchEvent(new CustomEvent("twe:campaign-data-changed",{detail:{campaignId,area:"journal"}}));
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not add recap to Journal.");}
    finally{setAddingToJournal(false);}
  }
  function cancelEdit() {
    if(uploadBusy) return;
    setEditing(null); setError(""); setPreview(false); setImportNotice("");
    recapPageCache.delete(campaignId);
    void loadPage(1);
  }

  async function createRecordingDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !draft.date || !draft.title.trim()) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/campaigns/" + encodeURIComponent(campaignId) + "/session-recaps", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({date:draft.date,title:draft.title,draftOnly:true}),
      });
      const result = await response.json() as {recap?:CampaignSessionRecap;error?:string};
      if (!response.ok || !result.recap || result.recap.isPublished)
        throw new Error(result.error || "Could not create a private recording draft.");
      setEditing(result.recap);
      setDraft({date:result.recap.date,title:result.recap.title,content:""});
      setImportNotice("Private draft created. Attach your recording below. Only campaign GMs can see this draft until you publish an approved recap.");
      recapPageCache.delete(campaignId);
      void loadPage(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a private recording draft.");
    } finally { setSaving(false); }
  }

  async function save(event?: FormEvent<HTMLFormElement>,publish=true) {
    event?.preventDefault();
    if (!editing || saving || uploadBusy || (!publish && (editing==="new"||editing.isPublished))) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/session-recaps`, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, ...(editing === "new" ? {} : { id: editing.id, updatedAt: editing.updatedAt, publish }) }),
      });
      const result = await response.json() as { recap?: CampaignSessionRecap; error?: string };
      if (!response.ok || !result.recap) throw new Error(result.error || "Could not save the session recap.");
      if(!publish){
        setEditing(result.recap);
        setImportNotice("Private recap draft saved. It is still hidden from players.");
        recapPageCache.delete(campaignId);
        void loadPage(1);
        return;
      }
      setEditing(null); setPreview(false); setImportNotice("");
      recapPageCache.delete(campaignId);
      window.dispatchEvent(new CustomEvent(sessionRecapChangedEvent, { detail: { campaignId } }));
      window.dispatchEvent(new CustomEvent("twe:campaign-data-changed",{detail:{campaignId,area:"journal"}}));
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
        <div><p className="campaign-kicker">SESSION JOURNAL</p><h2 id="gm-session-recaps-title">{editing === "new" ? "New Session Recap" : editing.isPublished ? "Edit Session Recap" : "Private Recording Draft"}</h2></div>
        <div className="session-recap-heading-actions">{editing!=="new"&&editing.isPublished&&<button type="button" className="campaign-secondary" disabled={saving||addingToJournal} onClick={()=>void addToJournal()}>{addingToJournal?"Adding…":"Add to Journal"}</button>}<button type="button" className="campaign-secondary" disabled={saving||uploadBusy} title={uploadBusy?"Stop the recording upload before leaving.":undefined} onClick={cancelEdit}>Back to Recaps</button></div>
      </div>
      {importNotice && <p className="session-recap-import-notice" role="status">{importNotice}</p>}
      {journalNotice&&<p className="session-recap-import-notice" role="status">{journalNotice}</p>}
      {editing === "new" && <div className="session-recap-creation-method" role="group" aria-label="Create recap from">
        <button type="button" className={createMethod === "manual" ? "campaign-primary" : "campaign-secondary"} onClick={() => setCreateMethod("manual")}>Write recap</button>
        <button type="button" className={createMethod === "recording" ? "campaign-primary" : "campaign-secondary"} onClick={() => setCreateMethod("recording")}>Recap from recording</button>
      </div>}
      {editing !== "new"&&!editing.isPublished&&<>
        <p className="session-recap-import-notice" role="status">
          This recording draft is private. Upload a recording first, then write or save
          your recap when ready. No audio is submitted to AI by attaching it.
        </p>
        <SessionRecapAudioUploader key={editing.id} campaignId={campaignId}
          recapId={editing.id} onBusyChange={trackUploadBusy}/>
      </>}
      {editing === "new" && createMethod === "recording"
        ? <form className="session-recap-form" onSubmit={event=>void createRecordingDraft(event)}>
            <h3>Recap Only — start with a recording</h3>
            <p className="session-recap-editor-help">
              Create a private draft, then upload your full mixed MP3/M4A/WAV/FLAC/AAC
              recording straight to your own Google Drive. No transcript or separate
              Craig tracks are required. Direct AI audio summarization is being added
              next; creating this draft does not send audio to any AI provider.
            </p>
            <div className="session-recap-form-fields">
              <label><span>Session date</span><input type="date" required value={draft.date}
                onChange={event=>setDraft(current=>({...current,date:event.target.value}))}/></label>
              <label><span>Working title</span><input type="text" required maxLength={120}
                placeholder="Session recording" value={draft.title}
                onChange={event=>setDraft(current=>({...current,title:event.target.value}))}/></label>
            </div>
            {error&&<p className="campaign-error" role="alert">{error}</p>}
            <button type="submit" className="campaign-primary"
              disabled={saving||!draft.date||!draft.title.trim()}>
              {saving?"Creating…":"Create private recording draft"}
            </button>
          </form>
        : <form className="session-recap-form" onSubmit={event => void save(event)}>
        <div className="session-recap-form-fields">
          <label><span>Session date</span><input type="date" required value={draft.date} onChange={event => setDraft(current => ({ ...current, date: event.target.value }))} /></label>
          <label><span>Title</span><input type="text" required maxLength={120} placeholder="What happened this session?" value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></label>
        </div>
        <div className="session-recap-editor-heading"><label htmlFor="session-recap-body">Recap (Markdown)</label><button type="button" className="campaign-quiet" aria-pressed={preview} onClick={() => setPreview(v => !v)}>{preview ? "Edit Markdown" : "Preview Markdown"}</button></div>
        {preview ? <div className="session-recap-editor-preview" aria-label="Markdown preview"><SessionRecapMarkdown content={draft.content} /></div>
          : <textarea id="session-recap-body" required rows={14} maxLength={30000} value={draft.content}
              placeholder={"## The adventure continues…\n\n- A discovery\n- An unexpected encounter\n\n**Next time:** …"}
              onChange={event => setDraft(current => ({ ...current, content: event.target.value }))} />}
        <p className="session-recap-editor-help">{editing!=="new"&&!editing.isPublished
          ? "This draft is private. Review your recap before publishing; only publishing makes it visible to players."
          : "Markdown supports headings, **bold**, *italic*, lists, links, tables, quotes and code. Saving publishes this recap to campaign members."}</p>
        {error && <p className="campaign-error" role="alert">{error}</p>}
        <div className="session-recap-form-actions"><button type="submit" className="campaign-primary" disabled={saving || !draft.date || !draft.title.trim() || !draft.content.trim()}>{saving ? "Saving…" : editing!=="new"&&!editing.isPublished ? "Publish approved recap" : "Save Session Recap"}</button><button type="button" className="campaign-secondary" disabled={saving} onClick={cancelEdit}>Cancel</button></div>
      </form>}
      {editing !== "new" && <>
        {!editing.isPublished&&<p className="session-recap-import-notice" role="status">
          Private GM draft: store your session audio below, then come back to publish
          an approved recap. No audio is sent to AI just by uploading it.
        </p>}
        <SessionRecapAudioUploader key={editing.id} campaignId={campaignId} recapId={editing.id} />
        <details className="session-recap-reading">
          <summary>Advanced: Craig speaker tracks and full transcripts (optional)</summary>
          <p className="campaign-empty-copy">
            These older tools remain available, but are not needed for a Recap Only workflow.
            External AI processing can consume your provider&apos;s own quota.
          </p>
          <SessionRecapRecordingSetup campaignId={campaignId} date={editing.date} onBack={cancelEdit}/>
          <SessionRecapTranscriptionOptions key={"providers-"+editing.id} campaignId={campaignId}
            recapId={editing.id} onSaved={()=>setTranscriptRefresh(n=>n+1)} />
          <SessionRecapFullTranscriptManager key={"transcript-"+editing.id+"-"+transcriptRefresh}
            campaignId={campaignId} recapId={editing.id} />
          <SessionRecapAIWriter key={"ai-"+editing.id} campaignId={campaignId} recapId={editing.id}
            onDraft={content=>{
              if(draft.content.trim() && !window.confirm("Replace the unsaved Markdown editor text with this AI draft?"))return false;
              setDraft(current=>({...current,content}));setPreview(false);
              setImportNotice("AI draft added to the editor. Review it and publish the recap when satisfied.");
              return true;
            }}/>
        </details>
      </>}
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
          <strong>{recap.title}</strong>
          {!recap.isPublished&&<span className="campaign-empty-copy">Private GM draft · not visible to players</span>}
          <span className="session-recap-card-action">{recap.isPublished?"Open & edit":"Continue private draft"} →</span>
        </button>)}</div>}
      {!loading && data && data.totalPages > 1 && <nav className="session-recap-pagination" aria-label="Session recap pages">
        <button type="button" className="campaign-secondary" aria-label="Previous recaps page" disabled={page <= 1} onClick={() => void loadPage(page - 1)}>‹</button>
        <span>Page {page} / {data.totalPages}</span>
        <button type="button" className="campaign-secondary" aria-label="Next recaps page" disabled={page >= data.totalPages} onClick={() => void loadPage(page + 1)}>›</button>
      </nav>}
    </>}
  </section>;
}
