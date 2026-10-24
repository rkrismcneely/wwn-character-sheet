"use client";
import { extractObsidianZip, type VaultAsset } from "@/lib/campaigns/journal-zip";
import { referencedJournalAssets, replaceJournalAssetLinks } from "@/lib/campaigns/journal-asset-links";
import { useEffect, useRef, useState } from "react";
import { JOURNAL_FILE_TYPES, MAX_JOURNAL_FILE_BYTES, verifyJournalFileSignature } from "@/lib/campaigns/journal-files";
import { readLegendKeeperBackup, inspectLegendKeeperBackup, describeLegendKeeperSchema } from "@/lib/campaigns/legendkeeper-native";

type VaultEntry={path:string;content:string};
type Preview={notes:{path:string;title:string}[];folders:string[];unresolvedLinks:{source:string;target:string}[]};
export function JournalImport({endpoint,onImported}:{endpoint:string;onImported:()=>Promise<void>}){
 const [entries,setEntries]=useState<VaultEntry[]|null>(null);
 const [source,setSource]=useState<"obsidian"|"legendkeeper">("obsidian");
 const [preview,setPreview]=useState<Preview|null>(null);
 const [assets,setAssets]=useState<VaultAsset[]>([]);
 const completedUploads=useRef(new Map<string,string>());
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [result,setResult]=useState("");
 const [progress,setProgress]=useState("");
 const [nativeInspection,setNativeInspection]=useState<string>("");
 const [nativeSchema,setNativeSchema]=useState("");
 useEffect(()=>{
  // Opening the import panel opportunistically reclaims abandoned uploads older than a day.
  void fetch(endpoint+"/files/cleanup",{method:"POST"}).catch(()=>{});
 },[endpoint]);
 async function cleanupUnusedUploads(){
  const urls=[...new Set(completedUploads.current.values())];
  const outcomes=await Promise.allSettled(urls.map(async url=>{
   const response=await fetch(url,{method:"DELETE"});
   // 409 means the page saved the reference and the upload must be kept.
   if(!response.ok&&response.status!==404&&response.status!==409)
    throw new Error("Could not clean an unused attachment.");
   for(const [key,value] of completedUploads.current){
    if(value===url)completedUploads.current.delete(key);
   }
  }));
  const failed=outcomes.filter(outcome=>outcome.status==="rejected").length;
  if(failed)setError(failed+" abandoned attachments could not be cleaned up. Retry before leaving this page.");
  return failed===0;
 }
 async function send(confirm:boolean){
  if(!entries)return;
  setBusy(true);setError("");setProgress(confirm?"Importing pages...":"Preparing preview...");
  try{
   const response=await fetch(endpoint+"/import-preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entries,confirm,source})});
   const body=await response.json() as {error?:string;preview:Preview;result:{created:number;foldersCreated:number;skipped:number;createdPaths:string[]}};
   if(!response.ok)throw new Error(body.error||"Import failed");
   setPreview(body.preview);
   if(confirm){
    let uploaded=0,unlinked=0;
    if(assets.length){
     const listing=await fetch(endpoint);
     if(!listing.ok)throw new Error("Pages imported, but attachment linking could not start.");
     const journal=await listing.json() as {entries:{id:string;kind:string;sourcePath?:string|null;source?:string|null;content:string}[]};
     const createdPaths=new Set(body.result.createdPaths);
     for(const [index,note] of entries.entries()){
      setProgress("Linking attachments: page "+(index+1)+" of "+entries.length);
      const page=journal.entries.find(e=>e.kind==="page"&&e.source===source&&e.sourcePath===note.path);
      if(!page){unlinked++;continue;}
      // Existing imports may have been edited by a GM. Never rewrite them.
      // A retry may finish untouched imports or uploads from this session.
      const pending=[...completedUploads.current.keys()].some(key=>key.startsWith(page.id+"\u0000"));
      if(!createdPaths.has(note.path)&&page.content!==note.content&&!pending)continue;
      const links=referencedJournalAssets(page.content,note.path,assets);
      if(!links.length)continue;
      const urls=new Map<string,string>();
      for(const asset of links){
       const key=page.id+"\u0000"+asset.path;
       const previous=completedUploads.current.get(key);
       if(previous){urls.set(asset.path,previous);continue;}
       try{
        const data=new FormData();
        data.set("entryId",page.id);
        data.set("file",new File([asset.bytes.slice().buffer as ArrayBuffer],asset.filename,{type:asset.mime}));
        const response=await fetch(endpoint+"/files",{method:"POST",body:data});
        const upload=await response.json() as {id?:string;error?:string};
        if(!response.ok||!upload.id)throw new Error(upload.error||"Upload failed");
        const url=endpoint+"/files/"+upload.id;
        completedUploads.current.set(key,url);
        urls.set(asset.path,url);uploaded++;
       }catch{unlinked++;}
      }
      const updated=replaceJournalAssetLinks(page.content,note.path,assets,urls);
      if(updated!==page.content){
       const response=await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:page.id,content:updated})});
       if(!response.ok)throw new Error("Attachments uploaded but page links could not be saved.");
      }
     }
    }
    if(unlinked){
     setError(unlinked+" attachments could not be uploaded. The imported pages are saved; confirm again to retry missing attachments.");
     setResult(uploaded+" attachments linked successfully.");
     await onImported();
     return;
    }
    setResult("Imported "+body.result.created+" pages and "+body.result.foldersCreated+" folders; "+uploaded+" attachments linked.");
    completedUploads.current.clear();
    setEntries(null);setAssets([]);setPreview(null);await onImported();
   }
  }catch(e){setError(e instanceof Error?e.message:"Import failed");}
  finally{setBusy(false);setProgress("");}
 }
 async function chooseNative(file:File|undefined){
  if(!file||busy)return;
  setNativeInspection("");setNativeSchema("");setError("");
  try{
   const format=file.name.toLowerCase().endsWith(".lk")?"lk":file.name.toLowerCase().endsWith(".json")?"json":null;
   if(!format)throw new Error("Choose a .lk or .json LegendKeeper backup.");
   const backup=await readLegendKeeperBackup(await file.arrayBuffer(),format);
   const inspected=inspectLegendKeeperBackup(backup);
   setNativeSchema(describeLegendKeeperSchema(backup));
   const summary=inspected.recognized
    ? inspected.resourceCount+" resources, "+inspected.pageCount+" pages, "+inspected.mapCount+" maps, "+inspected.boardCount+" boards, "+inspected.unknownCount+" unclassified records."
    : "Unrecognized native backup structure.";
   setNativeInspection(summary+" Inspection only: no pages or assets were imported.");
  }catch(error){setError(error instanceof Error?error.message:"Could not inspect native backup.");}
 }
 async function chooseZip(file:File|undefined){
  if(!file||busy)return;
  if(!await cleanupUnusedUploads())return;
  setError("");setPreview(null);setResult("");
  try{
   const extracted=await extractObsidianZip(await file.arrayBuffer());
   const notes=extracted.notes;
   if(!notes.length)throw new Error("No Markdown notes found in ZIP.");
   const root=notes.every(note=>note.path.includes("/")&&note.path.split("/")[0]===notes[0].path.split("/")[0])?notes[0].path.split("/")[0]+"/":"";
   const cleaned=notes.map(note=>({...note,path:note.path.startsWith(root)?note.path.slice(root.length):note.path}));
   if(new Blob([JSON.stringify({entries:cleaned,confirm:true})]).size>900000)throw new Error("ZIP notes exceed the current import limit.");
   setEntries(cleaned);
   setAssets(extracted.assets.map(asset=>({...asset,path:asset.path.startsWith(root)?asset.path.slice(root.length):asset.path})));
  }catch(e){setError(e instanceof Error?e.message:"Could not open ZIP.");}
 }
 async function chooseFiles(files:FileList|null){
  if(!files||busy)return;
  if(!await cleanupUnusedUploads())return;
  setError("");setPreview(null);setResult("");
  const notes:VaultEntry[]=[];
  const folderAssets:VaultAsset[]=[];
  let assetBytes=0;
  for(const file of Array.from(files)){
   const path=file.webkitRelativePath||file.name;
   if(!path.toLowerCase().endsWith(".md")){
    const extension=path.split(".").at(-1)?.toLowerCase()??"";
    const mime=JOURNAL_FILE_TYPES[extension];
    if(!mime)continue;
    if(file.size>MAX_JOURNAL_FILE_BYTES||assetBytes+file.size>16_000_000){setError("Folder attachments exceed the import size limit.");return;}
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(!verifyJournalFileSignature(mime,bytes)){setError("An attachment has an invalid file signature.");return;}
    folderAssets.push({path,filename:file.name,mime,bytes});
    assetBytes+=file.size;
    continue;
   }
   if(file.size>100000){setError("A note exceeds the 100 KB limit.");return;}
   notes.push({path,content:await file.text()});
  }
  if(notes.length>1000){setError("Select at most 1000 Markdown notes.");return;}
  if(!notes.length){setError("Select a folder containing Markdown notes.");return;}
  const root=notes.every(note=>note.path.includes("/")&&note.path.split("/")[0]===notes[0].path.split("/")[0])?notes[0].path.split("/")[0]+"/":"";
  const cleaned=notes.map(note=>({...note,path:note.path.startsWith(root)?note.path.slice(root.length):note.path}));
  const size=new Blob([JSON.stringify({entries:cleaned,confirm:true})]).size;
  if(size>900000){setError("This folder exceeds the current 900 KB import limit. Split it into smaller folders.");return;}
  setEntries(cleaned);
  setAssets(folderAssets.map(asset=>({...asset,path:asset.path.startsWith(root)?asset.path.slice(root.length):asset.path})));
 }
 return <section className="journal-import">
  <h3>Import campaign notes</h3>
  <label>Exported from <select disabled={busy||!!entries} value={source} onChange={e=>{setSource(e.target.value as "obsidian"|"legendkeeper");setPreview(null);setNativeInspection("");setNativeSchema("");}}><option value="obsidian">Obsidian</option><option value="legendkeeper">LegendKeeper (Markdown export)</option></select></label>
  <p>Select an exported Markdown ZIP or folder. For import, export LegendKeeper as Markdown; native .lk/JSON files can be inspected but not imported. Notes and referenced images/PDFs import as GM-only; existing pages stay unchanged.</p>
  {source==="legendkeeper"&&<label>Inspect native LegendKeeper backup (.lk or .json) <input type="file" accept=".lk,.json,application/json" disabled={busy} onChange={e=>void chooseNative(e.target.files?.[0])}/></label>}
  {nativeInspection&&<p role="status">{nativeInspection}</p>}
  {nativeSchema&&<details><summary>Backup structure (field names and data types only)</summary><pre>{nativeSchema}</pre><p>No backup content is uploaded during inspection.</p></details>}
  <label>Markdown ZIP<input type="file" accept=".zip,application/zip" disabled={busy} onChange={e=>void chooseZip(e.target.files?.[0])}/></label>
  <label>Markdown folder<input type="file" multiple disabled={busy} ref={element=>{if(element)element.setAttribute("webkitdirectory","");}} onChange={e=>void chooseFiles(e.target.files)}/></label>
  {entries&&<><p>{entries.length} Markdown notes selected{assets.length?", "+assets.length+" attachment files":""}.</p><button disabled={busy} onClick={()=>void send(false)}>Preview Import</button></>}
  {preview&&<div><p>{preview.notes.length} pages, {preview.folders.length} folders, {preview.unresolvedLinks.length} unresolved links.</p>
   {preview.unresolvedLinks.length>0&&<details><summary>Unresolved links</summary><ul>{preview.unresolvedLinks.slice(0,30).map((link,i)=><li key={i}>{link.source}: {link.target}</li>)}</ul></details>}
   <button disabled={busy} onClick={()=>void send(true)}>Confirm Import</button>
   <button disabled={busy} onClick={()=>{void (async()=>{if(!await cleanupUnusedUploads())return;setPreview(null);setEntries(null);setAssets([]);})();}}>Cancel</button>
  </div>}
  {progress&&<p role="status">{progress}</p>}
  {error&&<p role="alert">{error}</p>}{result&&<p role="status">{result}</p>}
 </section>;
}
