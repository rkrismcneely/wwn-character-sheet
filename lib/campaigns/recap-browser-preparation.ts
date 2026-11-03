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
  await saveBrowserRecapFile(key,file);
  return [{name:file.name,bytes:file.size,mimeType:file.type||"application/octet-stream",
    startMs:0,durationMs,localKey:key}];
}
type FFmpegRunner={
  load:(options:{coreURL:string;wasmURL:string;classWorkerURL?:string})=>Promise<unknown>;
  writeFile:(name:string,data:Uint8Array)=>Promise<unknown>;
  exec:(args:string[])=>Promise<number>;
  readFile:(name:string)=>Promise<Uint8Array|string>;
  deleteFile:(name:string)=>Promise<unknown>;
  terminate:()=>void;
};
type FFmpegModule={FFmpeg:new()=>FFmpegRunner};
let converter:FFmpegRunner|null=null;
async function loadBrowserFFmpeg():Promise<FFmpegRunner>{
  if(converter)return converter;
  const url:string="https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
  const mod=await import(/* @vite-ignore */ url) as FFmpegModule;
  const ffmpeg=new mod.FFmpeg();
  const base="https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
  const blobURL=async(path:string,type:string)=>{
    const response=await fetch(base+"/"+path);
    if(!response.ok)throw Error("Could not load FFmpeg's browser engine.");
    return URL.createObjectURL(new Blob([await response.arrayBuffer()],{type}));
  };
  const js=await blobURL("ffmpeg-core.js","text/javascript");
  const wasm=await blobURL("ffmpeg-core.wasm","application/wasm");
  try{await ffmpeg.load({coreURL:js,wasmURL:wasm,
      classWorkerURL:window.location.origin+"/api/recap-ffmpeg/worker.js"});converter=ffmpeg;return ffmpeg;}
  finally{URL.revokeObjectURL(js);URL.revokeObjectURL(wasm);}
}
export async function prepareRecapWithFFmpeg(file:File,options:{
  provider:RecapTranscriber;campaignId:string;recapId:string;sourceId:string;
  onProgress?:(completed:number,total:number)=>void;
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
        ready[part.index]={name:part.name,bytes:saved.size,mimeType:mime,
          startMs:part.startMs,durationMs:part.durationMs,localKey:part.key};
        options.onProgress?.(ready.filter(Boolean).length,count);continue;
      }
    }catch{/* Missing or partial audio must be regenerated. */}
    missing.push(part.index);
  }
  if(!missing.length)return ready;
  const ffmpeg=await loadBrowserFFmpeg();
  const input="input."+(/\.wav$/iu.test(file.name)?"wav":/\.mp3$/iu.test(file.name)?"mp3":
    /\.flac$/iu.test(file.name)?"flac":"m4a");
  try{
    await ffmpeg.writeFile(input,new Uint8Array(await file.arrayBuffer()));
    for(const index of missing){
      const part=plans[index],output="output-"+index+"."+ext;
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
  converter?.terminate();converter=null;
}
