"use client";

import { useEffect, useState } from "react";
import type { RecapAudioForPlayer } from "@/lib/campaigns/recap-audio-assets";

export function SessionRecapAudioPlayer({campaignId,recapId}:{campaignId:string;recapId:string}) {
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
    {selected && <audio key={selected.id} controls preload="metadata"
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
