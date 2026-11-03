"use client";

import type {PreparedPart,RecapTranscriber} from "./recap-stage-workflow";

/** Browser-private audio data; no TWE billing or third-party conversion upload. */
const DIRECTORY="twe-recap-audio-v2";
function assertKey(key:string){
  if(!/^[A-Za-z0-9_-]{1,120}$/u.test(key))throw Error("Invalid local recording reference.");
}
async function directory(){
  if(!navigator.storage?.getDirectory)
    throw Error("This browser does not support persistent origin-private audio storage. Use Google Drive or a supported browser.");
  const root=await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIRECTORY,{create:true});
}
export async function browserRecapFile(key:string):Promise<File>{
  assertKey(key);
  const handle=await (await directory()).getFileHandle(key);
  return handle.getFile();
}
export async function saveBrowserRecapFile(key:string,file:File,onBytes?:(done:number,total:number)=>void){
  assertKey(key);
  const handle=await (await directory()).getFileHandle(key,{create:true});
  const writable=await handle.createWritable();
  try {
    for(let at=0;at<file.size;at+=4*1024*1024){
      const slice=file.slice(at,Math.min(at+4*1024*1024,file.size));
      await writable.write(new Uint8Array(await slice.arrayBuffer()));
      onBytes?.(Math.min(at+slice.size,file.size),file.size);
    }
    await writable.close();
    const saved=await handle.getFile();
    if(saved.size!==file.size)throw Error("Prepared recording could not be verified after saving.");
  }catch(e){await writable.abort().catch(()=>{});throw e;}
}
export async function availableBrowserRecapFile(key:string,expectedBytes:number):Promise<boolean>{
  try{return (await browserRecapFile(key)).size===expectedBytes;}catch{return false;}
}
export async function browserRecapKey(...values:string[]):Promise<string>{
  const data=new TextEncoder().encode(values.join("\u0000"));
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",data));
  return "twe_"+Array.from(digest.slice(0,20),b=>b.toString(16).padStart(2,"0")).join("");
}
export function audioFileDuration(file:File):Promise<number>{
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const element=document.createElement("audio");
    let finished=false;
    const cleanup=()=>{
      if(finished)return false;
      finished=true;element.removeAttribute("src");element.load();
      URL.revokeObjectURL(url);clearTimeout(timer);return true;
    };
    const timer=setTimeout(()=>{
      if(cleanup())reject(Error("Could not determine audio duration. Choose a supported source file."));
    },12000);
    element.preload="metadata";
    element.onloadedmetadata=()=>{
      const duration=element.duration;
      if(cleanup()){
        if(Number.isFinite(duration)&&duration>0&&duration<=8*3600)
          resolve(Math.round(duration*1000));
        else reject(Error("Audio length is unavailable or outside the eight-hour limit."));
      }
    };
    element.onerror=()=>{if(cleanup())reject(Error("Browser could not read this audio format."));};
    element.src=url;
  });
}
export function recommendedRecapPreparation(provider:RecapTranscriber,
  input:{name:string;bytes:number;durationMs:number|null}):"original"|"ffmpeg"|"import"{
  if(provider==="import")return "import";
  if(provider==="local-whisper")return "ffmpeg";
  const max=provider==="groq"?16*1024*1024:11*1024*1024;
  return input.durationMs!==null&&input.durationMs<=30*60_000&&input.bytes<=max
    ?"original":"ffmpeg";
}
export function prepareRecapPartDuration(provider:RecapTranscriber){
  return provider==="local-whisper"?10*60_000:20*60_000;
}
export async function saveUnchangedAudio(file:File,options:{
  provider:RecapTranscriber;campaignId:string;recapId:string;sourceId:string;
  onBytes?:(done:number,total:number)=>void;
}):Promise<PreparedPart[]>{
  const durationMs=await audioFileDuration(file);
  const max=options.provider==="groq"?16*1024*1024:
    options.provider==="gemini"?11*1024*1024:2_000_000_000;
  if(options.provider==="local-whisper"&&!/\.wav$/iu.test(file.name))
    throw Error("Local Whisper requires PCM WAV. Select FFmpeg conversion.");
  if(options.provider==="import")throw Error("Select a prepared transcript instead.");
  if(file.size>max||durationMs>30*60_000&&options.provider!=="local-whisper")
    throw Error("This recording exceeds the chosen provider's clip limits. Use FFmpeg preparation.");
  const key=await browserRecapKey(options.campaignId,options.recapId,options.sourceId,
    options.provider,"original",String(file.size));
  await saveBrowserRecapFile(key,file,options.onBytes);
  return [{name:file.name,bytes:file.size,mimeType:file.type||"application/octet-stream",
    startMs:0,durationMs,localKey:key}];
}
type FFmpegRunner={
  load:(options:{coreURL:string;wasmURL:string;classWorkerURL?:string},
    controls?:{signal?:AbortSignal})=>Promise<unknown>;
  writeFile:(name:string,data:Uint8Array)=>Promise<unknown>;
  exec:(args:string[])=>Promise<number>;
  readFile:(name:string)=>Promise<Uint8Array|string>;
  deleteFile:(name:string)=>Promise<unknown>;
  terminate:()=>void;
};
type FFmpegModule={FFmpeg:new()=>FFmpegRunner};
let converter:FFmpegRunner|null=null;
let loadingConverter:FFmpegRunner|null=null;
let loadingAbort:AbortController|null=null;
const FFMPEG_START_TIMEOUT_MS=90_000;
async function loadBrowserFFmpeg():Promise<FFmpegRunner>{
  if(converter)return converter;
  if(loadingAbort)throw Error("The audio converter is already starting. Stop the current attempt before retrying.");
  const abort=new AbortController();
  loadingAbort=abort;
  let timedOut=false;
  let timeout:ReturnType<typeof setTimeout>|null=null;
  const urls:string[]=[];
  const load=(async()=>{
    let ffmpeg:FFmpegRunner|null=null;
    try{
      const wrapper:string="https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
      const mod=await import(/* @vite-ignore */ wrapper) as FFmpegModule;
      if(abort.signal.aborted)throw Error("Audio converter startup was cancelled.");
      ffmpeg=new mod.FFmpeg();
      loadingConverter=ffmpeg;
      // A module worker cannot use importScripts(). It must import the ESM core,
      // not the UMD build, which has no default export and can hang ffmpeg.load().
      const base="https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
      const blobURL=async(path:string,type:string)=>{
        const response=await fetch(base+"/"+path,{signal:abort.signal,cache:"force-cache"});
        if(!response.ok)throw Error("Audio converter engine download failed ("+response.status+").");
        const bytes=await response.arrayBuffer();
        if(!bytes.byteLength)throw Error("Audio converter engine download was empty.");
        const url=URL.createObjectURL(new Blob([bytes],{type}));
        urls.push(url);
        return url;
      };
      const [js,wasm]=await Promise.all([
        blobURL("ffmpeg-core.js","text/javascript"),
        blobURL("ffmpeg-core.wasm","application/wasm"),
      ]);
      if(abort.signal.aborted)throw Error("Audio converter startup was cancelled.");
      const worker=window.location.origin+"/api/recap-ffmpeg/worker.js";
      // Do not assume the same-origin worker proxy is healthy; a 404/502 or
      // returned HTML causes an uncaught worker error with no LOAD response.
      const workerCheck=await fetch(worker,{signal:abort.signal,cache:"no-store"});
      if(!workerCheck.ok||!workerCheck.headers.get("content-type")?.includes("javascript"))
        throw Error("Audio converter worker is unavailable (HTTP "+workerCheck.status+").");
      await ffmpeg.load({coreURL:js,wasmURL:wasm,classWorkerURL:worker},
        {signal:abort.signal});
      if(abort.signal.aborted)throw Error("Audio converter startup was cancelled.");
      converter=ffmpeg;
      return ffmpeg;
    }catch(error){
      ffmpeg?.terminate();
      if(abort.signal.aborted)throw Error("Audio converter startup was cancelled.");
      throw error;
    }finally{
      if(loadingConverter===ffmpeg)loadingConverter=null;
      for(const url of urls)URL.revokeObjectURL(url);
    }
  })();
  const cancelled=new Promise<never>((_,reject)=>{
    abort.signal.addEventListener("abort",()=>reject(Error(timedOut?
      "The browser audio converter did not start within 90 seconds. The converter was stopped; your recording is safe in Drive. Check network or browser extension blocking and try again.":
      "Audio conversion stopped. Your original recording is safe and completed sections are preserved.")),
    {once:true});
  });
  timeout=setTimeout(()=>{
    timedOut=true;abort.abort();loadingConverter?.terminate();
  },FFMPEG_START_TIMEOUT_MS);
  try{return await Promise.race([load,cancelled]);}
  catch(error){
    if(abort.signal.aborted)throw error;
    const reason=error instanceof Error?error.message:"Unknown converter startup error.";
    throw Error("The browser audio converter could not load: "+reason+
      " Your original recording is still saved. Retry or use an existing transcript.");
  }finally{
    if(timeout)clearTimeout(timeout);
    if(loadingAbort===abort)loadingAbort=null;
  }
}
export async function prepareRecapWithFFmpeg(file:File,options:{
  provider:RecapTranscriber;campaignId:string;recapId:string;sourceId:string;
  onProgress?:(completed:number,total:number)=>void;
  onStage?:(description:string,completed:number,total:number)=>void;
}):Promise<PreparedPart[]>{
  if(options.provider==="import")throw Error("Import a transcript instead of converting audio.");
  const durationMs=await audioFileDuration(file);
  const segmentMs=prepareRecapPartDuration(options.provider);
  const count=Math.ceil(durationMs/segmentMs);
  if(count<1||count>64)throw Error("Recording would require too many preparation parts.");
  const ext=options.provider==="local-whisper"?"wav":"m4a";
  const mime=ext==="wav"?"audio/wav":"audio/mp4";
  const prefix=await browserRecapKey(options.campaignId,options.recapId,options.sourceId,
    options.provider,"ffmpeg",String(file.size),String(durationMs));
  const ready:PreparedPart[]=[];
  const missing:number[]=[];
  options.onStage?.("Checking previously prepared sections…",0,count);
  const plans=Array.from({length:count},(_,i)=>{
    const startMs=i*segmentMs;
    return {index:i,startMs,durationMs:Math.min(segmentMs,durationMs-startMs),
      key:prefix+"_"+i,name:"session-part-"+String(i+1).padStart(3,"0")+"."+ext};
  });
  for(const part of plans){
    try{
      const saved=await browserRecapFile(part.key);
      if(saved.size>=128&&saved.size<=
        (options.provider==="local-whisper"?2_000_000_000:
          options.provider==="groq"?16*1024*1024:11*1024*1024)){
        const actualDuration=await audioFileDuration(new File([saved],part.name,{type:mime}));
        if(Math.abs(actualDuration-part.durationMs)>3500)throw Error("Cached section duration mismatch.");
        ready[part.index]={name:part.name,bytes:saved.size,mimeType:mime,
          startMs:part.startMs,durationMs:part.durationMs,localKey:part.key};
        options.onProgress?.(ready.filter(Boolean).length,count);continue;
      }
    }catch{/* Missing or partial audio must be regenerated. */}
    missing.push(part.index);
  }
  if(!missing.length)return ready;
  // FFmpeg.wasm buffers the entire input in its virtual filesystem and memory.
  // Refuse files likely to exhaust browser memory rather than crashing the tab.
  if(file.size>300*1024*1024)throw Error("This recording is too large for safe in-browser FFmpeg conversion. Use a smaller source or prepare the audio outside TWE.");
  options.onStage?.("Loading the browser audio converter…",ready.filter(Boolean).length,count);
  const ffmpeg=await loadBrowserFFmpeg();
  const input="input."+(/\.wav$/iu.test(file.name)?"wav":/\.mp3$/iu.test(file.name)?"mp3":
    /\.flac$/iu.test(file.name)?"flac":"m4a");
  try{
    options.onStage?.("Loading the original recording into the converter…",ready.filter(Boolean).length,count);
    await ffmpeg.writeFile(input,new Uint8Array(await file.arrayBuffer()));
    for(const index of missing){
      const part=plans[index],output="output-"+index+"."+ext;
      options.onStage?.("Converting audio section "+(index+1)+" of "+count+"…",ready.filter(Boolean).length,count);
      const args=["-hide_banner","-loglevel","error","-ss",String(part.startMs/1000),
        "-t",String(part.durationMs/1000),"-i",input,"-map","0:a:0",
        "-vn","-ac","1","-ar","16000","-c:a",
        ext==="wav"?"pcm_s16le":"aac"];
      if(ext==="m4a")args.push("-b:a","32k");
      args.push(output);
      const status=await ffmpeg.exec(args);
      if(status!==0)throw Error("FFmpeg could not prepare audio part "+(index+1)+".");
      const result=await ffmpeg.readFile(output);
      if(typeof result==="string"||result.byteLength<128)
        throw Error("FFmpeg generated an empty or unreadable audio section.");
      const max=options.provider==="groq"?16*1024*1024:
        options.provider==="gemini"?11*1024*1024:2_000_000_000;
      if(result.byteLength>max)throw Error("Prepared part exceeds the provider's size limit.");
      const prepared=new File([Uint8Array.from(result)],part.name,{type:mime});
      const actualDuration=await audioFileDuration(prepared);
      if(Math.abs(actualDuration-part.durationMs)>3500)
        throw Error("Prepared section "+(index+1)+" has an unexpected duration. It was not approved.");
      options.onStage?.("Saving audio section "+(index+1)+" of "+count+"…",ready.filter(Boolean).length,count);
      await saveBrowserRecapFile(part.key,prepared);
      ready[index]={name:part.name,bytes:prepared.size,mimeType:mime,
        startMs:part.startMs,durationMs:part.durationMs,localKey:part.key};
      await ffmpeg.deleteFile(output);
      options.onProgress?.(ready.filter(Boolean).length,count);
    }
  }finally{await ffmpeg.deleteFile(input).catch(()=>{});}
  return ready;
}
export function stopRecapFFmpeg(){
  loadingAbort?.abort();
  loadingConverter?.terminate();
  loadingConverter=null;
  converter?.terminate();
  converter=null;
}
