"use client";

import { useEffect,useRef,useState,type ChangeEvent } from "react";
import type { RecapRecordingImport } from "@/lib/campaigns/recap-imports";
import { inspectGeminiSpeechWav,makeGeminiSpeechClip,
  type GeminiStagingClip } from "@/lib/campaigns/recap-gemini-speech-wav";
import type { PcmWav } from "@/lib/campaigns/recap-wav-chunks";
import { uploadRecordingToDrive } from "@/lib/campaigns/recap-drive-upload-browser";
import { decodeShortCraigAudio,makeDecodedGeminiSpeechClip,
  type DecodedSpeechPart } from "@/lib/campaigns/recap-gemini-native-short";
import { openPrivateCraigRangeReader,inspectCraigFlacStreamInfo,
  type CraigLongSourceMetadata } from "@/lib/campaigns/recap-craig-range-browser";
import { CRAIG_RANGE_WINDOW_BYTES } from "@/lib/campaigns/recap-craig-audio-ranges";
import { streamCraigFlacSpeech,planCraigFlacSpeechParts,CRAIG_FLAC_READ_BYTES,
  type CraigFlacSpeechPart } from "@/lib/campaigns/recap-craig-flac-stream";
import { inspectCraigAacMp4 } from "@/lib/campaigns/recap-craig-aac-demux";
import {streamCraigAacSpeech,planCraigAacSpeechParts} from "@/lib/campaigns/recap-craig-aac-stream";

type Storage={id:string;provider:string;displayName:string;status:string};
type Track={index:number;displayName:string;discordName:string};
type CraigEntry={filename:string;uncompressedBytes:number};
type Job={id:string;importId:string;status:string;speakerTracks:number;
  totalChunks:number;completedChunks:number;failedChunks:number;
  pausedAt:string|null;failureCode:string|null;nextEligibleAt:string|null;
  progress?:{pending:number;leased:number;submitted:number;completed:number;failed:number;skipped:number}};
type JobPage={jobs:Job[];backgroundEnabled:boolean;notice?:string};
type Staged={trackIndex:number;chunkIndex:number;startMs:number;endMs:number;
  sourceDigest:string|null;staged:boolean};
type Progress={jobId:string;status:string;totalChunks:number;speakerTracks:number;clips:Staged[]};
const errorMessage=(e:unknown)=>e instanceof Error?e.message:"Could not prepare this recording.";
const bytesLabel=(bytes:number)=>bytes>=1024**3?
  (bytes/1024**3).toFixed(2)+" GiB":(bytes/1024**2).toFixed(1)+" MiB";
const clipPercent=(done:number,total:number)=>total>0?
  Math.min(100,Math.round(100*done/total)):0;
