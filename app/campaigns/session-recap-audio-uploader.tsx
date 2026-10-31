"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { uploadRecordingToDrive } from "@/lib/campaigns/recap-drive-upload-browser";
import { describeAudioUploadFile, formatAudioUploadSize, uploadPercent } from "@/lib/campaigns/recap-audio-upload-ui";

type StorageConnection = {
  id:string;provider:string;displayName:string;
  status:"connected"|"disconnected"|"reconnect_required";
};
type AudioAsset = {
  id:string;label:string;provider:string;status:string;primaryAudio:boolean;canRecover?:boolean;
};
type AwaitingVerification = {assetId:string;remoteFileId:string};
const fileExtensions = ".mp3,.m4a,.mp4,.wav,.flac,.aac";

export function SessionRecapAudioUploader({campaignId,recapId,onBusyChange}: {
  campaignId:string;recapId:string;onBusyChange?:(active:boolean)=>void;
}) {
  const [connections,setConnections] = useState<StorageConnection[]>([]);
  const [driveConfigured,setDriveConfigured] = useState(false);
  const [connectionId,setConnectionId] = useState("");
  const [assets,setAssets] = useState<AudioAsset[]>([]);
  const [file,setFile] = useState<File|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [progress,setProgress] = useState(0);
  const [notice,setNotice] = useState("");
  const [error,setError] = useState("");
  const [awaitingVerification,setAwaitingVerification] = useState<AwaitingVerification|null>(null);
  const [recoveringAsset,setRecoveringAsset] = useState<string|null>(null);
  const controller=useRef<AbortController|null>(null);
  const fileInputRef=useRef<HTMLInputElement|null>(null);
  const base="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/audio";

  const recoverSavedRecording=useCallback(async(assetId:string,quiet=false):Promise<boolean>=>{
    if(!quiet){setRecoveringAsset(assetId);setError("");setNotice("");}
    try{
      const response=await fetch(base+"/upload/recover",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({assetId,recapId}),
      });
      const data=await response.json() as {found?:boolean;ready?:boolean;error?:string};
      if(!response.ok)throw new Error(data.error||"TWE could not check Drive for the saved recording.");
      if(data.found&&data.ready){
        setNotice("Recovered your existing Google Drive recording and attached it to this recap. No new upload or Gemini request was made.");
        const list=await fetch(base+"?recapId="+encodeURIComponent(recapId),{cache:"no-store"});
        if(list.ok){
          const updated=await list.json() as {assets?:AudioAsset[]};
          if(Array.isArray(updated.assets))setAssets(updated.assets);
        }
        window.dispatchEvent(new CustomEvent("twe:recap-audio-attached",{detail:{recapId}}));
        return true;
      }
      if(!quiet)setNotice("No completed matching file found in your Drive yet. If the upload is still running, retry recovery after it finishes.");
      return false;
    }catch(cause){
      if(!quiet)setError(cause instanceof Error?cause.message:"Could not recover the saved recording.");
      return false;
    }finally{if(!quiet)setRecoveringAsset(null);}
  },[base,recapId]);

  useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
  useEffect(()=>()=>{onBusyChange?.(false);},[onBusyChange]);
  useEffect(()=>{
    if(!busy)return;
    const warn=(event:BeforeUnloadEvent)=>{
      event.preventDefault();
      event.returnValue="";
    };
    window.addEventListener("beforeunload",warn);
    return ()=>window.removeEventListener("beforeunload",warn);
  },[busy]);

  useEffect(()=>{
    let active=true;
    const account=fetch("/api/account/storage/google-drive",{cache:"no-store"})
      .then(async response=>{
        const result=await response.json() as {connections?:StorageConnection[];available?:boolean;error?:string};
        if(!response.ok || !Array.isArray(result.connections)) throw new Error(result.error||"Storage connections unavailable.");
        return result;
      });
    const linked=fetch(base+"?recapId="+encodeURIComponent(recapId),{cache:"no-store"})
      .then(async response=>{
        const result=await response.json() as {assets?:AudioAsset[];error?:string};
        if(!response.ok || !Array.isArray(result.assets)) throw new Error(result.error||"Recording references unavailable.");
        return result.assets;
      });
    void Promise.all([account,linked])
      .then(([details,found])=>{
        if(!active)return;
        setDriveConfigured(Boolean(details.available));
        setConnections(details.connections ?? []);
        setAssets(found);
        const connected=details.connections?.find(c=>c.provider==="google-drive" && c.status==="connected");
        setConnectionId(connected?.id ?? "");
        // Recover completed uploads whose final browser confirmation was lost.
        // The server verifies ownership and appProperties; no re-upload occurs.
        for(const asset of found.filter(a=>a.canRecover).slice(0,10)){
          void recoverSavedRecording(asset.id,true);
        }
      })
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Could not load recordings.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;controller.current?.abort();};
  },[base,recapId,recoverSavedRecording]);

  function pickFile(event:ChangeEvent<HTMLInputElement>) {
    const picked=event.target.files?.[0]??null;
    setError("");setNotice("");setProgress(0);setAwaitingVerification(null);
    if(!picked){setFile(null);return;}
    try {describeAudioUploadFile(picked);setFile(picked);}
    catch(cause) {setFile(null);setError(cause instanceof Error?cause.message:"Unsupported recording file.");}
  }

  async function verifyAsset(pending:AwaitingVerification):Promise<void> {
    const response=await fetch(base+"/upload/finish",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify(pending),
    });
    const result=await response.json() as {ready?:boolean;error?:string};
    if(!response.ok || result.ready!==true) {
      throw new Error(result.error||"Google Drive has the file, but TWE could not verify it.");
    }
    setAwaitingVerification(null);
    setFile(null);
    if(fileInputRef.current)fileInputRef.current.value="";
    setNotice("Recording saved in your Tales Without End Drive folder and attached to this recap. Gemini has not been started. Choose Auto Summarize when ready.");
    window.dispatchEvent(new CustomEvent("twe:recap-audio-attached",{detail:{recapId}}));
    try {
      const updated=await fetch(base+"?recapId="+encodeURIComponent(recapId),{cache:"no-store"});
      if(updated.ok){
        const data=await updated.json() as {assets?:AudioAsset[]};
        if(Array.isArray(data.assets))setAssets(data.assets);
      }
    } catch { /* The verified upload remains attached even if refreshing the list fails. */ }
  }

  async function retryVerification() {
    if(!awaitingVerification || busy)return;
    setBusy(true);setError("");setNotice("");
    try{await verifyAsset(awaitingVerification);}
    catch(cause){setError(cause instanceof Error?cause.message:"Verification failed.");}
    finally{setBusy(false);}
  }

  async function upload() {
    if(!file || !connectionId || busy || awaitingVerification)return;
    setBusy(true);setProgress(0);setNotice("");setError("");
    const abort=new AbortController();controller.current=abort;
    let uploaded:AwaitingVerification|null=null;
    try{
      const draft=describeAudioUploadFile(file);
      const response=await fetch(base+"/upload/start",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({...draft,recapId,connectionId}),
        signal:abort.signal,
      });
      const session=await response.json() as {
        assetId?:string;uploadSessionUrl?:string;uploadTicket?:string;uploadIssuedAt?:number;chunkBytes?:number;error?:string;
      };
      if(!response.ok || !session.assetId || !session.uploadSessionUrl || !session.chunkBytes || !session.uploadTicket || !session.uploadIssuedAt){
        throw new Error(session.error||"Could not start Google Drive upload.");
      }
      const remote=await uploadRecordingToDrive(file,session.uploadSessionUrl,
        (sent,total)=>setProgress(uploadPercent(sent,total)),
        {chunkBytes:session.chunkBytes,signal:abort.signal,relay:{
          endpoint:base+"/upload/relay",assetId:session.assetId,
          ticket:session.uploadTicket,issuedAt:session.uploadIssuedAt,
        }});
      uploaded={assetId:session.assetId,remoteFileId:remote.id};
      setAwaitingVerification(uploaded);
      await verifyAsset(uploaded);
    }catch(cause){
      if(abort.signal.aborted){
        setNotice("Upload stopped. Any partial file remains in your own Drive upload session.");
      }else{
        setError(cause instanceof Error?cause.message:"Audio upload failed.");
        if(uploaded)setNotice("Your file reached Google Drive. Use Retry verification to link it without uploading again.");
      }
    }finally{controller.current=null;setBusy(false);}
  }

  const activeConnections=connections.filter(c=>c.provider==="google-drive" && c.status==="connected");

  return <section className="session-recap-form" aria-label="Audio recording for this recap">
    <div className="session-recap-editor-heading">
      <strong>Session audio</strong>
      <a href="/account">Manage storage accounts</a>
    </div>
    <p className="session-recap-editor-help">
      Save an MP3, M4A, WAV, FLAC or AAC recording in the Tales Without End folder in your own Google Drive.
      Large 2–3-hour recordings stream in chunks through TWE to your own Google Drive; TWE does not store the audio.
      Keep this page and section open while uploading. Navigation can interrupt the transfer;
      stop the upload first if you need to leave. Uploading alone never sends audio to Gemini.
    </p>
    {assets.length>0 && <div aria-label="Attached recordings">
      {assets.map(asset=><div className="session-recap-editor-help" key={asset.id}>
        {asset.label} — {asset.status==="ready"?"Saved in your storage account":asset.status==="auth_required"?"Reconnect storage to access":"Upload not ready"}
        {asset.canRecover&&<button type="button" className="campaign-secondary"
          disabled={busy||recoveringAsset!==null} onClick={()=>void recoverSavedRecording(asset.id)}>
          {recoveringAsset===asset.id?"Checking Drive…":"Find saved recording"}
        </button>}
      </div>)}
    </div>}
    {loading ? <p role="status">Loading recording storage…</p> : <>
      {!driveConfigured && <p className="session-recap-editor-help">
        TWE&apos;s Google Drive connection is not configured yet. Recording uploads are unavailable until setup is completed.
      </p>}
      {driveConfigured && activeConnections.length===0 && <p className="session-recap-editor-help">
        Connect your Google Drive from <a href="/account">Account settings</a> to attach audio.
      </p>}
      {driveConfigured && activeConnections.length>0 && <>
        <label htmlFor="recap-audio-storage-account">Your storage account</label>
        <select id="recap-audio-storage-account" value={connectionId}
          onChange={event=>setConnectionId(event.target.value)} disabled={busy}>
          {activeConnections.map(c=><option key={c.id} value={c.id}>{c.displayName||"Google Drive"}</option>)}
        </select>
        <label htmlFor="recap-audio-file">Audio file</label>
        <input id="recap-audio-file" ref={fileInputRef} type="file" accept={fileExtensions} disabled={busy || Boolean(awaitingVerification)}
          onChange={pickFile}/>
        {file && <p className="session-recap-editor-help">
          {file.name} · {formatAudioUploadSize(file.size)}
        </p>}
        {busy && !awaitingVerification && <div role="status" aria-live="polite">
          <progress max={100} value={progress} aria-label="Recording upload progress"/>
          <span> {progress}% uploaded to your Drive</span>
        </div>}
        {busy && awaitingVerification && <p role="status">Verifying the saved recording…</p>}
        <div className="session-recap-form-actions">
          {awaitingVerification
            ? <button type="button" className="campaign-primary" disabled={busy} onClick={()=>void retryVerification()}>
                {busy?"Verifying…":"Retry verification"}
              </button>
            : <button type="button" className="campaign-primary" disabled={!file||!connectionId||busy}
                onClick={()=>void upload()}>{busy?"Uploading…":"Upload recording"}</button>}
          {busy && !awaitingVerification && <button type="button" className="campaign-secondary" onClick={()=>controller.current?.abort()}>
            Stop upload
          </button>}
        </div>
      </>}
    </>}
    {error && <p className="campaign-error" role="alert">{error}</p>}
    {notice && <p className="session-recap-import-notice" role="status">{notice}</p>}
  </section>;
}
