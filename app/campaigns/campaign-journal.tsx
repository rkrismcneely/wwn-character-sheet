"use client";
import { useEffect, useState } from "react";
import { resolveJournalWikilinks } from "@/lib/campaigns/journal-links";
import { JournalImport } from "./journal-import";
import { SessionRecapMarkdown } from "./session-recap-markdown";
type Entry={id:string;parentId:string|null;title:string;content:string;kind:string;visibility:string;sourcePath?:string|null};
export function CampaignJournal({campaignId}:{campaignId:string}){
const [entries,setEntries]=useState<Entry[]>([]);
const [canEdit,setCanEdit]=useState(false);
const [selected,setSelected]=useState("");
const [preview,setPreview]=useState(false);
const [error,setError]=useState("");
const [draft,setDraft]=useState({title:"",content:"",visibility:"gm"});
const [editing,setEditing]=useState(false);
const [creatingFolder,setCreatingFolder]=useState(false);
const [parentId,setParentId]=useState<string|null>(null);
const [search,setSearch]=useState("");
const [readers,setReaders]=useState<{userId:string;name:string;selected:number}[]>([]);
const [readerEditing,setReaderEditing]=useState(false);
const [importOpen,setImportOpen]=useState(false);
const [uploading,setUploading]=useState(false);
const endpoint="/api/campaigns/"+encodeURIComponent(campaignId)+"/journal";
async function refresh(){
 const r=await fetch(endpoint+(preview?"?preview=player":""));
 const j=await r.json();
 if(!r.ok){setError(j.error||"Journal unavailable");return;}
 setEntries(j.entries);setCanEdit(j.canEdit);setError("");
}
useEffect(()=>{void refresh();},[campaignId,preview]);
const current=entries.find(e=>e.id===selected);
async function openReaders(id:string){
 const r=await fetch(endpoint+"?readers="+encodeURIComponent(id));const j=await r.json();
 if(!r.ok){setError(j.error||"Could not load players");return;}
 setReaders(j.readers);setReaderEditing(true);
}
async function saveReaders(){
 const r=await fetch(endpoint,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({entryId:selected,userIds:readers.filter(x=>x.selected).map(x=>x.userId)})});
 const j=await r.json();if(!r.ok){setError(j.error||"Could not save players");return;}setReaderEditing(false);
}
async function uploadJournalFile(file:File){
 if(!current||current.kind!=="page")return;
 setUploading(true);setError("");
 try{
  const body=new FormData();body.set("entryId",current.id);body.set("file",file);
  const response=await fetch(endpoint+"/files",{method:"POST",body});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||"Upload failed.");
  const url=endpoint+"/files/"+encodeURIComponent(result.id);
  const markdown=file.type.startsWith("image/")?"!["+file.name+"]("+url+")":"["+file.name+"]("+url+")";
  setDraft({title:current.title,visibility:current.visibility,content:current.content+"\\n"+markdown});
  setEditing(true);
 }catch(error){setError(error instanceof Error?error.message:"Upload failed.");}
 finally{setUploading(false);}
}
async function save(e:React.FormEvent){
 e.preventDefault();
 const r=await fetch(endpoint,{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(selected?{id:selected,...draft}:{kind:creatingFolder?"folder":"page",parentId,...draft})});
 const j=await r.json();
 if(!r.ok){setError(j.error||"Save failed");return;}
 setSelected(j.entry.id);setEditing(false);setCreatingFolder(false);await refresh();
}
return <section className="campaign-panel campaign-journal">
 <h2>Campaign Journal</h2>
 <div className="journal-actions">
 {canEdit&&<button onClick={()=>setPreview(true)}>View as Player</button>}
 {preview&&<button onClick={()=>setPreview(false)}>Return to GM View</button>}
 {canEdit&&<button onClick={()=>{setSelected("");setParentId(null);setCreatingFolder(false);setDraft({title:"",content:"",visibility:"gm"});setEditing(true);}}>New Page</button>}
 {canEdit&&<button onClick={()=>setImportOpen(open=>!open)}>{importOpen?"Close Import":"Import Obsidian"}</button>}
 {canEdit&&<button onClick={()=>{setSelected("");setParentId(null);setCreatingFolder(true);setDraft({title:"",content:"",visibility:"gm"});setEditing(true);}}>New Folder</button>}
 </div>
 {error&&<p role="alert">{error}</p>}
 {importOpen&&canEdit&&<JournalImport endpoint={endpoint} onImported={refresh}/>}
 {readerEditing&&canEdit&&<section aria-label="Selected journal readers"><h3>Share with players</h3>{readers.map((reader,index)=><label key={reader.userId}><input type="checkbox" checked={Boolean(reader.selected)} onChange={e=>setReaders(old=>old.map((item,i)=>i===index?{...item,selected:e.target.checked?1:0}:item))}/>{reader.name}</label>)}<button onClick={()=>void saveReaders()}>Save Players</button><button onClick={()=>setReaderEditing(false)}>Cancel</button></section>}
 <div className="journal-layout"><aside className="journal-sidebar">
 <input aria-label="Search journal" placeholder="Search pages" value={search} onChange={e=>setSearch(e.target.value)}/>
 {entries.filter(e=>e.title.toLowerCase().includes(search.toLowerCase())).map(e=><button key={e.id} style={{textAlign:"left",paddingLeft:e.parentId?24:8}} onClick={()=>{setSelected(e.id);setEditing(false);}}>{e.kind==="folder"?"📁 ":"▤ "}{e.title}</button>)}
 </aside><div className="journal-main">
 {editing&&canEdit?<form onSubmit={save}>
 <label>Title<input required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
 {!creatingFolder&&<label>Markdown<textarea rows={12} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/></label>}
 <label>Visibility<select value={draft.visibility} onChange={e=>setDraft({...draft,visibility:e.target.value})}><option value="gm">GM only</option><option value="players">All players</option><option value="selected">Selected players</option></select></label>
 <button type="submit">Save</button><button type="button" onClick={()=>setEditing(false)}>Cancel</button>
 </form>:current?<article><h3>{current.title}</h3>{canEdit&&<button onClick={()=>{setCreatingFolder(false);setDraft({title:current.title,content:current.content,visibility:current.visibility});setEditing(true);}}>Edit</button>}{canEdit&&current.kind==="page"&&<label>Attach image or PDF <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" disabled={uploading} onChange={event=>{const file=event.target.files?.[0];if(file)void uploadJournalFile(file);event.target.value="";}}/></label>}{canEdit&&current.visibility==="selected"&&<button onClick={()=>void openReaders(current.id)}>Choose Players</button>}{canEdit&&current.kind==="folder"&&<button onClick={()=>{setSelected("");setParentId(current.id);setCreatingFolder(false);setDraft({title:"",content:"",visibility:"gm"});setEditing(true);}}>New Page Here</button>}{current.kind==="page"&&<SessionRecapMarkdown content={resolveJournalWikilinks(current.content,current,entries)} onJournalNavigate={id=>{if(entries.some(entry=>entry.id===id&&entry.kind==="page")){setSelected(id);setEditing(false);}}}/>}</article>:<p>Select a page.</p>}
 </div></div></section>;
}
