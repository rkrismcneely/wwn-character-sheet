"use client";
import {useState} from "react";
import {planM4aPilotExcerpt} from "@/lib/campaigns/recap-m4a-remux";
import {validatePilotM4aPlan} from "@/lib/campaigns/recap-v2-pilot-plan";

type Asset={id:string;label:string;mimeType?:string|null;status:string};
type Pilot={status:string;model:string;excerptEndMs:number;excerptBytes:number;errorCode:string|null};
type Transcript={cues?:{startMs:number;endMs:number;text:string}[]};
type PilotStatus={
  ready?:boolean;requiresApproval?:boolean;excerptEndMs?:number;
  excerptBytes?:number;model?:string;notice?:string;
  originalByteSize?:number;durationMs?:number|null;
  pilot?:Pilot|null;transcript?:Transcript|null;error?:string;
};
const seconds=(ms:number)=>Math.floor(ms/60000)+":"+
  String(Math.floor(ms/1000)%60).padStart(2,"0");

/** Entire pilot UI is hidden unless the explicitly enabled trial flag is set.
 * GET is read-only; Groq receives audio only after two manual approvals.
 */
export function SessionRecapV2Pilot({campaignId,recapId,assets}:{
  campaignId:string;recapId:string;assets:Asset[];
}){
  const eligible=assets.filter(asset=>asset.status==="ready"&&asset.mimeType==="audio/mp4");
  const [assetId,setAssetId]=useState("");
  const current=assetId||eligible[0]?.id||"";
  const [preview,setPreview]=useState<PilotStatus|null>(null);
  const [clipPlan,setClipPlan]=useState<Awaited<ReturnType<typeof planM4aPilotExcerpt>>|null>(null);
  const [share,setShare]=useState(false);
  const [quota,setQuota]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const endpoint="/api/campaigns/"+encodeURIComponent(campaignId)+
    "/session-recaps/v2-pilot";
  async function refresh(){
    if(!current)return;
    setBusy(true);setError("");
    try{
      const query=new URLSearchParams({recapId,assetId:current});
      const response=await fetch(endpoint+"?"+query.toString(),{cache:"no-store"});
      const data=await response.json() as PilotStatus;
      if(!response.ok)throw Error(data.error||"Could not check Groq pilot.");
      if(!data.pilot&&data.ready){
        const size=data.originalByteSize;
        if(!Number.isSafeInteger(size)||!size||size<=0)throw Error("Original recording size is unknown.");
        const playback="/api/campaigns/"+encodeURIComponent(campaignId)+
          "/session-recaps/audio/"+encodeURIComponent(current)+"/stream";
        // AAC metadata work happens in the GM's browser, not Cloudflare's
        // 10 ms Free Worker CPU budget. We read only bounded byte ranges.
        const clip=await planM4aPilotExcerpt({
          byteSize:size,durationMs:data.durationMs??null,mimeType:"audio/mp4",
        },async(start,length)=>{
          const result=await fetch(playback,{method:"GET",cache:"no-store",
            headers:{Range:"bytes="+start+"-"+(start+length-1)}});
          if(result.status!==206||
            result.headers.get("content-range")!==
              "bytes "+start+"-"+(start+length-1)+"/"+size)
            throw Error("Drive could not provide a verified audio metadata range.");
          const bytes=new Uint8Array(await result.arrayBuffer());
          if(bytes.byteLength!==length)throw Error("Drive returned incomplete metadata.");
          return bytes;
        });
        const checked=validatePilotM4aPlan(clip,size,data.durationMs??null);
        setClipPlan(checked.clip);
        setPreview({...data,excerptEndMs:checked.clip.endMs,excerptBytes:checked.bytes});
      }else{
        setClipPlan(null);
        setPreview(data);
      }
    }catch(e){setError(e instanceof Error?e.message:"Pilot unavailable.");}
    finally{setBusy(false);}
  }
  async function submit(){
    if(!current||!share||!quota||busy||!preview?.ready||preview.pilot||!clipPlan)return;
    if(!window.confirm("Submit one private two-minute excerpt to your Groq account? This consumes audio quota and cannot be automatically retried."))return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch(endpoint,{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,assetId:current,
          approvedShare:true,approvedQuota:true,m4aPlan:clipPlan}),
      });
      const data=await response.json() as PilotStatus&{success?:boolean};
      if(!response.ok||!data.success)throw Error(data.error||"Groq pilot did not complete.");
      setNotice("Pilot transcript saved privately. No Gemini request or recap rewrite occurred.");
      // Do not repeat the POST. This GET reads a saved transcript only.
      const query=new URLSearchParams({recapId,assetId:current});
      const saved=await fetch(endpoint+"?"+query.toString(),{cache:"no-store"});
      if(saved.ok)setPreview(await saved.json() as PilotStatus);
    }catch(e){
      setError(e instanceof Error?e.message:"Pilot outcome may be uncertain. Do not submit again.");
      setPreview(null);
    }finally{setBusy(false);}
  }
  if(eligible.length===0)return null;
  return <details className="session-recap-reading">
    <summary>Experimental: Groq Whisper transcript test</summary>
    <p className="campaign-empty-copy">
      Checks a short excerpt from your existing Google Drive recording.
      This does not use Gemini or change the recap. The original audio stays in Drive.
    </p>
    <label>Recording
      <select value={current} disabled={busy} onChange={event=>{
        setAssetId(event.target.value);setPreview(null);setClipPlan(null);setShare(false);setQuota(false);
        setError("");setNotice("");
      }}>
        {eligible.map(asset=><option key={asset.id} value={asset.id}>{asset.label}</option>)}
      </select>
    </label>
    <div className="session-recap-form-actions">
      <button className="campaign-secondary" type="button" disabled={busy}
        onClick={()=>void refresh()}>{busy?"Checking…":"Check pilot readiness (no AI request)"}</button>
    </div>
    {preview?.pilot?<p role="status" className="campaign-empty-copy">
      Previous pilot: {preview.pilot.status}. Model: {preview.pilot.model}.
      {preview.pilot.errorCode?" Error: "+preview.pilot.errorCode:""}
      {" "}This recording cannot submit the pilot twice.
    </p>:preview?<p className="campaign-empty-copy">
      {preview.notice}
      {preview.excerptEndMs!==undefined?" Excerpt: "+seconds(preview.excerptEndMs):""}
      {preview.excerptBytes!==undefined?
        " · "+(preview.excerptBytes/1024/1024).toFixed(1)+" MiB":""}
    </p>:null}
    {preview?.ready&&!preview.pilot&&clipPlan&&<>
      <label style={{display:"block",marginBlock:8}}>
        <input type="checkbox" checked={share} disabled={busy}
          onChange={e=>setShare(e.target.checked)}/>
        {" "}I approve sending this short recording excerpt to Groq Whisper Large V3.
      </label>
      <label style={{display:"block",marginBlock:8}}>
        <input type="checkbox" checked={quota} disabled={busy}
          onChange={e=>setQuota(e.target.checked)}/>
        {" "}I understand this one transcription request may consume my Groq audio quota or incur charges.
      </label>
      <button type="button" className="campaign-primary"
        disabled={busy||!share||!quota} onClick={()=>void submit()}>
        {busy?"Submitting…":"Run one Groq transcript pilot"}
      </button>
    </>}
    {preview?.transcript?.cues&&<div>
      <h5>Private transcript sample</h5>
      <p className="campaign-empty-copy">No speaker identification is inferred from mixed audio.</p>
      <div className="session-recap-transcript" style={{maxHeight:320,overflowY:"auto"}}>
        {preview.transcript.cues.map((cue,i)=><p key={i}>
          <strong>{seconds(cue.startMs)}</strong> {cue.text}
        </p>)}
      </div>
    </div>}
    {notice&&<p role="status" className="session-recap-import-notice">{notice}</p>}
    {error&&<p role="alert" className="campaign-error">{error}</p>}
  </details>;
}
