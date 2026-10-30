"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { RecapSpeakerAssociation } from "@/lib/campaigns/recap-imports";
import { GROQ_AUDIO_MODELS,MAX_GROQ_AUDIO_BYTES } from "@/lib/campaigns/recap-groq-audio";
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
export function SessionRecapGroqTranscriber({campaignId,recapId,onSaved}:{
  campaignId:string;recapId:string;onSaved:()=>void;
}) {
  const [speakers,setSpeakers]=useState<RecapSpeakerAssociation[]>([]);
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
  const [agreeShare,setAgreeShare]=useState(false);
  const [agreeBilling,setAgreeBilling]=useState(false);
  const [loading,setLoading]=useState(false);
  const [progress,setProgress]=useState(0);
  const [duplicates,setDuplicates]=useState(0);
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
        const data=await response.json() as {speakers?:RecapSpeakerAssociation[];error?:string};
        if(!response.ok)throw new Error(data.error||"Cannot load campaign speakers.");
        return data.speakers??[];
      }).then(rows=>{if(!controller.signal.aborted)setSpeakers(rows);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Speakers unavailable.");});
    return ()=>{disposed.current=true;stopAfterCurrent.current=true;controller.abort();};
  },[campaignId]);

  function resetFile(nextMode:"clip"|"wav") {
    setMode(nextMode);setFile(null);setDuration("");setWavInfo(null);setWavChunks([]);
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
        const chunks=planPcmWavUploadChunks(info);
        if(chunks.length===0)throw new Error("This WAV recording is empty.");
        setWavInfo(info);setWavChunks(chunks);setFile(chosen);
        setNotice("WAV plan ready. Only each small, valid clip is read during transcription.");
        return;
      }
      if(chosen.size<128||chosen.size>MAX_GROQ_AUDIO_BYTES)
        throw new Error("Select a prepared audio clip smaller than 16 MB.");
      if(!/\.(flac|mp3|mp4|m4a|mpeg|mpga|ogg|wav|webm)$/iu.test(chosen.name))
        throw new Error("Unsupported audio format.");
      setFile(chosen);
      const localUrl=URL.createObjectURL(chosen);
      const audio=new Audio();
      audio.preload="metadata";
      audio.onloadedmetadata=()=>{
        if(Number.isFinite(audio.duration)&&audio.duration>0)
          setDuration(String(Math.round(audio.duration*100)/100));
        audio.src="";URL.revokeObjectURL(localUrl);
      };
      audio.onerror=()=>{audio.src="";URL.revokeObjectURL(localUrl);};
      audio.src=localUrl;
    }catch(cause){setError(cause instanceof Error?cause.message:"Audio could not be read.");}
  }
  async function sendClip(clip:File,clipStartMs:number,clipDurationMs:number):Promise<TranscriptionResult>{
    const form=new FormData();
    form.set("recapId",recapId);form.set("file",clip);
    form.set("startMs",String(clipStartMs));
    form.set("durationMs",String(clipDurationMs));
    form.set("speakerId",speakerId);form.set("model",model);
    if(language==="en")form.set("language","en");
    form.set("approvedShare","true");form.set("approvedBilling","true");form.set("apiKey",key);
    const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+
      "/session-recaps/transcript/transcribe",{method:"POST",body:form,cache:"no-store"});
    const result=await response.json() as TranscriptionResult;
    if(!response.ok||!result.saved)throw new Error(result.error||"Transcription failed.");
    return result;
  }
  async function transcribe(){
    if(loading||!file||!speakerId||!agreeShare||!agreeBilling||!key.trim())return;
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
      "This WAV will use up to "+wavChunks.length+" Groq transcription requests on YOUR account. "+
      "Your provider may charge for each request. Start now?"))return;
    setLoading(true);setError("");setNotice("");setProgress(0);setDuplicates(0);
    stopAfterCurrent.current=false;
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
  return <section className="session-recap-reading" aria-label="Transcribe prepared audio with Groq">
    <h4>Transcribe session audio with your own Groq account</h4>
    <p className="campaign-empty-copy">
      Use a short FLAC/MP3/M4A/WAV clip, or automatically process a long uncompressed PCM WAV
      as valid smaller audio clips. Assign one speaker per source recording, such as an isolated Craig track.
      Compressed full-length FLAC/MP3/M4A recordings still require conversion to PCM WAV.
      Your key is never stored. TWE does not pay for the provider requests.
    </p>
    <div className="session-recap-form-actions" role="group" aria-label="Audio transcription source">
      <button type="button" className={mode==="clip"?"campaign-primary":"campaign-secondary"}
        disabled={loading} onClick={()=>resetFile("clip")}>Prepared short clip</button>
      <button type="button" className={mode==="wav"?"campaign-primary":"campaign-secondary"}
        disabled={loading} onClick={()=>resetFile("wav")}>Full-length PCM WAV (automatic chunks)</button>
    </div>
    <label><span>{mode==="wav"?"Uncompressed 16-bit PCM WAV recording":"Prepared audio clip (under 16 MB)"}</span>{" "}
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
      <label><span>Whisper model</span>
        <select value={model} disabled={loading} onChange={event=>setModel(event.target.value)}>
          <option value="whisper-large-v3-turbo">Whisper V3 Turbo — lower cost</option>
          <option value="whisper-large-v3">Whisper V3 — higher accuracy</option>
        </select></label>
      <label><span>Spoken language</span>
        <select value={language} disabled={loading} onChange={event=>setLanguage(event.target.value)}>
          <option value="en">English</option><option value="">Auto-detect</option>
        </select></label>
      <label><span>Personal Groq API key (not stored)</span>
        <input type="password" autoComplete="off" value={key} disabled={loading}
          placeholder="gsk_…" onChange={event=>setKey(event.target.value)}/></label>
    </div>
    <label style={{display:"block",marginBlock:"0.5rem"}}>
      <input type="checkbox" checked={agreeShare} disabled={loading}
        onChange={event=>setAgreeShare(event.target.checked)}/>
      I approve sending these clips to my Groq account for transcription.
    </label>
    <label style={{display:"block",marginBlock:"0.5rem"}}>
      <input type="checkbox" checked={agreeBilling} disabled={loading}
        onChange={event=>setAgreeBilling(event.target.checked)}/>
      I understand my Groq account may charge for every request and TWE cannot enforce a free quota.
    </label>
    <div className="session-recap-form-actions">
      <button type="button" className="campaign-primary"
        disabled={loading||!file||!key.trim()||!speakerId||!agreeShare||!agreeBilling}
        onClick={()=>void transcribe()}>{loading?"Transcribing…":
          mode==="wav"?"Transcribe full WAV and save private draft":"Transcribe and save private draft"}</button>
      {loading&&mode==="wav"&&
        <button type="button" className="campaign-secondary" disabled={stopAfterCurrent.current}
          onClick={()=>{stopAfterCurrent.current=true;setNotice("Stopping after the current clip.");}}>
          Stop after current clip</button>}
    </div>
    {loading&&<p role="status">Processed {progress} of {mode==="wav"?wavChunks.length:1} clips
      {duplicates>0?" ("+duplicates+" already saved)":""}. Keep this page open.</p>}
    {notice&&<p className="session-recap-import-notice" role="status">{notice}</p>}
    {error&&<p className="campaign-error" role="alert">{error}</p>}
  </section>;
}
