"use client";

import {useEffect,useMemo,useState} from "react";

type Cue={startMs:number;endMs:number;text:string;rawSpeaker:string;
  speakerName:string;characterName:string|null};
type Document={exists:boolean;updatedAt?:string;cues?:Cue[];error?:string};
const PAGE=60;
function time(ms:number){
  const seconds=Math.floor(ms/1000);
  const parts=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60]
    .map(n=>String(n).padStart(2,"0")).join(":");
  return parts;
}
function parseTime(raw:string):number|null{
  const m=/^(\d{1,2}):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/u.exec(raw.trim());
  if(!m)return null;
  const result=(Number(m[1])*3600+Number(m[2])*60+Number(m[3]))*1000+
    Number((m[4]||"").padEnd(3,"0"));
  return result<=8*60*60*1000?result:null;
}
export function SessionRecapStagedTranscriptReview({campaignId,recapId,onChanged}:{
  campaignId:string;recapId:string;onChanged:()=>void;
}){
  const base="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps";
  const [document,setDocument]=useState<Document|null>(null);
  const [search,setSearch]=useState("");
  const [replaceFrom,setReplaceFrom]=useState("");
  const [replaceTo,setReplaceTo]=useState("");
  const [page,setPage]=useState(0);
  const [editing,setEditing]=useState<number|null>(null);
  const [text,setText]=useState("");
  const [start,setStart]=useState("");
  const [end,setEnd]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(true);
  const [campaignSpeakers,setCampaignSpeakers]=useState<{id:string;displayName:string}[]>([]);
  const [speakerChoices,setSpeakerChoices]=useState<Record<string,string>>({});
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(base+"/transcript?recapId="+encodeURIComponent(recapId),
      {cache:"no-store",signal:controller.signal})
      .then(async response=>{
        const data=await response.json() as Document;
        if(!response.ok)throw Error(data.error||"Transcript unavailable.");
        return data;
      })
      .then(value=>{if(!controller.signal.aborted)setDocument(value);})
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Transcript unavailable.");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[base,recapId]);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/recap-imports",
      {cache:"no-store",signal:controller.signal}).then(async response=>{
        if(!response.ok)throw Error("Unable to load campaign speaker choices.");
        return await response.json() as {speakers?:{id:string;displayName:string}[]};
      }).then(value=>{if(!controller.signal.aborted)setCampaignSpeakers(value.speakers??[]);})
      .catch(()=>{});
    return()=>controller.abort();
  },[campaignId]);
  const cues=document?.cues??[];
  const detectedLabels=useMemo(()=>[...new Set(cues.map(c=>c.rawSpeaker))]
    .filter(label=>/^Speaker [1-9][0-9]*(?: · section [1-9][0-9]*)?$/u.test(label)),[cues]);
  const filtered=useMemo(()=>cues.map((cue,index)=>({cue,index}))
    .filter(({cue})=>(cue.text+" "+cue.speakerName+" "+(cue.characterName||"")).toLowerCase()
      .includes(search.toLowerCase().trim())),[cues,search]);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE));
  const visible=filtered.slice(Math.min(page,pages-1)*PAGE,(Math.min(page,pages-1)+1)*PAGE);
  function choose(index:number){
    const cue=cues[index];
    setEditing(index);setText(cue.text);setStart(time(cue.startMs));setEnd(time(cue.endMs));
    setError("");setNotice("");
  }
  async function assignDetectedSpeaker(label:string){
    const speakerId=speakerChoices[label];
    if(!speakerId||!document?.updatedAt||busy)return;
    const displayName=campaignSpeakers.find(s=>s.id===speakerId)?.displayName;
    if(!window.confirm("Assign all dialogue from "+label+" to "+(displayName??"this speaker")+
      "? Confirm the voice is correct before continuing."))return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch(base+"/workflow/transcript-edit",{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,updatedAt:document.updatedAt,speakerLabel:label,speakerId}),
      });
      const result=await response.json() as {saved?:boolean;updatedAt?:string;replacements?:number;error?:string};
      if(!response.ok||!result.saved)throw Error(result.error||"Could not assign voice.");
      const fresh=await fetch(base+"/transcript?recapId="+encodeURIComponent(recapId),{cache:"no-store"});
      const updated=await fresh.json() as Document;
      if(!fresh.ok)throw Error(updated.error||"Voice saved; reload to see it.");
      setDocument(updated);
      setNotice("Assigned "+(result.replacements??0)+" dialogue cues to "+displayName+".");
      onChanged();
    }catch(e){setError(e instanceof Error?e.message:"Could not assign voice.");}
    finally{setBusy(false);}
  }
  async function replaceNames(){
    if(busy||!document?.updatedAt||!replaceFrom.trim()||!replaceTo.trim())return;
    if(!window.confirm("Replace all matching names in this private transcript? Review the results before approval."))return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch(base+"/workflow/transcript-edit",{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,updatedAt:document.updatedAt,replaceFrom,replaceTo}),
      });
      const result=await response.json() as {saved?:boolean;updatedAt?:string;replacements?:number;error?:string};
      if(!response.ok||!result.saved)throw Error(result.error||"Could not replace names.");
      const fresh=await fetch(base+"/transcript?recapId="+encodeURIComponent(recapId),{cache:"no-store"});
      const updated=await fresh.json() as Document;
      if(!fresh.ok)throw Error(updated.error||"Correction saved; reload to view it.");
      setDocument(updated);setNotice("Corrected "+(result.replacements??0)+" matching names.");
      onChanged();
    }catch(e){setError(e instanceof Error?e.message:"Could not replace names.");}
    finally{setBusy(false);}
  }
  async function save(){
    if(busy||editing===null||!document?.updatedAt)return;
    const startMs=parseTime(start),endMs=parseTime(end);
    if(startMs===null||endMs===null||endMs<=startMs){setError("Use valid increasing HH:MM:SS timestamps.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch(base+"/workflow/transcript-edit",{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,updatedAt:document.updatedAt,cueIndex:editing,
          text,startMs,endMs}),
      });
      const result=await response.json() as {saved?:boolean;updatedAt?:string;error?:string};
      if(!response.ok||!result.saved||!result.updatedAt)throw Error(result.error||"Could not save correction.");
      setDocument(old=>!old?old:{...old,updatedAt:result.updatedAt,
        cues:old.cues?.map((cue,index)=>index===editing?{...cue,startMs,endMs,text:text.trim()}:cue)});
      setNotice("Correction saved privately. The writer will use this updated transcript.");
      setEditing(null);onChanged();
    }catch(e){setError(e instanceof Error?e.message:"Transcript correction failed.");}
    finally{setBusy(false);}
  }
  return <section className="session-recap-reading" aria-label="Search and correct saved transcript">
    <h4>Timestamped transcript review</h4>
    {loading?<p role="status">Loading transcript…</p>:!cues.length?
      <p className="campaign-empty-copy">No timestamped transcript saved yet.</p>:<>
      <p className="campaign-empty-copy">{cues.length} speech cues · First cue {time(cues[0].startMs)}
        {" · "}Last cue {time(Math.max(...cues.map(c=>c.endMs)))}.
        Confirm the opening and ending events are represented before approving.</p>
      {detectedLabels.length>0&&<div className="session-recap-reading">
        <h5>Identify detected voices</h5>
        <p className="campaign-empty-copy">Speaker numbers are not player identities. Listen to the audio and confirm each voice before assigning it to a campaign participant. Each assignment updates the transcript without changing its words or timestamps.</p>
        {detectedLabels.map(label=><div className="session-recap-form-actions" key={label}>
          <label>{label}
            <select value={speakerChoices[label]??""} disabled={busy}
              onChange={e=>setSpeakerChoices(old=>({...old,[label]:e.target.value}))}>
              <option value="">Choose confirmed player / GM</option>
              {campaignSpeakers.map(person=><option key={person.id} value={person.id}>{person.displayName}</option>)}
            </select>
          </label>
          <button type="button" className="campaign-secondary"
            disabled={busy||!speakerChoices[label]} onClick={()=>void assignDetectedSpeaker(label)}>
            Apply identity
          </button>
        </div>)}
      </div>}
      <label>Search dialogue, names or characters
        <input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}
          placeholder="Find a name or phrase"/>
      </label>
      <div className="session-recap-form-actions">
        <label>Misspelled name <input value={replaceFrom} onChange={e=>setReplaceFrom(e.target.value)} placeholder="As transcribed"/></label>
        <label>Correct spelling <input value={replaceTo} onChange={e=>setReplaceTo(e.target.value)} placeholder="Journal spelling"/></label>
        <button type="button" className="campaign-secondary" disabled={busy||!replaceFrom.trim()||!replaceTo.trim()} onClick={()=>void replaceNames()}>Correct all matching names</button>
      </div>
      <div className="session-recap-form-actions">
        <button type="button" className="campaign-secondary" disabled={page===0}
          onClick={()=>setPage(x=>Math.max(0,x-1))}>Previous cues</button>
        <span className="campaign-empty-copy">Page {Math.min(page,pages-1)+1} of {pages}</span>
        <button type="button" className="campaign-secondary" disabled={page>=pages-1}
          onClick={()=>setPage(x=>Math.min(pages-1,x+1))}>Next cues</button>
      </div>
      {visible.map(({cue,index})=><div key={index} className="session-recap-speaker-entry">
        <div>
          <strong>{time(cue.startMs)} – {time(cue.endMs)}</strong>
          <span> · {cue.characterName||cue.speakerName}</span>
          <p>{cue.text}</p>
        </div>
        <button type="button" className="campaign-secondary" disabled={busy}
          onClick={()=>choose(index)}>Correct</button>
      </div>)}
      {editing!==null&&<div className="session-recap-reading">
        <h5>Correct cue {editing+1}</h5>
        <div className="session-recap-form-fields">
          <label>Start (HH:MM:SS)
            <input type="text" value={start} disabled={busy} onChange={e=>setStart(e.target.value)}/>
          </label>
          <label>End (HH:MM:SS)
            <input type="text" value={end} disabled={busy} onChange={e=>setEnd(e.target.value)}/>
          </label>
        </div>
        <label>Spoken text
          <textarea rows={3} maxLength={1500} value={text} disabled={busy}
            onChange={e=>setText(e.target.value)}/>
        </label>
        <div className="session-recap-form-actions">
          <button type="button" className="campaign-primary" disabled={busy||!text.trim()}
            onClick={()=>void save()}>{busy?"Saving…":"Save correction"}</button>
          <button type="button" className="campaign-secondary" disabled={busy}
            onClick={()=>setEditing(null)}>Cancel</button>
        </div>
      </div>}
    </>}
    {notice&&<p className="session-recap-import-notice" role="status">{notice}</p>}
    {error&&<p className="campaign-error" role="alert">{error}</p>}
  </section>;
}
