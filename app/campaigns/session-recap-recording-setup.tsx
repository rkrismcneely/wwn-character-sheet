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
  const [sessionDate, setSessionDate] = useState(date);
  const [activeImport, setActiveImport] = useState<string | null>(null);
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

  function chooseRecording(recording: RecapRecordingImport) {
    setActiveImport(recording.id);
    setSelectedIds(recording.speakerIds);
    setNotice(""); setError("");
  }

  return <div className="session-recap-recording-setup">
    <div className="campaign-section-heading">
      <div><p className="campaign-kicker">RECORDING SETUP</p><h3>Import a Session Recording</h3></div>
      <button type="button" className="campaign-secondary" onClick={onBack}>Back to Recaps</button>
    </div>
    <p>Save a Craig link, set up Discord speaker names and confirm which people were present. Transcription, audio uploading and automatic summaries are coming in later phases.</p>
    <form className="session-recap-form" onSubmit={event => void saveRecording(event)}>
      <div className="session-recap-form-fields">
        <label><span>Session date</span><input type="date" required value={sessionDate} onChange={event => setSessionDate(event.target.value)}/></label>
        <label><span>Craig recording link</span><input type="url" required value={link} placeholder="https://craig.horse/rec/..." onChange={event => setLink(event.target.value)} autoComplete="off"/></label>
      </div>
      <div className="session-recap-form-actions"><button type="submit" className="campaign-primary" disabled={busy || !link.trim()}>Save Recording Link</button></div>
    </form>
    <p className="session-recap-editor-help">MP3/M4A/WAV uploads and importing recordings already in Google Drive will be added later. Recording access keys are kept private.</p>

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
      <button type="button" className="campaign-secondary" disabled={busy || (recording.status !== "ready" && recording.status !== "awaiting_speakers")}
        onClick={() => chooseRecording(recording)}>{activeImport === recording.id ? "Selected" : "Review speakers"}</button>
    </div>)}</div>
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
