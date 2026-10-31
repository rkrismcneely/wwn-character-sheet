"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { RecapSpeakerAssociation, RecapRecordingImport } from "@/lib/campaigns/recap-imports";
import { GROQ_AUDIO_MODELS,MAX_GROQ_AUDIO_BYTES } from "@/lib/campaigns/recap-groq-audio";
import { MAX_GEMINI_CHUNK_BYTES } from "@/lib/campaigns/recap-gemini-transcribe";
import {
  inspectPcmWavUpload,planPcmWavUploadChunks,buildPcmWavUpload,
  type PcmWav,type WavChunk,
} from "@/lib/campaigns/recap-wav-chunks";

const formatPattern=/^(\d{1,2}):(\d{2}):(\d{2})$/u;
export function parseSessionAudioStart(value:string):number|null {
  const match=formatPattern.exec(value.trim());
  if(!match||Number(match[2])>59||Number(match[3])>59)return null;
  const seconds=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
  return seconds<=8*3600?seconds*1000:null;
}
type TranscriptionResult={saved?:boolean;duplicate?:boolean;added?:number;total?:number;error?:string};
type CraigTrack={index:number;filename:string;bytes:number;speakerLabel:string;discordName:string};

export function SessionRecapGroqTranscriber({campaignId,recapId,onSaved,provider="groq"}:{
  campaignId:string;recapId:string;onSaved:()=>void;provider?:"groq"|"gemini";
}) {
  const gemini=provider==="gemini";
  const maxBytes=gemini?MAX_GEMINI_CHUNK_BYTES:MAX_GROQ_AUDIO_BYTES;
  const [speakers,setSpeakers]=useState<RecapSpeakerAssociation[]>([]);
  const [craigImports,setCraigImports]=useState<RecapRecordingImport[]>([]);
  const [craigImportId,setCraigImportId]=useState("");
  const [craigTracks,setCraigTracks]=useState<CraigTrack[]>([]);
  const [craigTrackIndex,setCraigTrackIndex]=useState("");
  const [craigLoading,setCraigLoading]=useState(false);
  const [craigSpeakerHint,setCraigSpeakerHint]=useState("");
  const [mode,setMode]=useState<"clip"|"wav">("clip");
  const [file,setFile]=useState<File|null>(null);
  const [wavInfo,setWavInfo]=useState<PcmWav|null>(null);
  const [wavChunks,setWavChunks]=useState<WavChunk[]>([]);
  const [model,setModel]=useState<string>(GROQ_AUDIO_MODELS[0]);
  const [language,setLanguage]=useState("en");
  const [speakerId,setSpeakerId]=useState("");
  const [start,setStart]=useState("00:00:00");
  const [duration,setDuration]=useState("");
  const [key,setKey]=useState("");
  const [connectedGemini,setConnectedGemini]=useState(false);
  const [agreeShare,setAgreeShare]=useState(false);
  const [agreeBilling,setAgreeBilling]=useState(false);
  const [loading,setLoading]=useState(false);
  const [progress,setProgress]=useState(0);
  const [duplicates,setDuplicates]=useState(0);
  const [stopRequested,setStopRequested]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const stopAfterCurrent=useRef(false);
  const disposed=useRef(false);
  useEffect(()=>{
    disposed.current=false;
    const controller=new AbortController();
    void fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/recap-imports",
      {cache:"no-store",signal:controller.signal})
      .then(async response=>{
        const data=await response.json() as {speakers?:RecapSpeakerAssociation[];imports?:RecapRecordingImport[];error?:string};
        if(!response.ok)throw new Error(data.error||"Cannot load campaign speakers.");
        return {speakers:data.speakers??[],imports:data.imports??[]};
      }).then(data=>{if(!controller.signal.aborted){setSpeakers(data.speakers);setCraigImports(data.imports.filter(item=>item.sourceType==="craig"&&item.status==="ready"));}})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Speakers unavailable.");});
    return ()=>{disposed.current=true;stopAfterCurrent.current=true;controller.abort();};
  },[campaignId]);

  useEffect(()=>{
    if(!gemini)return;
    const controller=new AbortController();
    void fetch("/api/account/recap-ai/gemini",{cache:"no-store",signal:controller.signal})
      .then(async response=>{
        const data=await response.json() as {
          configured?:boolean;connection?:{status?:string};error?:string;
        };
        if(!response.ok)throw new Error(data.error||"Could not load Gemini account status.");
        if(!controller.signal.aborted)setConnectedGemini(Boolean(data.configured&&data.connection?.status==="connected"));
      }).catch(()=>{if(!controller.signal.aborted)setConnectedGemini(false);});
    return ()=>controller.abort();
  },[gemini]);

  async function inspectSavedCraig(importId:string) {
    setCraigImportId(importId);setCraigTracks([]);setCraigTrackIndex("");
    setFile(null);setDuration("");setError("");setNotice("");setCraigSpeakerHint("");
    if(!importId)return;
    setCraigLoading(true);
    try {
      const base="/api/campaigns/"+encodeURIComponent(campaignId)+"/recap-imports/";
      const suffix="?importId="+encodeURIComponent(importId);
      const [trackResponse,manifestResponse]=await Promise.all([
        fetch(base+"craig-track-speakers"+suffix,{cache:"no-store"}),
        fetch(base+"craig-manifest"+suffix,{cache:"no-store"}),
      ]);
      const association=await trackResponse.json() as {
        assignments?:{index:number;displayName:string;discordName:string}[];error?:string;
      };
      const manifest=await manifestResponse.json() as {
        entries?:{filename:string;uncompressedBytes:number}[];error?:string;
      };
      if(!trackResponse.ok||!manifestResponse.ok)
        throw new Error(association.error||manifest.error||"Could not inspect Craig track inventory.");
      const byIndex=new Map((association.assignments??[]).map(part=>[part.index,part]));
      const eligible=(manifest.entries??[]).flatMap((entry,index)=>{
        const mapping=byIndex.get(index);
        if(!mapping||!mapping.displayName||!mapping.discordName||entry.uncompressedBytes<128||
          entry.uncompressedBytes>maxBytes||!/\.(?:flac|m4a|aac)$/iu.test(entry.filename))return [];
        return [{index,filename:entry.filename,bytes:entry.uncompressedBytes,
          speakerLabel:mapping.displayName,discordName:mapping.discordName}];
      });
      setCraigTracks(eligible);
      setNotice(eligible.length? "Select an extracted short Craig track; confirm its speaker below.":
        "No confirmed, extracted FLAC or AAC track under 16 MB is ready. Larger tracks need proper audio-aware conversion.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Could not inspect Craig recording.");}
    finally{setCraigLoading(false);}
  }
  function readDuration(chosen:File) {
    const localUrl=URL.createObjectURL(chosen);
    const audio=new Audio();
    audio.preload="metadata";
    audio.onloadedmetadata=()=>{
      if(Number.isFinite(audio.duration)&&audio.duration>0)
        setDuration(String(Math.round(audio.duration*100)/100));
      audio.src="";URL.revokeObjectURL(localUrl);
    };
    audio.onerror=()=>{
      audio.src="";URL.revokeObjectURL(localUrl);
      setNotice("Browser could not detect duration. Verify this isolated track is under 30 minutes and enter the real length.");
    };
    audio.src=localUrl;
  }
  async function loadSavedCraigTrack(indexString:string) {
    setCraigTrackIndex(indexString);setFile(null);setDuration("");setError("");setCraigSpeakerHint("");
    if(indexString==="")return;
    const index=Number(indexString);
    const track=craigTracks.find(item=>item.index===index);
    if(!track||!craigImportId)return;
    setCraigLoading(true);
    try {
      const endpoint="/api/campaigns/"+encodeURIComponent(campaignId)+
        "/recap-imports/craig-track-audio?importId="+encodeURIComponent(craigImportId)+
        "&entryIndex="+index;
      const response=await fetch(endpoint,{cache:"no-store"});
      if(!response.ok){
        const detail=await response.json() as {error?:string};
        throw new Error(detail.error||"Craig track not available.");
      }
      const blob=await response.blob();
      if(blob.size<128||blob.size>maxBytes)
        throw new Error("Craig track exceeded the supported 16 MB upload limit.");
      const ext=track.filename.toLowerCase().endsWith(".flac")?"flac":"m4a";
      const audio=new File([blob],"craig-track-"+index+"."+ext,{
        type:ext==="flac"?"audio/flac":"audio/mp4",
      });
      setMode("clip");setFile(audio);setSpeakerId("");
      setCraigSpeakerHint(track.speakerLabel+" (Craig track: "+track.discordName+")");
      setNotice("Loaded "+track.filename+" privately. Confirm "+track.speakerLabel+
        " as the speaker, review the real clip duration, and approve Groq transcription.");
      readDuration(audio);
    }catch(cause){setError(cause instanceof Error?cause.message:"Craig audio could not be loaded.");}
    finally{setCraigLoading(false);}
  }

  function resetFile(nextMode:"clip"|"wav") {
    setMode(nextMode);setFile(null);setDuration("");setWavInfo(null);setWavChunks([]);
    setCraigTrackIndex("");setCraigSpeakerHint("");
    setProgress(0);setDuplicates(0);setError("");setNotice("");
  }
  async function chooseFile(event:ChangeEvent<HTMLInputElement>) {
    const chosen=event.currentTarget.files?.[0]??null;
    event.currentTarget.value="";
    setFile(null);setWavInfo(null);setWavChunks([]);setDuration("");setNotice("");setError("");
    setProgress(0);setDuplicates(0);
    if(!chosen)return;
    try{
      if(mode==="wav") {
        const info=await inspectPcmWavUpload(chosen);
        const chunks=planPcmWavUploadChunks(info,gemini?11*1024*1024:12*1024*1024);
        if(chunks.length===0)throw new Error("This WAV recording is empty.");
        setWavInfo(info);setWavChunks(chunks);setFile(chosen);
        setNotice("WAV plan ready. Only each small, valid clip is read during transcription.");
        return;
      }
      if(chosen.size<128||chosen.size>maxBytes)
        throw new Error("Select a prepared audio clip smaller than 16 MB.");
      if(!/\.(flac|mp3|mp4|m4a|mpeg|mpga|ogg|wav|webm)$/iu.test(chosen.name))
        throw new Error("Unsupported audio format.");
      setFile(chosen);
      readDuration(chosen);
    }catch(cause){setError(cause instanceof Error?cause.message:"Audio could not be read.");}
  }
  async function sendClip(clip:File,clipStartMs:number,clipDurationMs:number):Promise<TranscriptionResult>{
    const form=new FormData();
    form.set("recapId",recapId);form.set("file",clip);
    form.set("startMs",String(clipStartMs));
    form.set("durationMs",String(clipDurationMs));
    form.set("speakerId",speakerId);form.set("model",model);
    if(language==="en")form.set("language","en");
    form.set("approvedShare","true");form.set("approvedBilling","true");
    if(key.trim())form.set("apiKey",key.trim());
    const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+
      (gemini?"/session-recaps/transcript/gemini":"/session-recaps/transcript/transcribe"),
      {method:"POST",body:form,cache:"no-store"});
    const result=await response.json() as TranscriptionResult;
    if(!response.ok||!result.saved)throw new Error(result.error||"Transcription failed.");
    return result;
  }
  async function transcribe(){
    if(loading||!file||!speakerId||!agreeShare||!agreeBilling||(!key.trim()&&!connectedGemini))return;
    const baseStartMs=parseSessionAudioStart(start);
    if(baseStartMs===null){setError("Enter a valid session start (HH:MM:SS).");return;}
    const clipDuration=Math.round(Number(duration)*1000);
    if(mode==="clip" && (!Number.isFinite(clipDuration)||clipDuration<1000||
      clipDuration>1800*1000||baseStartMs+clipDuration>8*3600*1000)){
      setError("Enter a clip duration of 1 second to 30 minutes within an eight-hour session.");return;
    }
    if(mode==="wav" && (!wavInfo||!wavChunks.length ||
      baseStartMs+wavChunks[wavChunks.length-1].endMs>8*3600*1000)){
      setError("This WAV recording exceeds the supported eight-hour session timeline.");return;
    }
    if(mode==="wav" && !window.confirm(
      "This WAV will use up to "+wavChunks.length+" "+(gemini?"Gemini":"Groq")+" transcription requests on YOUR account. "+
      "Your provider may charge for each request. Start now?"))return;
    setLoading(true);setError("");setNotice("");setProgress(0);setDuplicates(0);
    stopAfterCurrent.current=false;setStopRequested(false);
    let finished=0, skipped=0, lastTotal=0;
    try {
      if(mode==="clip") {
        const result=await sendClip(file,baseStartMs,clipDuration);
        finished=1;skipped=result.duplicate?1:0;lastTotal=result.total??0;
        setProgress(1);setDuplicates(skipped);
      }else if(wavInfo) {
        for(let i=0;i<wavChunks.length;i++){
          if(stopAfterCurrent.current||disposed.current)break;
          const chunk=wavChunks[i];
          const sample=buildPcmWavUpload(file,wavInfo,chunk,i);
          const result=await sendClip(sample,baseStartMs+chunk.startMs,chunk.endMs-chunk.startMs);
          finished++;if(result.duplicate)skipped++;
          lastTotal=result.total??lastTotal;
          if(disposed.current)break;
          setProgress(finished);setDuplicates(skipped);
        }
      }
      if(!disposed.current){
        setNotice(stopAfterCurrent.current?
          "Stopped after "+finished+" clips. Saved transcript remains private. Restart to safely skip identical completed clips.":
          "Completed "+finished+" clip(s), including "+skipped+" already saved. "+
          lastTotal+" total speech segments in your private transcript. Review and publish separately.");
      }
    }catch(cause) {
      if(!disposed.current)setError((cause instanceof Error?cause.message:"Transcription failed.")+
        " Completed clips remain saved. No automatic charge-incurring retry occurred.");
    }finally{
      if(!disposed.current){
        if(finished>0)onSaved();
        setLoading(false);
      }
    }
  }
  return <section className="session-recap-reading" aria-label="Transcribe prepared audio with your own provider">
    <h4>Transcribe session audio with your own {gemini?"Google Gemini":"Groq"} account</h4>
    <p className="campaign-empty-copy">
      Use a short FLAC/MP3/M4A/WAV clip, or automatically process a long uncompressed PCM WAV
      as valid smaller audio clips. Assign one speaker per source recording, such as an isolated Craig track.
      Compressed full-length FLAC/MP3/M4A recordings still require conversion to PCM WAV.
      Your key is never stored. TWE does not pay for the provider requests.
      {gemini?" Gemini processing currently runs only while this page stays open; unattended queued processing is not active yet.":""}
    </p>
    {craigImports.length>0 && <div className="session-recap-reading" aria-label="Import saved Craig audio">
      <h5>Use an existing Craig recording</h5>
      <p className="campaign-empty-copy">
        Import a short extracted FLAC/M4A (or MPEG-4 AAC) speaker track without downloading it manually.
        Only previously confirmed and private Craig tracks are listed. Long compressed tracks
        will need an audio-aware conversion step.
      </p>
      <label>Craig recording
        <select value={craigImportId} disabled={loading||craigLoading}
          onChange={event=>void inspectSavedCraig(event.target.value)}>
          <option value="">Choose a saved recording</option>
          {craigImports.map(item=><option key={item.id} value={item.id}>
            {item.sourceLabel} — {item.sessionDate}
          </option>)}
        </select>
      </label>
      {craigImportId && <label>Confirmed, extracted audio track
        <select value={craigTrackIndex} disabled={loading||craigLoading}
          onChange={event=>void loadSavedCraigTrack(event.target.value)}>
          <option value="">Choose an isolated voice</option>
          {craigTracks.map(track=><option value={track.index} key={track.index}>
            {track.speakerLabel} — {track.filename} ({(track.bytes/1048576).toFixed(1)} MB)
          </option>)}
        </select>
      </label>}
      {craigLoading&&<p role="status">Loading private Craig track information…</p>}
      {craigSpeakerHint&&<p className="session-recap-import-notice">
        Craig identifies this voice as <strong>{craigSpeakerHint}</strong>.
        Confirm the matching campaign speaker below before transcription.
      </p>}
    </div>}
    <div className="session-recap-form-actions" role="group" aria-label="Audio transcription source">
      <button type="button" className={mode==="clip"?"campaign-primary":"campaign-secondary"}
        disabled={loading} onClick={()=>resetFile("clip")}>Prepared short clip</button>
      <button type="button" className={mode==="wav"?"campaign-primary":"campaign-secondary"}
        disabled={loading} onClick={()=>resetFile("wav")}>Full-length PCM WAV (automatic chunks)</button>
    </div>
    <label><span>{mode==="wav"?"Uncompressed 16-bit PCM WAV recording":"Prepared audio clip (under provider limit)"}</span>{" "}
      <input type="file" accept={mode==="wav"?".wav,audio/wav":".flac,.mp3,.mp4,.m4a,.ogg,.wav,.webm"}
        disabled={loading} onChange={event=>void chooseFile(event)} /></label>
    {file&&<p className="campaign-empty-copy">{file.name} · {(file.size/1048576).toFixed(1)} MB
      {mode==="wav"?" · "+wavChunks.length+" bounded requests · "+
        (wavChunks[wavChunks.length-1]?.endMs/60000).toFixed(1)+" audio minutes":""}
    </p>}
    <div className="session-recap-form-fields">
      <label><span>Who is speaking? (one voice per recording)</span>{" "}
        <select disabled={loading} value={speakerId} onChange={event=>setSpeakerId(event.target.value)}>
          <option value="">Select confirmed voice</option>
          {speakers.map(speaker=><option key={speaker.id} value={speaker.id}>
            {speaker.displayName}{speaker.characterName?" — "+speaker.characterName:""} ({speaker.role})
          </option>)}
          <option value="guest">Unmapped guest</option>
        </select>
      </label>
      <label><span>Recording starts at session time (HH:MM:SS)</span>
        <input type="text" inputMode="numeric" value={start} placeholder="00:00:00"
          disabled={loading} onChange={event=>setStart(event.target.value)}/></label>
      {mode==="clip"&&<label><span>Clip length in seconds</span>
        <input type="number" min={1} max={1800} step="0.01" value={duration}
          disabled={loading} onChange={event=>setDuration(event.target.value)}/></label>}
      {!gemini&&<label><span>Whisper model</span>
        <select value={model} disabled={loading} onChange={event=>setModel(event.target.value)}>
          <option value="whisper-large-v3-turbo">Whisper V3 Turbo — lower cost</option>
          <option value="whisper-large-v3">Whisper V3 — higher accuracy</option>
        </select></label>}
      <label><span>Spoken language</span>
        <select value={language} disabled={loading} onChange={event=>setLanguage(event.target.value)}>
          <option value="en">English</option><option value="">Auto-detect</option>
        </select></label>
      <label><span>Personal {gemini?"Google AI Studio":"Groq"} API key {gemini&&connectedGemini?"(optional — connected in Account)":"(not stored)"}</span>
        <input type="password" autoComplete="off" value={key} disabled={loading}
          placeholder={gemini&&connectedGemini?"Using your encrypted Account connection":"Google AI Studio key"} onChange={event=>setKey(event.target.value)}/></label>
    </div>
    <label style={{display:"block",marginBlock:"0.5rem"}}>
      <input type="checkbox" checked={agreeShare} disabled={loading}
        onChange={event=>setAgreeShare(event.target.checked)}/>
      I approve sending these clips to my {gemini?"Google Gemini":"Groq"} account for transcription.
    </label>
    <label style={{display:"block",marginBlock:"0.5rem"}}>
      <input type="checkbox" checked={agreeBilling} disabled={loading}
        onChange={event=>setAgreeBilling(event.target.checked)}/>
      I understand my {gemini?"Google Gemini":"Groq"} account may charge for every request and TWE cannot enforce a free quota.
    </label>
    <div className="session-recap-form-actions">
      <button type="button" className="campaign-primary"
        disabled={loading||!file||(!key.trim()&&!connectedGemini)||!speakerId||!agreeShare||!agreeBilling}
        onClick={()=>void transcribe()}>{loading?"Transcribing…":
          mode==="wav"?"Transcribe full WAV and save private draft":"Transcribe and save private draft"}</button>
      {loading&&mode==="wav"&&
        <button type="button" className="campaign-secondary" disabled={stopRequested}
          onClick={()=>{stopAfterCurrent.current=true;setStopRequested(true);setNotice("Stopping after the current clip.");}}>
          Stop after current clip</button>}
    </div>
    {loading&&<p role="status">Processed {progress} of {mode==="wav"?wavChunks.length:1} clips
      {duplicates>0?" ("+duplicates+" already saved)":""}. Keep this page open.</p>}
    {notice&&<p className="session-recap-import-notice" role="status">{notice}</p>}
    {error&&<p className="campaign-error" role="alert">{error}</p>}
  </section>;
}
