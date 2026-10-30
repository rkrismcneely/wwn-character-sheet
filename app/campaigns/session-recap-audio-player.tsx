"use client";

import { useEffect, useRef, useState } from "react";
import type { RecapAudioForPlayer } from "@/lib/campaigns/recap-audio-assets";
import { parseRecapTranscript } from "@/lib/campaigns/recap-transcript-display";

/** Extract explicit chapter headings only; ordinary narrative timestamps are not chapters. */
export function recapAudioChapters(content: string): { seconds: number; label: string; timestamp: string }[] {
  const chapters: { seconds: number; label: string; timestamp: string }[] = [];
  const seen = new Set<number>();
  let inCode = false;
  for (const line of content.split(/\r?\n/u)) {
    if (/^\s*```/u.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const match = /^#{1,6}\s+\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(?:[-–—:]\s*)?(.+)$/u.exec(line.trim());
    if (!match) continue;
    const parts = match[1].split(":").map(Number);
    const seconds = parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];
    if ((parts.length === 3 && (parts[1] > 59 || parts[2] > 59)) ||
        (parts.length === 2 && parts[1] > 59) || seen.has(seconds)) continue;
    seen.add(seconds);
    chapters.push({ seconds, timestamp: match[1], label: match[2].trim() });
    if (chapters.length >= 100) break;
  }
  return chapters.sort((a,b) => a.seconds - b.seconds);
}

export function SessionRecapAudioPlayer({campaignId,recapId,content}:{campaignId:string;recapId:string;content?:string}) {
  const audioRef=useRef<HTMLAudioElement>(null);
  const pendingSeek=useRef<number|null>(null);
  const chapters=recapAudioChapters(content??"");
  const transcript=parseRecapTranscript(content??"");
  const [filter,setFilter]=useState("");
  function seekTo(seconds:number) {
    const audio=audioRef.current;
    if (!audio) return;
    if (audio.readyState < 1) { pendingSeek.current=seconds; audio.load(); return; }
    audio.currentTime=Number.isFinite(audio.duration)?Math.min(seconds,audio.duration):seconds;
    void audio.play().catch(()=>{/* Playback may require a second user gesture. */});
  }
  const [assets,setAssets]=useState<RecapAudioForPlayer[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    const controller=new AbortController();
    const url="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/audio?recapId="+encodeURIComponent(recapId);
    void fetch(url,{cache:"no-store",signal:controller.signal})
      .then(async response=>{
        const value=await response.json() as {assets?:RecapAudioForPlayer[];error?:string};
        if(!response.ok || !Array.isArray(value.assets)) throw new Error(value.error||"Session audio is unavailable.");
        return value.assets;
      })
      .then(value=>{
        if(controller.signal.aborted)return;
        setAssets(value);
        const playable=value.filter(asset=>asset.status==="ready" && asset.provider==="google-drive");
        const preferred=playable.find(asset=>asset.primaryAudio)??playable[0];
        setSelectedId(preferred?.id??"");
      })
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Recording unavailable.");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[campaignId,recapId]);

  const playable=assets.filter(asset=>asset.status==="ready" && asset.provider==="google-drive");
  const selected=playable.find(asset=>asset.id===selectedId)??playable[0];
  const disconnected=assets.some(asset=>asset.status==="auth_required");
  if(loading)return null;
  if(!assets.length && !error)return null;
  return <section className="session-recap-reading" aria-label="Listen to this session">
    <h4>Listen to this session</h4>
    {playable.length>1 && <label>
      <span>Recording track</span>
      <select value={selected?.id??""} aria-label="Choose recording track"
        onChange={event=>{setSelectedId(event.target.value);setError("");}}>
        {playable.map((asset,index)=><option value={asset.id} key={asset.id}>
          {asset.label||"Track "+(index+1)}
        </option>)}
      </select>
    </label>}
    {selected && chapters.length>0 && <nav aria-label="Recording chapters">
      <h5>Chapters</h5>
      <ol>{chapters.map(chapter=><li key={chapter.seconds}>
        <button type="button" className="journal-inline-link" onClick={()=>seekTo(chapter.seconds)}>
          {chapter.timestamp} — {chapter.label}
        </button>
      </li>)}</ol>
    </nav>}
    {selected && transcript.length>0 && <section aria-label="Timestamped transcript">
      <h5>Transcript</h5>
      <label><span className="sr-only">Search transcript</span>
        <input type="search" value={filter} onChange={event=>setFilter(event.target.value)}
          placeholder="Search spoken dialogue" aria-label="Search transcript" />
      </label>
      <div className="session-recap-transcript" style={{maxHeight:360,overflowY:"auto"}}>
        {transcript.filter(line=>(line.speaker+" "+line.text).toLocaleLowerCase().includes(filter.toLocaleLowerCase())).slice(0,500).map((line,index)=>
          <p key={line.seconds+":"+index}>
            <button type="button" className="journal-inline-link" onClick={()=>seekTo(line.seconds)}
              aria-label={"Play from "+line.timestamp}>{line.timestamp}</button>
            {" "}<strong>{line.speaker}:</strong> {line.text}
          </p>)}
      </div>
      {transcript.length>500 && <p className="campaign-empty-copy">Showing up to 500 matching lines. Search to find another moment.</p>}
    </section>}
    {selected && <audio ref={audioRef} key={selected.id} controls preload="metadata"
      onLoadedMetadata={()=>{if(pendingSeek.current!==null){const seconds=pendingSeek.current;pendingSeek.current=null;seekTo(seconds);}}}
      aria-label={selected.label||"Session recording"}
      src={"/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/audio/"+
        encodeURIComponent(selected.id)+"/stream"}
      onError={()=>setError("This recording cannot be played. Ask the GM to check their connected storage account.")}>
      Your browser does not support this audio format.
    </audio>}
    {disconnected && <p className="campaign-empty-copy">Some recordings need the GM to reconnect storage.</p>}
    {!selected && assets.length>0 && <p className="campaign-empty-copy">No playable recording is ready yet.</p>}
    {error && <p className="campaign-error" role="alert">{error}</p>}
  </section>;
}
