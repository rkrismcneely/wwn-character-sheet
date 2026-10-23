"use client";
import { useState } from "react";

type VaultEntry={path:string;content:string};
type Preview={notes:{path:string;title:string}[];folders:string[];unresolvedLinks:{source:string;target:string}[]};
export function JournalImport({endpoint,onImported}:{endpoint:string;onImported:()=>Promise<void>}){
 const [entries,setEntries]=useState<VaultEntry[]|null>(null);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [result,setResult]=useState("");
 async function send(confirm:boolean){
  if(!entries)return;
  setBusy(true);setError("");
  try{
   const response=await fetch(endpoint+"/import-preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entries,confirm})});
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||"Import failed");
   setPreview(body.preview);
   if(confirm){setResult(`Imported ${body.result.created} pages and ${body.result.foldersCreated} folders; skipped ${body.result.skipped} existing pages.`);setEntries(null);setPreview(null);await onImported();}
  }catch(e){setError(e instanceof Error?e.message:"Import failed");}
  finally{setBusy(false);}
 }
 async function chooseFiles(files:FileList|null){
  if(!files)return;
  setError("");setPreview(null);setResult("");
  const notes:VaultEntry[]=[];
  for(const file of Array.from(files)){
   const path=file.webkitRelativePath||file.name;
   if(!path.toLowerCase().endsWith(".md"))continue;
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
 }
 return <section className="journal-import">
  <h3>Import Obsidian notes</h3>
  <p>Select an exported Markdown folder. Notes import as GM-only; existing imported pages are kept unchanged.</p>
  <input type="file" multiple ref={element=>{if(element)element.setAttribute("webkitdirectory","");}} onChange={e=>void chooseFiles(e.target.files)}/>
  {entries&&<><p>{entries.length} Markdown notes selected.</p><button disabled={busy} onClick={()=>void send(false)}>Preview Import</button></>}
  {preview&&<div><p>{preview.notes.length} pages, {preview.folders.length} folders, {preview.unresolvedLinks.length} unresolved links.</p>
   {preview.unresolvedLinks.length>0&&<details><summary>Unresolved links</summary><ul>{preview.unresolvedLinks.slice(0,30).map((link,i)=><li key={i}>{link.source}: {link.target}</li>)}</ul></details>}
   <button disabled={busy} onClick={()=>void send(true)}>Confirm Import</button>
   <button disabled={busy} onClick={()=>{setPreview(null);setEntries(null);}}>Cancel</button>
  </div>}
  {error&&<p role="alert">{error}</p>}{result&&<p role="status">{result}</p>}
 </section>;
}
