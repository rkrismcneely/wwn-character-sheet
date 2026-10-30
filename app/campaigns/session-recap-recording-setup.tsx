"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { RecapSpeakerAssociation, RecapRecordingImport } from "@/lib/campaigns/recap-imports";
import type { RecapSpeakerRole } from "@/lib/campaigns/recap-import-validation";

type CharacterChoice = { id: string; name: string };
type Draft = {
  id?: string; discordUserId: string; discordName: string;
  displayName: string; role: RecapSpeakerRole; characterId: string; characterName: string;
};
const blank: Draft = {
  discordUserId: "", discordName: "", displayName: "",
  role: "player", characterId: "", characterName: "",
};
async function receive(response: Response) {
  const data = await response.json() as { error?: string; recording?: RecapRecordingImport };
  if (!response.ok) throw new Error(data.error || "Recording setup could not be saved.");
  return data;
}

export function SessionRecapRecordingSetup({ campaignId, date, onBack }: {
  campaignId: string; date: string; onBack: () => void;
}) {
  const api = "/api/campaigns/" + encodeURIComponent(campaignId);
  const [speakers, setSpeakers] = useState<RecapSpeakerAssociation[]>([]);
  const [imports, setImports] = useState<RecapRecordingImport[]>([]);
  const [characters, setCharacters] = useState<CharacterChoice[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [link, setLink] = useState("");
  const [craigSpeakers, setCraigSpeakers] = useState<{discordUserId:string|null;discordName:string;displayName:string|null;track:number|null}[] | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [sessionDate, setSessionDate] = useState(date);
  const [activeImport, setActiveImport] = useState<string | null>(null);
  const [trackSpeakerChoices, setTrackSpeakerChoices] = useState<Record<number,string>>({});
  const [inspectedTracks, setInspectedTracks] = useState<{ recordingId: string; entries: { filename: string; uncompressedBytes: number }[] } | null>(null);
  const [reviewTranscript, setReviewTranscript] = useState<{ recordingId: string; segments: { startMs: number; endMs: number; text: string; speakerName: string; characterName: string | null; trackIndex: number }[] } | null>(null);
  const [craigInfo, setCraigInfo] = useState<{ recordingId: string; info: string } | null>(null);
  const [craigJob, setCraigJob] = useState<{status:string;format:string|null;outputReady:boolean;outputSize:number|null}|null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(api + "/recap-imports", { cache: "no-store" });
    const data = await response.json() as { speakers?: RecapSpeakerAssociation[]; imports?: RecapRecordingImport[]; error?: string };
    if (!response.ok || !data.speakers || !data.imports) throw new Error(data.error || "Recording setup could not be loaded.");
    setSpeakers(data.speakers);
    setImports(data.imports);
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all([
      refresh(),
      fetch(api + "/characters").then(async response => {
        if (!response.ok) return;
        const data = await response.json() as { characters?: CharacterChoice[] };
        if (!cancelled) setCharacters(data.characters || []);
      }),
    ]).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load setup."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, refresh]);

  function editSpeaker(speaker: RecapSpeakerAssociation) {
    setDraft({ id: speaker.id, discordUserId: speaker.discordUserId || "",
      discordName: speaker.discordName, displayName: speaker.displayName, role: speaker.role,
      characterId: speaker.characterId || "", characterName: speaker.characterName || "" });
    setError(""); setNotice("");
  }

  async function saveSpeaker(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await receive(await fetch(api + "/recap-speakers", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      }));
      await refresh(); setDraft(blank);
      setNotice("Speaker association saved for this campaign.");
    } catch (err) { setError(err instanceof Error ? err.message : "Speaker could not be saved."); }
    finally { setBusy(false); }
  }

  async function removeSpeaker(id: string) {
    if (busy || !window.confirm("Remove this saved speaker? Confirmed past recordings keep their original assignments.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await receive(await fetch(api + "/recap-speakers", {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
      }));
      await refresh(); setDraft(blank);
      setSelectedIds(ids => ids.filter(value => value !== id));
      setNotice("Saved association removed; recording history remains unchanged.");
    } catch (err) { setError(err instanceof Error ? err.message : "Speaker could not be removed."); }
    finally { setBusy(false); }
  }

  async function checkCraigRecording() {
    if (busy || !link.trim()) return;
    setBusy(true); setError(""); setNotice(""); setCraigSpeakers(null);
    try {
      const response = await fetch(api + "/recap-imports/craig-check", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ link }),
      });
      const result = await response.json() as { error?: string; speakers?: {discordUserId:string|null;discordName:string;displayName:string|null;track:number|null}[]; live?: boolean };
      if (!response.ok || !result.speakers) throw new Error(result.error || "Craig metadata unavailable.");
      setCraigSpeakers(result.speakers);
      setNotice(result.live ? "Recording is still live. Import after it ends." : "Craig recording found. Review the speakers below before saving.");
    } catch (error) { setError(error instanceof Error ? error.message : "Craig recording could not be checked."); }
    finally { setBusy(false); }
  }

  async function uploadRecording(event: FormEvent) {
    event.preventDefault();
    if (busy || !audioFile) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (audioFile.size > 90 * 1024 * 1024) throw new Error("Use a file under 90 MB. Larger recordings will be supported with resumable uploads.");
      const response = await fetch(api + "/recap-imports/audio", {
        method: "POST",
        headers: { "content-type": audioFile.type || (audioFile.name.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : audioFile.name.toLowerCase().endsWith(".m4a") ? "audio/mp4" : "audio/wav"),
          "x-recap-filename": audioFile.name, "x-recap-date": sessionDate },
        body: audioFile,
      });
      const result = await receive(response);
      setAudioFile(null);
      await refresh();
      setActiveImport(result.recording?.id ?? null);
      setSelectedIds([]);
      setNotice("Audio saved privately. Confirm the speakers before transcription becomes available.");
    } catch (err) { setError(err instanceof Error ? err.message : "Audio upload failed."); }
    finally { setBusy(false); }
  }

  async function saveRecording(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await receive(await fetch(api + "/recap-imports", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceType: "craig", link, sessionDate }),
      }));
      setLink(""); await refresh();
      setActiveImport(result.recording?.id ?? null);
      setSelectedIds([]);
      setNotice("Recording link saved privately. Confirm the speakers below to make it ready for future processing.");
    } catch (err) { setError(err instanceof Error ? err.message : "Recording could not be saved."); }
    finally { setBusy(false); }
  }

  async function confirmSpeakers() {
    if (busy || !activeImport || selectedIds.length === 0) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await receive(await fetch(api + "/recap-imports", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ importId: activeImport, associationIds: selectedIds }),
      }));
      await refresh();
      setNotice("Speakers confirmed and saved with this recording. Transcription will be added in a later phase.");
    } catch (err) { setError(err instanceof Error ? err.message : "Speakers could not be confirmed."); }
    finally { setBusy(false); }
  }

  async function runCraigJob(method: "GET" | "POST", recordingId: string, format: "aac" | "flac" = "aac") {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const url = api + "/recap-imports/craig-job" + (method === "GET" ? "?importId=" + encodeURIComponent(recordingId) : "");
      const response = await fetch(url, {
        method,
        ...(method === "POST" ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ importId: recordingId }) } : {}),
      });
      const result = await response.json() as { job?: {status:string;outputReady:boolean;outputSize:number|null}|null; error?:string };
      if (!response.ok) throw new Error(result.error || "Craig job unavailable.");
      setCraigJob(result.job ?? null);
      setNotice(result.job ? "Craig conversion status: " + result.job.status + (result.job.outputReady ? ". Audio is ready for the future download step." : ".") : "No Craig conversion job is active.");
    } catch (err) { setError(err instanceof Error ? err.message : "Craig job could not be checked."); }
    finally { setBusy(false); }
  }

  async function saveTrackSpeakers(recordingId: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const confirmed = imports.find(item => item.id === recordingId)?.speakerIds || [];
      const assignments = Object.entries(trackSpeakerChoices).filter(([, speakerId]) => Boolean(speakerId))
        .map(([index, speakerId]) => {
          const speaker = speakers.find(item => item.id === speakerId && confirmed.includes(item.id));
          if (!speaker) throw new Error("Confirm the selected speakers on this recording first.");
          return { index: Number(index), discordName: speaker.discordName };
        });
      const response = await fetch(api + "/recap-imports/craig-track-speakers?importId=" + encodeURIComponent(recordingId), {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const result = await response.json() as {error?: string; assignments?: unknown[]};
      if (!response.ok) throw new Error(result.error || "Track assignments could not be saved.");
      setNotice("Saved " + (result.assignments?.length || 0) + " track-to-speaker associations for this recording.");
    } catch (error) { setError(error instanceof Error ? error.message : "Track associations could not be saved."); }
    finally { setBusy(false); }
  }

  async function loadCraigInfo(recordingId: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(api + "/recap-imports/craig-info?importId=" + encodeURIComponent(recordingId), {cache:"no-store"});
      const data = await response.json() as {info?:string;error?:string};
      if (!response.ok || typeof data.info !== "string") throw new Error(data.error || "Craig notes unavailable.");
      setCraigInfo({recordingId,info:data.info});
    } catch(error) { setError(error instanceof Error ? error.message : "Craig notes unavailable."); }
    finally { setBusy(false); }
  }

  async function loadTranscript(recordingId: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(api + "/recap-imports/transcript?importId=" + encodeURIComponent(recordingId), { cache: "no-store" });
      const result = await response.json() as { segments?: { startMs:number; endMs:number; text:string; speakerName:string; characterName:string|null; trackIndex:number }[]; error?:string };
      if (!response.ok || !Array.isArray(result.segments)) throw new Error(result.error || "Transcript unavailable.");
      setReviewTranscript({ recordingId, segments: result.segments });
      setNotice(result.segments.length ? "Showing the saved timestamped transcript." : "No transcript segments saved for this recording yet.");
    } catch (error) { setError(error instanceof Error ? error.message : "Transcript could not be loaded."); }
    finally { setBusy(false); }
  }

  function transcriptTime(ms: number) {
    const seconds = Math.floor(ms / 1000);
    return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
      .map(value => String(value).padStart(2, "0")).join(":");
  }

  async function transcribeShortTrack(recordingId: string, entryIndex: number) {
    if (busy || !window.confirm("Transcribe this short track with Cloudflare Workers AI? This uses your Workers AI quota and may incur usage charges on a paid Cloudflare account.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(api + "/recap-imports/transcribe-short", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ importId: recordingId, entryIndex }),
      });
      const result = await response.json() as { saved?: boolean; added?: number; error?: string };
      if (!response.ok || !result.saved) throw new Error(result.error || "Transcription failed.");
      setNotice("Saved " + (result.added || 0) + " timestamped speech segments. Existing other tracks remain intact.");
    } catch (error) { setError(error instanceof Error ? error.message : "Transcription failed."); }
    finally { setBusy(false); }
  }

  async function extractCraigTrack(recordingId: string, entryIndex: number) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(api + "/recap-imports/craig-extract", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ importId: recordingId, entryIndex }),
      });
      const result = await response.json() as { extracted?: boolean; filename?: string; error?: string };
      if (!response.ok || !result.extracted) throw new Error(result.error || "Track extraction failed.");
      setNotice("Private audio track extracted: " + result.filename + ". It is ready for future transcription.");
    } catch (error) { setError(error instanceof Error ? error.message : "Track extraction failed."); }
    finally { setBusy(false); }
  }

  async function inspectCraigArchive(recordingId: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(api + "/recap-imports/craig-manifest?importId=" + encodeURIComponent(recordingId), { cache: "no-store" });
      const result = await response.json() as { entries?: { filename: string; uncompressedBytes: number }[]; error?: string };
      if (!response.ok || !result.entries) throw new Error(result.error || "Craig track inventory unavailable.");
      setInspectedTracks({ recordingId, entries: result.entries });
      const prior = await fetch(api + "/recap-imports/craig-track-speakers?importId=" + encodeURIComponent(recordingId), { cache: "no-store" });
      if (prior.ok) {
        const data = await prior.json() as { assignments?: {index:number;discordName:string}[] };
        const chosen: Record<number,string> = {};
        for (const row of data.assignments || []) {
          const match = speakers.find(item => item.discordName === row.discordName);
          if (match) chosen[row.index] = match.id;
        }
        setTrackSpeakerChoices(chosen);
      }
      setNotice("Archive inspected. Choose a FLAC track below to extract it.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to inspect Craig archive."); }
    finally { setBusy(false); }
  }

  async function transferCraigArchive(recordingId: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(api + "/recap-imports/craig-transfer", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ importId: recordingId }),
      });
      const result = await response.json() as { saved?: boolean; bytes?: number; error?: string };
      if (!response.ok || !result.saved) throw new Error(result.error || "Craig archive transfer failed.");
      setNotice("Craig archive saved privately (" + Math.round((result.bytes || 0) / 1048576) + " MB). Audio extraction will come next.");
    } catch (error) { setError(error instanceof Error ? error.message : "Archive transfer failed."); }
    finally { setBusy(false); }
  }

  function chooseRecording(recording: RecapRecordingImport) {
    setActiveImport(recording.id);
    setCraigJob(null);
    setSelectedIds(recording.speakerIds);
    setNotice(""); setError("");
  }

  return <div className="session-recap-recording-setup">
    <div className="campaign-section-heading">
      <div><p className="campaign-kicker">RECORDING SETUP</p><h3>Import a Session Recording</h3></div>
      <button type="button" className="campaign-secondary" onClick={onBack}>Back to Recaps</button>
    </div>
    <p>Save a Craig link or upload audio, then confirm the participants. Transcription and automatic summaries are coming in later phases.</p>
    <form className="session-recap-form" onSubmit={event => void saveRecording(event)}>
      <div className="session-recap-form-fields">
        <label><span>Session date</span><input type="date" required value={sessionDate} onChange={event => setSessionDate(event.target.value)}/></label>
        <label><span>Craig recording link</span><input type="url" required value={link} placeholder="https://craig.horse/rec/..." onChange={event => setLink(event.target.value)} autoComplete="off"/></label>
      </div>
      <div className="session-recap-form-actions">
        <button type="button" className="campaign-secondary" disabled={busy || !link.trim()} onClick={() => void checkCraigRecording()}>Check Craig Recording</button>
        <button type="submit" className="campaign-primary" disabled={busy || !link.trim()}>Save Recording Link</button>
      </div>
      {craigSpeakers && <div className="session-recap-speaker-list" aria-label="Craig detected speakers">
        <strong>{craigSpeakers.length} speaker(s) detected</strong>
        {craigSpeakers.map((speaker, index) => {
          const matched = speakers.find(saved => speaker.discordUserId
            ? saved.discordUserId === speaker.discordUserId
            : saved.discordName.toLowerCase() === speaker.discordName.toLowerCase());
          return <div className="session-recap-speaker-entry" key={speaker.discordUserId || speaker.discordName + index}>
            <span>{speaker.displayName || speaker.discordName}{speaker.track !== null ? " · Track " + speaker.track : ""}</span>
            {matched ? <span>Recognized: {matched.displayName}</span>
              : <button type="button" className="campaign-secondary" onClick={() => setDraft({
                  ...blank, discordUserId: speaker.discordUserId || "", discordName: speaker.discordName,
                  displayName: speaker.displayName || speaker.discordName,
                })}>Remember this speaker</button>}
          </div>;
        })}
      </div>}
    </form>
    <form className="session-recap-form" onSubmit={event => void uploadRecording(event)}>
      <label><span>Or upload MP3, M4A or WAV</span><input type="file" accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav" onChange={event => setAudioFile(event.target.files?.[0] || null)}/></label>
      <p className="session-recap-editor-help">Audio is saved privately in temporary TWE storage (up to 90 MB). Larger recordings and Google Drive storage will be added in later phases.</p>
      <div className="session-recap-form-actions"><button type="submit" className="campaign-primary" disabled={busy || !audioFile}>Save Audio Recording</button></div>
    </form>
    <p className="session-recap-editor-help">Craig recording keys stay private. Direct Craig downloading and transcription are not enabled yet.</p>

    <h3>Saved Speaker Associations</h3>
    <p className="session-recap-editor-help">Associate each Discord user with a real person, guest or GM. Optionally assign a campaign character. The GM can portray multiple NPCs without assigning each one.</p>
    {loading && <p role="status">Loading speaker associations…</p>}
    {!loading && <div className="session-recap-speaker-list">
      {speakers.map(speaker => <div className="session-recap-speaker-entry" key={speaker.id}>
        <div><strong>{speaker.discordName}</strong> · {speaker.displayName} ({speaker.role})
          {speaker.characterId && <span> · {characters.find(char => char.id === speaker.characterId)?.name || "Linked character"}</span>}
          {speaker.characterName && <span> · {speaker.characterName}</span>}</div>
        <div><button type="button" className="campaign-quiet" onClick={() => editSpeaker(speaker)}>Edit</button>
          <button type="button" className="campaign-quiet" onClick={() => void removeSpeaker(speaker.id)}>Remove</button></div>
      </div>)}
      {!speakers.length && <p>No speakers saved yet.</p>}
    </div>}
    <form className="session-recap-form" onSubmit={event => void saveSpeaker(event)}>
      <div className="session-recap-form-fields">
        <label><span>Discord username</span><input value={draft.discordName} maxLength={80} required onChange={event => setDraft(current => ({ ...current, discordName: event.target.value }))}/></label>
        <label><span>Discord user ID (optional)</span><input inputMode="numeric" value={draft.discordUserId} placeholder="Stable ID, if known" onChange={event => setDraft(current => ({ ...current, discordUserId: event.target.value }))}/></label>
        <label><span>Person / guest name</span><input required maxLength={100} value={draft.displayName} onChange={event => setDraft(current => ({ ...current, displayName: event.target.value }))}/></label>
        <label><span>Role</span><select value={draft.role} onChange={event => setDraft(current => ({ ...current, role: event.target.value as RecapSpeakerRole }))}>
          <option value="player">Player</option><option value="gm">Game Master (may play multiple NPCs)</option><option value="guest">Guest</option>
        </select></label>
        <label><span>Campaign character (optional)</span><select value={draft.characterId} onChange={event => setDraft(current => ({ ...current, characterId: event.target.value, characterName: "" }))}>
          <option value="">None / multiple characters</option>{characters.map(char => <option value={char.id} key={char.id}>{char.name}</option>)}
        </select></label>
        <label><span>Custom character name (optional)</span><input maxLength={120} value={draft.characterName} disabled={Boolean(draft.characterId)}
          onChange={event => setDraft(current => ({ ...current, characterName: event.target.value }))}/></label>
      </div>
      <div className="session-recap-form-actions">
        <button type="submit" className="campaign-primary" disabled={busy || !draft.discordName.trim() || !draft.displayName.trim()}>{draft.id ? "Update Speaker" : "Remember Speaker"}</button>
        {draft.id && <button type="button" className="campaign-secondary" onClick={() => setDraft(blank)}>Cancel Edit</button>}
      </div>
    </form>

    <h3>Recordings Awaiting Processing</h3>
    {imports.length === 0 && <p className="session-recap-editor-help">No recording links saved yet.</p>}
    <div className="session-recap-speaker-list">{imports.map(recording => <div className="session-recap-speaker-entry" key={recording.id}>
      <div><strong>{recording.sourceLabel}</strong> · {recording.sessionDate} · {recording.status === "ready" ? "Speakers confirmed" : "Needs speaker confirmation"}
        <small> · {recording.speakerCount} speaker(s)</small></div>
      <div className="session-recap-form-actions">
        <button type="button" className="campaign-secondary" disabled={busy || (recording.status !== "ready" && recording.status !== "awaiting_speakers")}
          onClick={() => chooseRecording(recording)}>{activeImport === recording.id ? "Selected" : "Review speakers"}</button>
        {recording.sourceType === "craig" && recording.status === "ready" && <>
          <button type="button" className="campaign-secondary" disabled={busy} onClick={() => void runCraigJob("POST",recording.id)}>Prepare Craig Audio (AAC)</button>
          <button type="button" className="campaign-quiet" disabled={busy} onClick={() => void runCraigJob("POST",recording.id,"flac")}>Prepare Lossless FLAC</button>
          <button type="button" className="campaign-quiet" disabled={busy} onClick={() => void runCraigJob("GET",recording.id)}>Check Job</button>
          <button type="button" className="campaign-secondary" disabled={busy} onClick={() => void transferCraigArchive(recording.id)}>Save Craig Archive</button>
          <button type="button" className="campaign-quiet" disabled={busy} onClick={() => void inspectCraigArchive(recording.id)}>Inspect Tracks</button>
          <button type="button" className="campaign-quiet" disabled={busy} onClick={() => void loadCraigInfo(recording.id)}>Craig Notes &amp; Info</button>
          <button type="button" className="campaign-secondary" disabled={busy} onClick={() => void loadTranscript(recording.id)}>Review Transcript</button>
        </>}
      </div>
    </div>)}</div>
    {inspectedTracks && <div className="session-recap-speaker-list">
      <strong>Audio tracks in saved Craig archive</strong>
      {inspectedTracks.entries.map((entry, index) => <div className="session-recap-speaker-entry" key={index}>
        <span>{entry.filename} · {(entry.uncompressedBytes / 1048576).toFixed(1)} MB</span>
        {/\.(flac|aac|m4a)$/i.test(entry.filename) && <>
          <button type="button" className="campaign-secondary" disabled={busy}
            onClick={() => void extractCraigTrack(inspectedTracks.recordingId, index)}>Extract Track</button>
          {entry.filename.toLowerCase().endsWith(".flac") && <button type="button" className="campaign-secondary" disabled={busy} onClick={() => void transcribeShortTrack(inspectedTracks.recordingId, index)}>Transcribe Short Track (AI)</button>}
          <label><span>Speaker</span><select aria-label={"Speaker for " + entry.filename} value={trackSpeakerChoices[index] || ""}
            onChange={event => setTrackSpeakerChoices(current => ({...current, [index]: event.target.value}))}>
            <option value="">Unassigned</option>
            {speakers.filter(speaker => imports.find(item => item.id === inspectedTracks.recordingId)?.speakerIds.includes(speaker.id))
              .map(speaker => <option key={speaker.id} value={speaker.id}>{speaker.displayName} ({speaker.discordName})</option>)}
          </select></label>
        </>}
      </div>)}
      <button type="button" className="campaign-primary" disabled={busy} onClick={() => void saveTrackSpeakers(inspectedTracks.recordingId)}>Save Track Speakers</button>
    </div>}
    {craigInfo && <section className="session-recap-speaker-list" aria-label="Craig recording notes">
      <div className="session-recap-form-actions"><strong>Craig session notes &amp; recording information</strong>
        <button type="button" className="campaign-secondary" onClick={() => setCraigInfo(null)}>Close Notes</button>
      </div>
      <pre style={{whiteSpace:"pre-wrap", overflowWrap:"anywhere", maxHeight:400, overflowY:"auto"}}>{craigInfo.info}</pre>
    </section>}
    {reviewTranscript && <section className="session-recap-speaker-list" aria-label="Timestamped transcript">
      <div className="session-recap-form-actions">
        <strong>Transcript · {reviewTranscript.segments.length} segment(s)</strong>
        <button type="button" className="campaign-secondary" onClick={() => setReviewTranscript(null)}>Close Transcript</button>
      </div>
      {reviewTranscript.segments.slice(0, 250).map((segment, index) =>
        <div className="session-recap-speaker-entry" key={segment.trackIndex + "-" + segment.startMs + "-" + index}>
          <div><strong>{transcriptTime(segment.startMs)}–{transcriptTime(segment.endMs)} · {segment.speakerName}</strong>
            {segment.characterName && <span> ({segment.characterName})</span>}
            <p>{segment.text}</p>
          </div>
        </div>)}
      {reviewTranscript.segments.length > 250 && <p className="session-recap-editor-help">Showing the first 250 segments. Larger transcript paging will follow.</p>}
    </section>}
    {craigJob && <p role="status">Craig conversion: {craigJob.status}{craigJob.outputReady ? " · " + (craigJob.format?.toUpperCase() || "Audio") + " ready to retrieve" : ""}</p>}
    {activeImport && <div className="session-recap-recording-confirm">
      <h4>Confirm speakers before transcription</h4>
      <p>Select the participants for this recording. These associations will be saved with the recording even if a player changes characters later.</p>
      {speakers.map(speaker => <label key={speaker.id} className="session-recap-recording-choice">
        <input type="checkbox" checked={selectedIds.includes(speaker.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...current, speaker.id] : current.filter(id => id !== speaker.id))}/>
        {speaker.discordName} — {speaker.displayName}{speaker.characterName ? " (" + speaker.characterName + ")" : ""}
      </label>)}
      <button type="button" className="campaign-primary" disabled={busy || !selectedIds.length} onClick={() => void confirmSpeakers()}>Confirm Speakers</button>
    </div>}
    {error && <p className="campaign-error" role="alert">{error}</p>}
    {notice && <p className="session-recap-import-notice" role="status">{notice}</p>}
  </div>;
}
