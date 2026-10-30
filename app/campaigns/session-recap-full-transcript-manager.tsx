"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { parseFullCraigCaptions } from "@/lib/campaigns/recap-full-caption-import";
import type { CaptionCue } from "@/lib/campaigns/recap-full-transcript";
import type { RecapSpeakerAssociation } from "@/lib/campaigns/recap-imports";

type Remote = {exists:boolean;published?:boolean;updatedAt?:string;cues?:CaptionCue[]};
export function SessionRecapFullTranscriptManager({campaignId,recapId}:{campaignId:string;recapId:string}) {
  const api="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/transcript";
  const [speakers,setSpeakers]=useState<RecapSpeakerAssociation[]>([]);
  const [stored,setStored]=useState<Remote>({exists:false});
  const [pending,setPending]=useState<CaptionCue[]>([]);
  const [filename,setFilename]=useState("");
  const [assignments,setAssignments]=useState<Record<string,string>>({});
  const [reviewed,setReviewed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const labels=[...new Set(pending.map(cue=>cue.rawSpeaker))];
  const url=api+"?recapId="+encodeURIComponent(recapId);
  useEffect(()=>{
    const controller=new AbortController();
    void Promise.all([
      fetch(url,{cache:"no-store",signal:controller.signal}).then(async response=>{
        const data=await response.json() as Remote & {error?:string};
        if(!response.ok)throw new Error(data.error||"Transcript unavailable.");
        return data;
      }),
      fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/recap-imports",
        {cache:"no-store",signal:controller.signal}).then(async response=>{
        const data=await response.json() as {speakers?:RecapSpeakerAssociation[];error?:string};
        if(!response.ok)throw new Error(data.error||"Speaker associations unavailable.");
        return data.speakers??[];
      }),
    ]).then(([data,rows])=>{if(!controller.signal.aborted){setStored(data);setSpeakers(rows);}})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Unable to load transcript.");});
    return ()=>controller.abort();
  },[campaignId,recapId,url]);

  async function chooseFile(event:ChangeEvent<HTMLInputElement>) {
    const file=event.currentTarget.files?.[0];
    event.currentTarget.value="";
    if(!file)return;
    setError("");setNotice("");setReviewed(false);
    try {
      if(file.size>2_000_000)throw new Error("Choose a caption file smaller than 2 MB.");
      const cues=parseFullCraigCaptions(await file.text(),file.name);
      setPending(cues);setFilename(file.name);setAssignments({});
      setNotice("Choose a saved campaign speaker or Guest for each detected voice, then save the private draft.");
    }catch(cause){setPending([]);setError(cause instanceof Error?cause.message:"Unable to read caption file.");}
  }
  async function saveDraft() {
    if(busy || !pending.length || labels.some(label=>!assignments[label]))return;
    setBusy(true);setError("");setNotice("");
    try {
      const mapped=Object.fromEntries(labels.map(label=>[label,assignments[label]==="__guest__"?null:assignments[label]]));
      const response=await fetch(api,{method:"PUT",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,cues:pending,assignments:mapped})});
      const result=await response.json() as {error?:string;updatedAt?:string;count?:number};
      if(!response.ok||!result.updatedAt)throw new Error(result.error||"Transcript could not be saved.");
      setStored({exists:true,published:false,updatedAt:result.updatedAt,cues:pending});
      setPending([]);setReviewed(false);
      setNotice("Saved "+(result.count??pending.length)+" captions privately. Review and publish when ready.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Transcript could not be saved.");}
    finally{setBusy(false);}
  }
  async function changePublished(published:boolean) {
    if(busy || !stored.updatedAt || (published&&!reviewed))return;
    setBusy(true);setError("");setNotice("");
    try {
      const response=await fetch(api,{method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,published,updatedAt:stored.updatedAt,reviewed:published?true:false})});
      const result=await response.json() as {error?:string;updatedAt?:string};
      if(!response.ok||!result.updatedAt)throw new Error(result.error||"Could not update transcript visibility.");
      setStored(previous=>({...previous,published,updatedAt:result.updatedAt}));
      setReviewed(false);
      setNotice(published?"Transcript published to campaign members.":"Transcript returned to GM-only draft.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not update transcript visibility.");}
    finally{setBusy(false);}
  }
  return <section className="session-recap-reading" aria-label="Full session transcript">
    <h4>Full session transcript</h4>
    <p className="campaign-empty-copy">Import Craig WebVTT/SRT captions for recordings lasting 2–3 hours.
      These are stored separately from recap Markdown, with no 30,000-character recap limit.
      Caption files are parsed locally; only confirmed dialogue and speaker labels are saved privately.</p>
    <label>Import Craig captions (.vtt/.srt)
      <input type="file" accept=".vtt,.srt,text/vtt,application/x-subrip" disabled={busy}
        onChange={event=>void chooseFile(event)}/>
    </label>
    {pending.length>0 && <div className="session-recap-reading">
      <p><strong>{filename}</strong> · {pending.length.toLocaleString()} captions · {labels.length} voices</p>
      <h5>Confirm each speaker before saving</h5>
      {labels.map(label=><label key={label} style={{display:"block",marginBlock:"0.5rem"}}>
        <span>{label}</span>{" "}
        <select aria-label={"Assign "+label} value={assignments[label]??""}
          onChange={event=>setAssignments(current=>({...current,[label]:event.target.value}))}>
          <option value="">Choose a speaker</option>
          <option value="__guest__">Guest / leave unmapped</option>
          {speakers.map(speaker=><option key={speaker.id} value={speaker.id}>
            {speaker.displayName}{speaker.characterName?" — "+speaker.characterName:""} ({speaker.role})
          </option>)}
        </select>
      </label>)}
      <p className="campaign-empty-copy">Preview: {pending.slice(0,3).map(cue=>cue.rawSpeaker+": "+cue.text).join(" | ")}</p>
      <button type="button" className="campaign-primary" disabled={busy||labels.some(label=>!assignments[label])}
        onClick={()=>void saveDraft()}>{busy?"Saving…":"Save private transcript draft"}</button>
    </div>}
    {stored.exists && <div>
      <p><strong>{stored.published?"Published to campaign members":"Private GM draft"}</strong>
        {" · "}{stored.cues?.length.toLocaleString()??"Saved"} captions</p>
      {!stored.published && !pending.length && <>
        <label><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>
          I have reviewed the speaker assignments and transcript and approve player access.</label>
        <div><button type="button" className="campaign-primary" disabled={busy||!reviewed}
          onClick={()=>void changePublished(true)}>Publish transcript</button></div>
      </>}
      {stored.published && <button type="button" className="campaign-secondary" disabled={busy}
        onClick={()=>void changePublished(false)}>Unpublish transcript</button>}
    </div>}
    {notice && <p className="session-recap-import-notice" role="status">{notice}</p>}
    {error && <p className="campaign-error" role="alert">{error}</p>}
  </section>;
}