function readableState(item:Job){
  if(item.status==="cancelled")return "Cancelled";
  if(item.pausedAt)return "Paused";
  if(item.status==="awaiting_source")return "Preparing audio";
  if(item.status==="queued")return "Audio ready; background transcription not active";
  if(item.status==="awaiting_review")return "Transcript awaiting review";
  if(item.status==="completed")return "Transcript accepted";
  return item.status.replaceAll("_"," ");
}
function issueExplanation(code:string|null):string|null {
  if(!code)return null;
  if(code==="quota")return "Google's current quota was reached. This job will not switch accounts.";
  if(code==="uncertain_result")return "A provider response was uncertain. The clip was stopped to avoid a duplicate charge.";
  if(code==="assembly_needs_review")return "A transcript fragment needs review; no partial result was published.";
  if(code==="needs_attention")return "Check the connected Gemini account or its billing permissions.";
  return "This processing job needs attention before continuing.";
}
export function SessionRecapGeminiStaging({campaignId,recapId,onSaved}:{
  campaignId:string;recapId:string;onSaved:()=>void;
}){
  const [imports,setImports]=useState<RecapRecordingImport[]>([]);
  const [driveAccounts,setDriveAccounts]=useState<Storage[]>([]);
  const [connectionId,setConnectionId]=useState("");
  const [importId,setImportId]=useState("");
  const [tracks,setTracks]=useState<Track[]>([]);
  const [craigEntries,setCraigEntries]=useState<CraigEntry[]>([]);
  const [trackIndex,setTrackIndex]=useState("");
  const [job,setJob]=useState<Job|null>(null);
  const [savedJobs,setSavedJobs]=useState<Job[]>([]);
  const [assembly,setAssembly]=useState<{
    ready:boolean;status:string;assembled?:number;total?:number;count?:number;
    cues?:{startMs:number;endMs:number;speakerName:string;characterName:string|null;text:string}[];
    existing?:{published:boolean;updatedAt:string;count:number}|null;
  }|null>(null);
  const [staged,setStaged]=useState<Progress|null>(null);
  const [file,setFile]=useState<File|null>(null);
  const [wav,setWav]=useState<PcmWav|null>(null);
  const [clips,setClips]=useState<GeminiStagingClip[]>([]);
  const [nativeBuffer,setNativeBuffer]=useState<AudioBuffer|null>(null);
  const [nativeClips,setNativeClips]=useState<DecodedSpeechPart[]>([]);
  const [nativeFormat,setNativeFormat]=useState<"flac"|"aac"|null>(null);
  const [uploadBytes,setUploadBytes]=useState({sent:0,total:0});
  const [longSource,setLongSource]=useState<{
    meta:CraigLongSourceMetadata;durationMs:number|null;sampleRate:number|null;
    aacPackets:number|null;
  }|null>(null);
  const [sourceTransfer,setSourceTransfer]=useState({bytes:0,total:0});
  const [sourceBusy,setSourceBusy]=useState(false);
  const [sourceMessage,setSourceMessage]=useState("");
  const longAbort=useRef<AbortController|null>(null);
  const [approve,setApprove]=useState(false);
  const [busy,setBusy]=useState(false);
  const [count,setCount]=useState(0);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const stopRequested=useRef(false);
  const active=useRef<AbortController|null>(null);
  const base="/api/campaigns/"+encodeURIComponent(campaignId);
  const jobs=base+"/session-recaps/background-gemini";
  const staging=jobs+"/staging";
  useEffect(()=>{
    const abort=new AbortController();
    void Promise.all([
      fetch(base+"/recap-imports",{cache:"no-store",signal:abort.signal}),
      fetch("/api/account/storage/google-drive",{cache:"no-store",signal:abort.signal}),
      fetch(jobs+"?recapId="+encodeURIComponent(recapId),
        {cache:"no-store",signal:abort.signal}),
    ]).then(async ([recapRes,driveRes,jobsRes])=>{
      const recap=await recapRes.json() as {imports?:RecapRecordingImport[];error?:string};
      const drive=await driveRes.json() as {connections?:Storage[];error?:string};
      const saved=await jobsRes.json() as JobPage&{error?:string};
      if(!recapRes.ok||!driveRes.ok||!jobsRes.ok)
        throw new Error(recap.error||drive.error||saved.error||"Account connections unavailable.");
      if(abort.signal.aborted)return;
      setImports((recap.imports??[]).filter(x=>x.sourceType==="craig"&&x.status==="ready"));
      const connected=(drive.connections??[]).filter(x=>x.provider==="google-drive"&&x.status==="connected");
      setDriveAccounts(connected);setConnectionId(connected[0]?.id??"");
      setSavedJobs(saved.jobs??[]);
      const restored=(saved.jobs??[]).find(row=>row.status!=="cancelled")??null;
      if(restored){
        setJob(restored);setImportId(restored.importId);
        const [voices,progress,manifest]=await Promise.all([
          fetch(base+"/recap-imports/craig-track-speakers?importId="+
            encodeURIComponent(restored.importId),{cache:"no-store",signal:abort.signal}),
          fetch(staging+"?recapId="+encodeURIComponent(recapId)+
            "&jobId="+encodeURIComponent(restored.id),{cache:"no-store",signal:abort.signal}),
          fetch(base+"/recap-imports/craig-manifest?importId="+
            encodeURIComponent(restored.importId),{cache:"no-store",signal:abort.signal}),
        ]);
        if(voices.ok&&progress.ok){
          const [speakerData,chunkData]=await Promise.all([
            voices.json() as Promise<{assignments?:Track[]}>,progress.json() as Promise<Progress>,
          ]);
          if(!abort.signal.aborted){
            setTracks(speakerData.assignments??[]);setStaged(chunkData);
            if(manifest.ok){
              const inventory=await manifest.json() as {entries?:CraigEntry[]};
              if(!abort.signal.aborted)setCraigEntries(inventory.entries??[]);
            }
          }
        }else if(!abort.signal.aborted){
          setError("Saved Gemini job found, but its audio or speaker metadata could not be loaded.");
        }
      }
    }).catch(e=>{if(!abort.signal.aborted)setError(errorMessage(e));});
    return ()=>{abort.abort();stopRequested.current=true;active.current?.abort();longAbort.current?.abort();};
  },[base,recapId,jobs,staging]);
  async function readJSON<T>(url:string,init?:RequestInit):Promise<T>{
    const response=await fetch(url,{cache:"no-store",...init});
    const data=await response.json() as T&{error?:string};
    if(!response.ok)throw new Error(data.error||"The request could not be completed.");
    return data;
  }
  async function chooseCraig(id:string){
    if(busy)return;
    setImportId(id);setJob(null);setTracks([]);setStaged(null);setAssembly(null);
    setCraigEntries([]);setLongSource(null);setSourceMessage("");
    setSourceTransfer({bytes:0,total:0});
    setTrackIndex("");setFile(null);setWav(null);setClips([]);
    setNativeBuffer(null);setNativeClips([]);setNativeFormat(null);
    setError("");setMessage("");
    if(!id)return;
    try{
      const found=savedJobs.find(row=>row.importId===id)??null;
      const [data,manifest]=await Promise.all([
        readJSON<{assignments?:Track[]}>(
          base+"/recap-imports/craig-track-speakers?importId="+encodeURIComponent(id)),
        readJSON<{entries?:CraigEntry[]}>(
          base+"/recap-imports/craig-manifest?importId="+encodeURIComponent(id))
          .catch(()=>({entries:[] as CraigEntry[]})),
      ]);
      setTracks(data.assignments??[]);
      setCraigEntries(manifest.entries??[]);
      if(found){setJob(found);await refresh(found.id);}
    }catch(e){setError(errorMessage(e));}
  }
  async function refresh(jobId:string):Promise<Progress>{
    const q="?recapId="+encodeURIComponent(recapId)+"&jobId="+encodeURIComponent(jobId);
    const data=await readJSON<Progress>(staging+q);
    setStaged(data);
    return data;
  }
  async function prepareJob(){
    if(!importId||!approve||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      const result=await readJSON<{job:Job;notice?:string}>(jobs,{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,importId,quotaMode:"provider-free-only",
          approvedShare:true,approvedBilling:true}),
      });
      setJob(result.job);await refresh(result.job.id);
      await reloadJobs(result.job.id);
      setMessage(result.notice??"Gemini job ready to receive prepared audio.");
    }catch(e){setError(errorMessage(e));}
    finally{setBusy(false);}
  }
  async function reloadJobs(selectedId?:string):Promise<Job|null>{
    const saved=await readJSON<JobPage>(jobs+"?recapId="+encodeURIComponent(recapId));
    setSavedJobs(saved.jobs);
    const selected=saved.jobs.find(row=>row.id===(selectedId??job?.id))??null;
    if(selected)setJob(selected);
    return selected;
  }
  async function changeJobState(action:"pause"|"resume"|"cancel"){
    if(!job||busy)return;
    if(action==="cancel"&&!window.confirm(
      "Permanently cancel this Gemini job? Prepared audio in Google Drive is not automatically deleted, and this recording cannot be requeued."))return;
    setBusy(true);setError("");setMessage("");
    try{
      await readJSON<{updated:boolean;action:string}>(jobs,{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,jobId:job.id,action}),
      });
      const updated=await reloadJobs(job.id);
      await refresh(job.id);
      setMessage(action==="cancel"?"Job cancelled. Existing Drive files are unchanged.":
        action==="pause"?"Job paused. No new Gemini chunks will be started.":
        "Job resumed. Automatic Gemini submissions remain disabled until safely activated.");
      if(updated?.status==="cancelled")setAssembly(null);
    }catch(e){setError(errorMessage(e));}
    finally{setBusy(false);}
  }
  useEffect(()=>{
    if(!job?.id)return;
    const selectedId=job.id;
    const controller=new AbortController();
    const check=async()=>{
      if(controller.signal.aborted||busy)return;
      try{
        const response=await fetch(jobs+"?recapId="+encodeURIComponent(recapId),
          {cache:"no-store",signal:controller.signal});
        if(!response.ok)return;
        const page=await response.json() as JobPage;
        if(controller.signal.aborted)return;
        setSavedJobs(page.jobs);
        const current=page.jobs.find(row=>row.id===selectedId);
        if(!current)return;
        setJob(old=>old?.id===selectedId?current:old);
        const progress=await fetch(staging+"?recapId="+encodeURIComponent(recapId)+
          "&jobId="+encodeURIComponent(selectedId),
          {cache:"no-store",signal:controller.signal});
        if(progress.ok){
          const value=await progress.json() as Progress;
          if(!controller.signal.aborted)setStaged(value);
        }
      }catch{/* The manual Refresh control remains available. */}
    };
    const id=window.setInterval(()=>void check(),60_000);
    return ()=>{controller.abort();window.clearInterval(id);};
  },[busy,job?.id,jobs,recapId,staging]);

  async function inspectLongCraig(){
    if(sourceBusy||!importId||trackIndex==="")return;
    const controller=new AbortController();longAbort.current=controller;
    setSourceBusy(true);setError("");setLongSource(null);setSourceMessage("");
    try{
      const stream=await openPrivateCraigRangeReader(campaignId,importId,Number(trackIndex),{
        signal:controller.signal,
        onProgress:progress=>setSourceTransfer({bytes:progress.receivedBytes,
          total:progress.totalSourceBytes}),
      });
      let durationMs:null|number=null,sampleRate:null|number=null;
      let aacPackets:null|number=null;
      if(stream.metadata.mimeType==="audio/flac"){
        const prefix=await stream.read(0,Math.min(64,stream.metadata.bytes));
        const header=inspectCraigFlacStreamInfo(prefix);
        durationMs=header.durationMs;sampleRate=header.sampleRate;
        setSourceMessage("FLAC header inspected. Only "+prefix.byteLength+
          " header bytes were read; the original recording was not decoded.");
      }else{
        // MP4 may store its packet index after hours of media data.
        // Read only bounded metadata ranges, never the full mdat payload.
        const index=await inspectCraigAacMp4(stream);
        durationMs=index.durationMs;sampleRate=index.sampleRate;
        aacPackets=index.sampleCount;
        setSourceMessage("AAC metadata verified: "+index.sampleCount+
          " AAC-LC packets mapped to their original byte offsets. "+
          "Only bounded container metadata was downloaded. "+
          "AAC metadata is ready for browser WebCodecs conversion where supported.");
      }
      setLongSource({meta:stream.metadata,durationMs,sampleRate,aacPackets});
    }catch(e){setError(errorMessage(e));}
    finally{longAbort.current=null;setSourceBusy(false);}
  }
  async function prepareFullCraigToDrive(){
    if(busy||sourceBusy||!job||job.status!=="awaiting_source"||job.pausedAt||
      !connectionId||!importId||trackIndex==="")return;
    setBusy(true);setSourceBusy(true);setError("");setMessage("");setCount(0);
    setUploadBytes({sent:0,total:0});setSourceTransfer({bytes:0,total:0});
    stopRequested.current=false;
    const controller=new AbortController();longAbort.current=controller;
    const index=Number(trackIndex),selectedJob=job;
    try{
      const source=await openPrivateCraigRangeReader(campaignId,importId,index,{
        signal:controller.signal,
        onProgress:p=>setSourceTransfer({bytes:p.receivedBytes,total:p.totalSourceBytes}),
      });
      const isFlac=source.metadata.mimeType==="audio/flac";
      const aacIndex=isFlac?null:await inspectCraigAacMp4(source);
      const parts=isFlac?
        planCraigFlacSpeechParts(inspectCraigFlacStreamInfo(await source.read(0,64))):
        planCraigAacSpeechParts(aacIndex!);
      const expectedStorage=parts.reduce((sum,part)=>sum+44+part.targetFrames*2,0);
      setSourceMessage("Preparing "+(isFlac?"FLAC":"AAC-LC")+" in bounded batches: "+
        parts.length+" clips. Projected GM Drive storage "+bytesLabel(expectedStorage)+
        ". Keep this page open; repeat preparation to verify and skip matching staged clips.");
      const current=await refresh(selectedJob.id);
      let existing=current.clips.filter(part=>part.trackIndex===index);
      if(existing.length===0){
        await readJSON<{planned:boolean}>(staging,{
          method:"POST",headers:{"content-type":"application/json"},signal:controller.signal,
          body:JSON.stringify({recapId,jobId:selectedJob.id,action:"plan",trackIndex:index,
            chunks:parts.map(part=>({startMs:part.startMs,endMs:part.endMs}))}),
        });
        existing=(await refresh(selectedJob.id)).clips.filter(part=>part.trackIndex===index);
      }
      if(existing.length!==parts.length||existing.some((part,i)=>
        part.chunkIndex!==i||part.startMs!==parts[i].startMs||part.endMs!==parts[i].endMs))
        throw new Error("The verified original audio differs from the saved clip plan. The recording cannot be silently replaced.");
      const planned=existing;
      const uploadClip=async(converted:File,part:CraigFlacSpeechPart)=>{
          if(stopRequested.current||controller.signal.aborted)
            throw new Error("Audio preparation stopped. Uploaded clips remain in Drive.");
          const digest=await sha(converted),old=planned[part.chunkIndex];
          if(old.staged){
            if(old.sourceDigest!==digest)
              throw new Error("Previously uploaded speech clip did not match its checksum.");
            setCount(part.chunkIndex+1);return;
          }
          const started=await readJSON<{assetId:string;uploadSessionUrl:string;chunkBytes:number}>(
            base+"/session-recaps/audio/upload/start",{
              method:"POST",headers:{"content-type":"application/json"},
              signal:controller.signal,
              body:JSON.stringify({recapId,connectionId,filename:converted.name,
                mimeType:"audio/wav",byteSize:converted.size,
                durationMs:part.endMs-part.startMs,processingJobId:selectedJob.id}),
            });
          setUploadBytes({sent:0,total:converted.size});
          const remote=await uploadRecordingToDrive(converted,started.uploadSessionUrl,
            (sent,total)=>setUploadBytes({sent,total}),
            {chunkBytes:started.chunkBytes,signal:controller.signal});
          await readJSON<{ready:boolean}>(base+"/session-recaps/audio/upload/finish",{
            method:"POST",headers:{"content-type":"application/json"},
            signal:controller.signal,
            body:JSON.stringify({assetId:started.assetId,remoteFileId:remote.id}),
          });
          await readJSON<{staged:boolean}>(staging,{
            method:"POST",headers:{"content-type":"application/json"},
            signal:controller.signal,
            body:JSON.stringify({recapId,jobId:selectedJob.id,action:"attach",
              trackIndex:index,chunkIndex:part.chunkIndex,
              assetId:started.assetId,sourceDigest:digest}),
          });
          setCount(part.chunkIndex+1);await refresh(selectedJob.id);
      };
      if(isFlac){
        await streamCraigFlacSpeech({
          source,signal:controller.signal,onClip:uploadClip,
          onProgress:p=>setSourceMessage(
            "FLAC clips staged "+p.clipsCompleted+"/"+p.clipsTotal+
            ". Source retrieved "+bytesLabel(p.sourceBytes)+"/"+bytesLabel(p.sourceTotal)+
            "; approximately "+p.estimatedR2Reads+" Cloudflare R2 reads."),
        });
      }else{
        await streamCraigAacSpeech({
          source,index:aacIndex!,signal:controller.signal,onClip:uploadClip,
          onProgress:p=>setSourceMessage(
            "AAC packets decoded "+p.packetsDecoded+"/"+p.packetsTotal+
            "; Drive clips staged "+p.clipsCompleted+"/"+p.clipsTotal+
            ". Audio retrieved "+bytesLabel(p.sourceBytes)+
            " using "+p.sourceReadRequests+" bounded Cloudflare R2 reads. "+
            "Gemini transcription remains disabled."),
        });
      }
      setMessage("Full "+(isFlac?"FLAC":"AAC")+" speaker track prepared and verified in your Google Drive. "+
        "Prepare the other Craig speakers, then seal the job. Automatic Gemini submission remains disabled.");
    }catch(e){
      setError(errorMessage(e)+" Confirmed clips remain saved. Retry the same Craig source and browser to resume.");
    }finally{longAbort.current=null;setBusy(false);setSourceBusy(false);}
  }
  async function saveLongCraigToComputer(){
    if(sourceBusy||!importId||trackIndex==="")return;
    type FileWriter={write(bytes:Uint8Array<ArrayBuffer>):Promise<void>;
      close():Promise<void>;abort():Promise<void>};
    type Picker=()=>Promise<{createWritable():Promise<FileWriter>}>;
    const nativeWindow=window as Window&{showSaveFilePicker?:(
      options:{suggestedName:string})=>ReturnType<Picker>};
    if(!nativeWindow.showSaveFilePicker){
      setError("This browser does not support streaming save-to-disk. Use a desktop browser with File System Access support.");return;
    }
    // Request the file handle synchronously from the click, before network awaits.
    const entry=craigEntries[Number(trackIndex)];
    const preferred=(entry?.filename??("craig-track-"+trackIndex+".flac"))
      .split(/[\\/]/u).pop()?.replace(/[^A-Za-z0-9._ -]/gu,"_")??"craig-audio.flac";
    let handle:Awaited<ReturnType<Picker>>;
    try{handle=await nativeWindow.showSaveFilePicker({suggestedName:preferred});}
    catch{return;}
    setSourceBusy(true);setError("");setSourceMessage("");
    const controller=new AbortController();longAbort.current=controller;
    let writer:FileWriter|null=null;
    try{
      const stream=await openPrivateCraigRangeReader(campaignId,importId,Number(trackIndex),{
        signal:controller.signal,
        onProgress:p=>setSourceTransfer({bytes:p.receivedBytes,total:p.totalSourceBytes}),
      });
      writer=await handle.createWritable();
      setSourceTransfer({bytes:0,total:stream.metadata.bytes});
      for(let at=0;at<stream.metadata.bytes;at+=CRAIG_RANGE_WINDOW_BYTES){
        if(controller.signal.aborted)throw new Error("Local file save was cancelled.");
        const length=Math.min(CRAIG_RANGE_WINDOW_BYTES,stream.metadata.bytes-at);
        const part=await stream.read(at,length);
        await writer.write(part);
      }
      await writer.close();writer=null;
      setSourceMessage("Saved the original compressed audio to your computer. This is not a transcription; full-length audio still requires an audio-aware decoder or PCM WAV conversion.");
    }catch(e){
      if(writer)await writer.abort().catch(()=>{});
      setError(errorMessage(e)+" No partial file is kept by TWE.");
    }finally{longAbort.current=null;setSourceBusy(false);}
  }
  async function chooseSourceFile(next:File|null){
    setFile(null);setWav(null);setClips([]);setCount(0);setError("");
    setNativeBuffer(null);setNativeClips([]);setNativeFormat(null);
    setUploadBytes({sent:0,total:0});
    if(!next)return;
    try{
      if(/\\.wav$/iu.test(next.name)){
        const inspected=await inspectGeminiSpeechWav(next);
        setFile(next);setWav(inspected.source);setClips(inspected.clips);
        setMessage("WAV analyzed. Conversion reads one four-minute source slice at a time; original audio stays in your browser.");
      }else{
        const result=await decodeShortCraigAudio(next);
        setFile(next);setNativeBuffer(result.decoded);setNativeClips(result.parts);
        setNativeFormat(result.format);
        setMessage("Short Craig "+result.format.toUpperCase()+
          " decoded locally. Full-length compressed recordings need streaming conversion; never decode multi-hour tracks into browser memory.");
      }
    }catch(e){setError(errorMessage(e));}
  }
  async function loadShortCraigTrack(){
    if(!importId||trackIndex===""||busy)return;
    const index=Number(trackIndex);
    const entry=craigEntries[index];
    if(entry && (entry.uncompressedBytes>16*1024*1024||
      !/\\.(?:flac|m4a|aac)$/iu.test(entry.filename))){
      setError("Craig's private short-track download limit is 16 MiB. For a long track, use a PCM WAV conversion and keep the original time positions.");return;
    }
    setBusy(true);setError("");setMessage("");
    try{
      const response=await fetch(base+"/recap-imports/craig-track-audio?importId="+
        encodeURIComponent(importId)+"&entryIndex="+index,{cache:"no-store"});
      if(!response.ok){
        const failure=await response.json() as {error?:string};
        throw new Error(failure.error??"Craig speaker track unavailable.");
      }
      const blob=await response.blob();
      if(blob.size>16*1024*1024)throw new Error("Short Craig track exceeded safe download limit.");
      const format=response.headers.get("content-type")?.includes("flac")?"flac":"m4a";
      await chooseSourceFile(new File([blob],"craig-"+index+"."+format,{type:blob.type}));
    }catch(e){setError(errorMessage(e));}
    finally{setBusy(false);}
  }
  async function chooseWav(event:ChangeEvent<HTMLInputElement>){
    const next=event.currentTarget.files?.[0]??null;
    event.currentTarget.value="";
    await chooseSourceFile(next);
  }
  async function sha(fileToHash:File):Promise<string>{
    const data=new Uint8Array(await crypto.subtle.digest("SHA-256",await fileToHash.arrayBuffer()));
    return Array.from(data,n=>n.toString(16).padStart(2,"0")).join("");
  }
  async function upload(){
    const parts=nativeBuffer?nativeClips:clips;
    if(!job||!file||(!wav&&!nativeBuffer)||!parts.length||trackIndex===""||!connectionId||busy)return;
    setBusy(true);setCount(0);setMessage("");setError("");stopRequested.current=false;
    setUploadBytes({sent:0,total:0});
    const abort=new AbortController();active.current=abort;
    const index=Number(trackIndex);
    try{
      const current=await refresh(job.id);
      let existing=current.clips.filter(c=>c.trackIndex===index);
      if(existing.length===0){
        await readJSON<{planned:boolean}>(staging,{
          method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({recapId,jobId:job.id,action:"plan",trackIndex:index,
            chunks:parts.map(part=>({startMs:part.startMs,endMs:part.endMs}))}),
          signal:abort.signal,
        });
        existing=(await refresh(job.id)).clips.filter(c=>c.trackIndex===index);
      }
      if(existing.length!==parts.length||existing.some((part,i)=>
        part.chunkIndex!==i||part.startMs!==parts[i].startMs||part.endMs!==parts[i].endMs))
        throw new Error("This WAV does not match the previously staged track plan. Re-select the original recording.");
      let uploaded=0;
      for(let i=0;i<parts.length;i++){
        if(stopRequested.current||abort.signal.aborted)break;
        const converted=nativeBuffer?
          makeDecodedGeminiSpeechClip(file.name,nativeBuffer,nativeClips[i],i):
          await makeGeminiSpeechClip(file,wav!,clips[i],i);
        const digest=await sha(converted);
        if(existing[i].staged){
          if(existing[i].sourceDigest!==digest)
            throw new Error("This chunk differs from the one already uploaded. Use the original WAV.");
          uploaded++;setCount(uploaded);continue;
        }
        const started=await readJSON<{assetId:string;uploadSessionUrl:string;chunkBytes:number}>(
          base+"/session-recaps/audio/upload/start",{
            method:"POST",headers:{"content-type":"application/json"},signal:abort.signal,
            body:JSON.stringify({recapId,connectionId,filename:converted.name,
              mimeType:"audio/wav",byteSize:converted.size,
              durationMs:parts[i].endMs-parts[i].startMs,processingJobId:job.id}),
          });
        setUploadBytes({sent:0,total:converted.size});
        const remote=await uploadRecordingToDrive(converted,started.uploadSessionUrl,
          (sent,total)=>setUploadBytes({sent,total}),
          {chunkBytes:started.chunkBytes,signal:abort.signal});
        await readJSON<{ready:boolean}>(base+"/session-recaps/audio/upload/finish",{
          method:"POST",headers:{"content-type":"application/json"},signal:abort.signal,
          body:JSON.stringify({assetId:started.assetId,remoteFileId:remote.id}),
        });
        await readJSON<{staged:boolean}>(staging,{
          method:"POST",headers:{"content-type":"application/json"},signal:abort.signal,
          body:JSON.stringify({recapId,jobId:job.id,action:"attach",trackIndex:index,
            chunkIndex:i,assetId:started.assetId,sourceDigest:digest}),
        });
        uploaded++;setCount(uploaded);await refresh(job.id);
      }
      setMessage(stopRequested.current?"Paused. Uploaded clips are safe; choose the same WAV to resume.":
        "This Craig voice track is staged in your Drive. Repeat for the other confirmed voices.");
    }catch(e){
      if(abort.signal.aborted)setMessage("Upload stopped. Previously attached clips remain saved.");
      else setError(errorMessage(e)+" Completed clips remain linked and can be skipped on retry.");
    }finally{active.current=null;setBusy(false);}
  }
  async function seal(){
    if(!job||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      const data=await readJSON<{queued:boolean;notice?:string}>(staging,{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,jobId:job.id,action:"seal"}),
      });
      if(data.queued){
        setJob({...job,status:"queued"});
        setMessage(data.notice??"All clips staged. Awaiting scheduler activation.");
      }
      await refresh(job.id);
    }catch(e){setError(errorMessage(e));}
    finally{setBusy(false);}
  }
  async function verifyOneStagedClip(){
    if(!job||busy||job.status!=="queued"||job.pausedAt)return;
    const clip=staged?.clips.find(item=>item.staged);
    if(!clip){setError("Stage a recording before verification.");return;}
    setBusy(true);setError("");setMessage("");
    try{
      const result=await readJSON<{verified:boolean;durationMs:number;notice?:string}>(
        jobs+"/verify-source",{
          method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({recapId,jobId:job.id,
            trackIndex:clip.trackIndex,chunkIndex:clip.chunkIndex}),
        });
      if(!result.verified)throw new Error("Google Drive source verification was not confirmed.");
      setMessage(result.notice??"One staged clip was verified without calling Gemini.");
    }catch(e){setError(errorMessage(e));}
    finally{setBusy(false);}
  }
  async function loadAssembly(){
    if(!job||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      const q="?recapId="+encodeURIComponent(recapId)+"&jobId="+encodeURIComponent(job.id);
      const preview=await readJSON<NonNullable<typeof assembly>>(jobs+"/assembled"+q);
      setAssembly(preview);
      if(!preview.ready)setMessage("Gemini assembly is not complete. You can return to this page later.");
    }catch(e){setError(errorMessage(e));}
    finally{setBusy(false);}
  }
  async function importAssembly(){
    if(!job||!assembly?.ready||busy)return;
    if(assembly.existing?.published){
      setError("Unpublish the existing transcript before replacing it.");return;
    }
    const replacing=Boolean(assembly.existing);
    if(replacing&&!window.confirm("Replace the current unpublished transcript with the assembled Gemini transcript? Your earlier manual edits will be lost."))return;
    setBusy(true);setError("");setMessage("");
    try{
      const result=await readJSON<{saved:boolean;notice?:string;count:number}>(jobs+"/assembled",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({recapId,jobId:job.id,replace:replacing,
          expectedUpdatedAt:replacing?assembly.existing?.updatedAt:null}),
      });
      if(!result.saved)throw new Error("Transcript import was not confirmed.");
      setAssembly(null);onSaved();
      setMessage(result.notice??"Assembled dialogue saved privately. Review the transcript below before publishing.");
    }catch(e){setError(errorMessage(e));}
    finally{setBusy(false);}
  }
  const attached=staged?.clips.filter(x=>x.staged).length??0;
  const selectedParts=nativeBuffer?nativeClips:clips;
  const estimatedUploadBytes=selectedParts.reduce((total,part)=>total+44+part.targetFrames*2,0);
  const chosenCraigEntry=trackIndex!==""?craigEntries[Number(trackIndex)]:undefined;
  const activeClipPercent=clipPercent(count,selectedParts.length);
  const uploadedPercent=clipPercent(uploadBytes.sent,uploadBytes.total);
  const transcribed=job?.progress?.completed??job?.completedChunks??0;
  return <section className="session-recap-reading" aria-label="Prepare Gemini background transcription audio">
    <h4>Prepare Gemini for unattended transcription</h4>
    <p className="campaign-empty-copy">
      Stage each isolated Craig voice recording in your own Google Drive. TWE converts
      standard PCM WAV audio locally into four-minute speech clips without uploading
      source audio to TWE storage. Keep the browser open for the initial upload only.
      The unattended Gemini runner is not enabled yet, so staging will not start AI charges.
    </p>
    <div className="session-recap-import-notice" role="note">
      <strong>Usage and privacy:</strong> Each prepared clip uses storage in your Google Drive.
      Gemini requests, when enabled, consume your own Google AI Studio project&apos;s quota and
      may incur charges if your project has billing enabled. TWE cannot read Google&apos;s
      remaining free transcription allowance from this connection. Check the
      <a href="https://aistudio.google.com/usage" target="_blank" rel="noopener noreferrer">
        {" Google AI Studio usage dashboard"}
      </a> for actual provider limits and usage. Clip progress below measures TWE processing,
      <strong> not your remaining Gemini quota</strong>.
    </div>
    {driveAccounts.length===0&&<p className="session-recap-import-notice">
      <a href="/account">Connect Google Drive in Account</a> before preparing speech clips.
    </p>}
    <label>Saved Craig recording
      <select disabled={busy} value={importId} onChange={event=>void chooseCraig(event.target.value)}>
        <option value="">Select the recording for this recap</option>
        {imports.map(item=><option key={item.id} value={item.id}>
          {item.sessionDate} — {item.sourceLabel}
        </option>)}
      </select>
    </label>
    {savedJobs.length>0&&<label>Resume a saved Gemini job
      <select value={job?.id??""} disabled={busy} onChange={event=>{
        const chosen=savedJobs.find(row=>row.id===event.target.value);
        if(chosen)void chooseCraig(chosen.importId);
      }}>
        {savedJobs.map(row=><option key={row.id} value={row.id}>
          {imports.find(item=>item.id===row.importId)?.sourceLabel??"Saved Craig recording"}
          {" — "}{readableState(row)}
        </option>)}
      </select>
    </label>}
    {tracks.length>0&&<p className="campaign-empty-copy">
      {tracks.length} confirmed Craig speaker tracks. Prepare each one separately.
    </p>}
    {driveAccounts.length>0&&<label>My Drive account
      <select disabled={busy} value={connectionId}
        onChange={event=>setConnectionId(event.target.value)}>
        {driveAccounts.map(item=><option key={item.id} value={item.id}>
          {item.displayName||"Google Drive"}
        </option>)}
      </select>
    </label>}
    {!job&&<div>
      <label style={{display:"block",marginBlock:"0.75rem"}}>
        <input type="checkbox" checked={approve} disabled={busy}
          onChange={event=>setApprove(event.target.checked)}/>
        I approve staging session audio in my own Drive and later sending it to my
        connected Gemini project. I understand that Google privacy and billing terms apply.
      </label>
      <button type="button" className="campaign-secondary"
        disabled={busy||!approve||!importId||!tracks.length||!connectionId}
        onClick={()=>void prepareJob()}>
        {busy?"Saving…":"Create private Gemini job"}
      </button>
    </div>}
    {job&&<>
      <div className="session-recap-reading" aria-label="Saved Gemini job progress">
        <p><strong>{readableState(job)}</strong></p>
        <p className="campaign-empty-copy">
          Prepared audio: {attached} of {staged?.totalChunks??0} clips.
          {" "}Transcribed: {transcribed} of {job.totalChunks}
          {" "}({clipPercent(transcribed,job.totalChunks)}%).
          {" "}Submitted to Gemini: {job.progress?.submitted??0}.
          {" "}Processing: {job.progress?.leased??0}.
          {" "}Needing attention: {job.progress?.failed??job.failedChunks}.
        </p>
        {job.totalChunks>0&&<progress value={transcribed} max={job.totalChunks}
          aria-label="Completed Gemini transcript clips"/>}
        {staged&&staged.totalChunks>0&&<progress value={attached}
          max={staged.totalChunks} aria-label="Prepared audio upload progress"/>}
        {tracks.length>0&&staged&&<p className="campaign-empty-copy">
          {tracks.map(track=>{
            const items=staged.clips.filter(c=>c.trackIndex===track.index);
            return track.displayName+": "+items.filter(c=>c.staged).length+"/"+items.length;
          }).join(" · ")}
        </p>}
        {job.nextEligibleAt&&!job.pausedAt&&<p className="campaign-empty-copy">
          Next eligible processing: {new Date(job.nextEligibleAt).toLocaleString()}.
        </p>}
        {issueExplanation(job.failureCode)&&<p className="session-recap-import-notice" role="status">
          {issueExplanation(job.failureCode)}
        </p>}
        {job.pausedAt&&<p className="session-recap-import-notice">This job is paused.
          Previously uploaded clips and completed transcripts are preserved.</p>}
        <div className="session-recap-form-actions">
          <button type="button" className="campaign-secondary" disabled={busy}
            onClick={()=>{void reloadJobs(job.id).then(()=>refresh(job.id)).catch(e=>setError(errorMessage(e)));}}>
            Refresh progress
          </button>
          {!["cancelled","completed","failed"].includes(job.status)&&<>
            {job.pausedAt
              ?<button type="button" className="campaign-secondary" disabled={busy}
                  onClick={()=>void changeJobState("resume")}>Resume job</button>
              :<button type="button" className="campaign-secondary" disabled={busy}
                  onClick={()=>void changeJobState("pause")}>Pause job</button>}
            <button type="button" className="campaign-secondary" disabled={busy}
              onClick={()=>void changeJobState("cancel")}>Cancel job</button>
          </>}
        </div>
      </div>
      {job.status==="awaiting_source"&&!job.pausedAt&&<>
        <label>Craig speaker track to prepare
          <select value={trackIndex} disabled={busy}
            onChange={event=>{setTrackIndex(event.target.value);setFile(null);setWav(null);setClips([]);
              setLongSource(null);setSourceMessage("");setSourceTransfer({bytes:0,total:0});}}>
            <option value="">Select one voice</option>
            {tracks.map(item=><option key={item.index} value={item.index}>
              {item.displayName} ({item.discordName})
            </option>)}
          </select>
        </label>
        {chosenCraigEntry&&<p className="campaign-empty-copy">
          Craig source: {chosenCraigEntry.filename} · {bytesLabel(chosenCraigEntry.uncompressedBytes)}.
          {chosenCraigEntry.uncompressedBytes>16*1024*1024?
            " This track is too large for direct browser loading.":" Short native source decoding may be available in this browser."}
        </p>}
        {trackIndex!==""&&<div className="session-recap-reading">
          <p><strong>Full-length original audio — bounded transfer</strong></p>
          <p className="campaign-empty-copy">
            Streaming FLAC conversion reads up to {CRAIG_FLAC_READ_BYTES / 1024} KiB of
            compressed source per request, decodes into four-minute mono WAV clips,
            and uploads them to your connected Drive. This uses Cloudflare R2 reads,
            your device&apos;s CPU and Google Drive space. Keep the page open; closing it
            stops local decoding, but completed clips stay saved. Reopening must
            re-decode the source to verify earlier clip checksums. Long AAC/M4A can be inspected but not decoded or uploaded yet.
          </p>
          <p className="campaign-empty-copy">
            Inspect this Craig speaker track without opening the whole file.
            Only 1 MiB may be read in a request; repeated reads still count
            toward TWE hosting usage. Remaining Cloudflare R2 read quota is not available here.
            The inspection button only checks metadata. <strong>Prepare entire FLAC</strong>
            performs local decoding and Drive uploads; it does not transcribe.
            Full-length AAC packet metadata is now inspected with bounded reads, but decoding and Drive upload are not yet available. Inspection uses hosting R2 reads; quota remaining is unknown.
          </p>
          <div className="session-recap-form-actions">
            <button type="button" className="campaign-primary"
              disabled={busy||sourceBusy||!job||job.status!=="awaiting_source"||
                Boolean(job.pausedAt)||!connectionId||!importId}
              onClick={()=>void prepareFullFlacToDrive()}>
              {busy?"Preparing FLAC…":"Prepare entire FLAC in my Drive"}
            </button>
            <button type="button" className="campaign-secondary"
              disabled={busy||sourceBusy} onClick={()=>void inspectLongCraig()}>
              {sourceBusy?"Reading source…":"Inspect long Craig track"}
            </button>
            <button type="button" className="campaign-secondary"
              disabled={busy||sourceBusy} onClick={()=>void saveLongCraigToComputer()}>
              Save original to computer (streaming)
            </button>
            {sourceBusy&&<button type="button" className="campaign-secondary"
              onClick={()=>longAbort.current?.abort()}>Stop transfer</button>}
          </div>
          {longSource&&<p className="campaign-empty-copy" role="status">
            Verified {longSource.meta.mimeType==="audio/flac"?"FLAC":"MPEG-4 AAC"}
            {" "}· {bytesLabel(longSource.meta.bytes)}.
            {longSource.durationMs!==null?
              " Duration: "+(longSource.durationMs/60000).toFixed(1)+" min.":" Duration not available from this header."}
            {longSource.sampleRate!==null?" "+longSource.sampleRate+" Hz.":""}
            {longSource.aacPackets!==null?
              " "+longSource.aacPackets+" AAC packets indexed; no audio decoded.":""}
          </p>}
          {sourceTransfer.total>0&&<div role="status">
            <p>Source bytes retrieved: {bytesLabel(sourceTransfer.bytes)} /
              {" "}{bytesLabel(sourceTransfer.total)}
              {" "}({clipPercent(sourceTransfer.bytes,sourceTransfer.total)}%).
              Inspection reads only the file header, so a small percentage is normal.
            </p>
            <progress value={sourceTransfer.bytes} max={sourceTransfer.total}
              aria-label="Original Craig audio transfer bytes"/>
          </div>}
          {sourceMessage&&<p role="status" className="session-recap-import-notice">{sourceMessage}</p>}
        </div>}
        <button type="button" className="campaign-secondary"
          disabled={busy||trackIndex===""||
            (chosenCraigEntry?.uncompressedBytes??0)>16*1024*1024}
          onClick={()=>void loadShortCraigTrack()}>
          {busy?"Loading Craig track…":"Load short original Craig track"}
        </button>
        <p className="campaign-empty-copy">
          <strong>Compressed-track warning:</strong> Direct AAC/FLAC decoding is
          browser-dependent and limited to four minutes and 16 MiB per track,
          with a 96 MiB decoded-audio safety budget. Multi-hour Craig recordings
          must still be converted to an ordinary PCM WAV or processed by a future
          streaming decoder; this tool never attempts to decode hours of compressed audio at once.
        </p>
        <label>Or select PCM WAV / short AAC or FLAC for this speaker
          <input type="file" accept=".wav,.flac,.m4a,.mp4,audio/wav,audio/flac,audio/mp4"
            disabled={busy||trackIndex===""} onChange={event=>void chooseWav(event)}/>
        </label>
        {file&&<div className="session-recap-reading" role="status">
          <p>{file.name} · {selectedParts.length} independently playable speech clips.
            {nativeFormat?" Decoded locally from "+nativeFormat.toUpperCase()+".":" PCM WAV, read in four-minute slices."}
          </p>
          <p className="campaign-empty-copy">
            <strong>Estimated new Drive storage:</strong> {bytesLabel(estimatedUploadBytes)}
            {" "}({selectedParts.length} files). Your actual Drive free space is not exposed
            by the TWE connection; confirm capacity in Google Drive.
          </p>
        </div>}
        <div className="session-recap-form-actions">
          <button type="button" className="campaign-primary"
            disabled={busy||!file||!selectedParts.length||!connectionId}
            onClick={()=>void upload()}>
            {busy?"Preparing and uploading…":"Prepare and upload this voice"}
          </button>
          {busy&&<button type="button" className="campaign-secondary"
            onClick={()=>{stopRequested.current=true;setMessage("Stopping after current clip.");}}>
            Stop after current clip
          </button>}
          <button type="button" className="campaign-secondary" disabled={busy||!attached}
            onClick={()=>void seal()}>Seal fully prepared job</button>
        </div>
        {busy&&<div role="status" className="session-recap-reading">
          <p>Checked or uploaded {count} / {selectedParts.length} clips ({activeClipPercent}%).</p>
          <progress max={selectedParts.length} value={count} aria-label="Prepared audio clip progress"/>
          {uploadBytes.total>0&&<>
            <p>Current Drive upload: {bytesLabel(uploadBytes.sent)} / {bytesLabel(uploadBytes.total)}
              {" "}({uploadedPercent}%).</p>
            <progress max={uploadBytes.total} value={uploadBytes.sent} aria-label="Current Google Drive upload bytes"/>
          </>}
        </div>}
      </>}
      {(["queued","awaiting_review","completed"].includes(job.status))&&<div className="session-recap-reading">
        <h5>Assembled Gemini transcript</h5>
        <button type="button" className="campaign-secondary" disabled={busy}
          onClick={()=>void loadAssembly()}>
          {busy?"Checking…":"Check assembled transcript"}
        </button>
        {assembly&&!assembly.ready&&<p className="campaign-empty-copy">
          {assembly.assembled??0} of {assembly.total??0} fragments assembled.
          A finished transcript will remain private until you choose to import and review it.
        </p>}
        {assembly?.ready&&<>
          <p><strong>{assembly.count?.toLocaleString()??0} captions</strong> assembled.
            {assembly.existing?" An existing transcript is already saved.":""}
          </p>
          <div style={{maxHeight:250,overflowY:"auto"}}>
            {assembly.cues?.slice(0,12).map((cue,i)=><p key={cue.startMs+":"+i}>
              <strong>{cue.speakerName}{cue.characterName?" ("+cue.characterName+")":""}:</strong>{" "}
              {cue.text}
            </p>)}
          </div>
          <button type="button" className="campaign-primary"
            disabled={busy||assembly.existing?.published===true}
            onClick={()=>void importAssembly()}>
            {assembly.existing?"Replace existing private transcript after confirmation":"Load into private transcript for review"}
          </button>
          {assembly.existing?.published&&<p className="campaign-empty-copy">
            Unpublish your existing transcript before importing Gemini dialogue.
          </p>}
        </>}
      </div>}
      {job.status==="queued"&&!job.pausedAt&&<div>
        <p className="session-recap-import-notice">
          Audio prepared. Scheduled Gemini inference is not enabled yet; no automatic
          requests or provider charges will occur.
        </p>
        <button type="button" className="campaign-secondary" disabled={busy||!attached}
          onClick={()=>void verifyOneStagedClip()}>
          {busy?"Verifying Drive audio…":"Verify one saved clip from my Drive"}
        </button>
        <p className="campaign-empty-copy">
          Checks the first staged clip, including its checksum and playable audio format.
          This does not transcribe audio, and verification is limited to once every two minutes.
        </p>
      </div>}
    </>}
    {message&&<p className="session-recap-import-notice" role="status">{message}</p>}
    {error&&<p className="campaign-error" role="alert">{error}</p>}
  </section>;
}
