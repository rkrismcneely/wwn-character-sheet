"use client";
import { useEffect, useState } from "react";
import "./twe-workspace.css";
import { JOURNAL_PAGE_ICONS, journalPageIcon } from "@/lib/campaigns/journal-icons";
import { JournalPageIconView } from "./journal-page-icon";
import { resolveJournalWikilinks } from "@/lib/campaigns/journal-links";
import { JournalImport } from "./journal-import";
import { SessionRecapMarkdown } from "./session-recap-markdown";
type Entry={id:string;parentId:string|null;title:string;content:string;kind:string;visibility:string;icon?:string;sourcePath?:string|null};
export function CampaignJournal({campaignId}:{campaignId:string}){
const [entries,setEntries]=useState<Entry[]>([]);
const [canEdit,setCanEdit]=useState(false);
const [selected,setSelected]=useState("");
const [preview,setPreview]=useState(false);
const [error,setError]=useState("");
const [draft,setDraft]=useState({title:"",content:"",visibility:"gm",icon:"file-text"});
const [editing,setEditing]=useState(false);
const [creatingFolder,setCreatingFolder]=useState(false);
const [parentId,setParentId]=useState<string|null>(null);
const [search,setSearch]=useState("");
const [iconSearch,setIconSearch]=useState("");
useEffect(()=>{if(editing)setIconSearch("");},[editing]);
const [collapsedFolders,setCollapsedFolders]=useState<Set<string>>(()=>new Set());
const [sidebarOpen,setSidebarOpen]=useState(true);
const [readers,setReaders]=useState<{userId:string;name:string;selected:number}[]>([]);
const [readerEditing,setReaderEditing]=useState(false);
const [importOpen,setImportOpen]=useState(false);
const [uploading,setUploading]=useState(false);
const [uploadNotice,setUploadNotice]=useState("");
const endpoint="/api/campaigns/"+encodeURIComponent(campaignId)+"/journal";
async function refresh(){
 const r=await fetch(endpoint+(preview?"?preview=player":""));
 const j=await r.json() as {error?:string;entries:Entry[];canEdit:boolean};
 if(!r.ok){setError(j.error||"Journal unavailable");return;}
 setEntries(j.entries);setCanEdit(j.canEdit);setError("");
}
useEffect(()=>{
 const controller=new AbortController();
 void (async()=>{
  try{
   const response=await fetch(endpoint+(preview?"?preview=player":""),{signal:controller.signal});
   const body=await response.json() as {error?:string;entries:Entry[];canEdit:boolean};
   if(controller.signal.aborted)return;
   if(!response.ok){setError(body.error||"Journal unavailable");return;}
   setEntries(body.entries);setCanEdit(body.canEdit);setError("");
  }catch{if(!controller.signal.aborted)setError("Journal unavailable");}
 })();
 return ()=>controller.abort();
},[endpoint,preview]);
const current=entries.find(e=>e.id===selected);
const entryById=new Map(entries.map(entry=>[entry.id,entry]));
const ancestry=(entry:Entry):Entry[]=>{
 const parents:Entry[]=[];const seen=new Set<string>([entry.id]);let parent=entry.parentId;
 while(parent&&!seen.has(parent)){seen.add(parent);const item=entryById.get(parent);if(!item)break;parents.unshift(item);parent=item.parentId;}
 return parents;
};
const matchesSearch=(entry:Entry)=>{const term=search.trim().toLocaleLowerCase();return entry.title.toLocaleLowerCase().includes(term)||(entry.kind==="page"&&entry.content.toLocaleLowerCase().includes(term));};
const visibleInTree=(entry:Entry)=>!ancestry(entry).some(folder=>collapsedFolders.has(folder.id));
const childrenByParent=new Map<string,Entry[]>();
for(const entry of entries){const key=entry.parentId??"";const siblings=childrenByParent.get(key)??[];siblings.push(entry);childrenByParent.set(key,siblings);}
const compareEntries=(a:Entry,b:Entry)=>a.kind===b.kind?a.title.localeCompare(b.title):a.kind==="folder"?-1:1;
for(const siblings of childrenByParent.values())siblings.sort(compareEntries);
const sortedEntries:Entry[]=[];const visited=new Set<string>();
function addChildren(parent:string,depth=0){if(depth>20)return;for(const entry of childrenByParent.get(parent)??[]){if(visited.has(entry.id))continue;visited.add(entry.id);sortedEntries.push(entry);addChildren(entry.id,depth+1);}}
addChildren("");for(const entry of entries.slice().sort(compareEntries)){if(!visited.has(entry.id)){visited.add(entry.id);sortedEntries.push(entry);}}
const matchingEntries=sortedEntries.filter(entry=>matchesSearch(entry)&&(search.trim()||visibleInTree(entry)));
function toggleFolder(id:string){setCollapsedFolders(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});}

async function openReaders(id:string){
 const r=await fetch(endpoint+"?readers="+encodeURIComponent(id));const j=await r.json() as {error?:string;readers:{userId:string;name:string;selected:number}[]};
 if(!r.ok){setError(j.error||"Could not load players");return;}
 setReaders(j.readers);setReaderEditing(true);
}
async function saveReaders(){
 const r=await fetch(endpoint,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({entryId:selected,userIds:readers.filter(x=>x.selected).map(x=>x.userId)})});
 const j=await r.json() as {error?:string};if(!r.ok){setError(j.error||"Could not save players");return;}setReaderEditing(false);
}
async function uploadJournalFile(file:File){
 if(!current||current.kind!=="page")return;
 setUploading(true);setError("");setUploadNotice("");
 try{
  const body=new FormData();body.set("entryId",current.id);body.set("file",file);
  const response=await fetch(endpoint+"/files",{method:"POST",body});
  const result=await response.json() as {error?:string;id:string};
  if(!response.ok)throw new Error(result.error||"Upload failed.");
  const url=endpoint+"/files/"+encodeURIComponent(result.id);
  const markdown=file.type.startsWith("image/")?"!["+file.name+"]("+url+")":"["+file.name+"]("+url+")";
  setDraft({title:current.title,visibility:current.visibility,content:current.content+"\n"+markdown,icon:journalPageIcon(current.icon)});
  setEditing(true);
  setUploadNotice("File uploaded. Save this page to keep the attachment link.");
 }catch(error){setError(error instanceof Error?error.message:"Upload failed.");}
 finally{setUploading(false);}
}
async function save(e:React.FormEvent){
 e.preventDefault();
 const r=await fetch(endpoint,{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(selected?{id:selected,...draft}:{kind:creatingFolder?"folder":"page",parentId,...draft})});
 const j=await r.json() as {error?:string;entry:Entry};
 if(!r.ok){setError(j.error||"Save failed");return;}
 setSelected(j.entry.id);setEditing(false);setCreatingFolder(false);await refresh();
}
return <section className="campaign-panel campaign-journal twe-workspace" aria-label="Campaign Journal workspace">
 <header className="twe-workspace-header">
  <div className="twe-workspace-heading"><span className="twe-workspace-eyebrow">Campaign knowledge</span><h2>Campaign Journal</h2><p>Notes, places, characters and stories from your world.</p></div>
  <div className="twe-workspace-header-actions">
   {canEdit&&!preview&&<button type="button" className="twe-button twe-button-primary" onClick={()=>{setSelected("");setParentId(null);setCreatingFolder(false);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>+ New page</button>}
   {canEdit&&!preview&&<button type="button" className="twe-button" onClick={()=>{setSelected("");setParentId(null);setCreatingFolder(true);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>New folder</button>}
   {canEdit&&!preview&&<button type="button" className="twe-button" aria-expanded={importOpen} onClick={()=>setImportOpen(open=>!open)}>{importOpen?"Close import":"Import"}</button>}
   {canEdit&&!preview&&<button type="button" className="twe-button" onClick={()=>setPreview(true)}>View as player</button>}
   {preview&&<button type="button" className="twe-button twe-button-primary" onClick={()=>setPreview(false)}>Return to GM view</button>}
  </div>
 </header>
 {error&&<p className="twe-workspace-alert" role="alert">{error}</p>}
 {uploadNotice&&<p className="twe-workspace-notice" role="status">{uploadNotice}</p>}
 {importOpen&&canEdit&&<div className="twe-workspace-import"><JournalImport endpoint={endpoint} onImported={refresh}/></div>}
 {readerEditing&&canEdit&&<section className="twe-workspace-readers" aria-label="Selected journal readers"><h3>Share with players</h3><div className="twe-workspace-reader-list">{readers.map((reader,index)=><label key={reader.userId}><input type="checkbox" checked={Boolean(reader.selected)} onChange={e=>setReaders(old=>old.map((item,i)=>i===index?{...item,selected:e.target.checked?1:0}:item))}/>{reader.name}</label>)}</div><div className="twe-workspace-action-row"><button type="button" className="twe-button twe-button-primary" onClick={()=>void saveReaders()}>Save players</button><button type="button" className="twe-button" onClick={()=>setReaderEditing(false)}>Cancel</button></div></section>}
 <div className={"twe-workspace-shell"+(sidebarOpen?"":" twe-workspace-shell-collapsed")}>
  <aside className="twe-workspace-nav" aria-label="Journal navigation">
   <div className="twe-workspace-nav-top"><span className="twe-workspace-section-label">Library</span><button type="button" className="twe-workspace-icon-button" title="Collapse sidebar" aria-label="Collapse sidebar" onClick={()=>setSidebarOpen(false)}>‹</button></div>
   <label className="twe-workspace-search"><span className="twe-workspace-search-icon" aria-hidden="true">⌕</span><input aria-label="Search journal" placeholder="Find a page…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" aria-label="Clear search" onClick={()=>setSearch("")}>×</button>}</label>
   <div className="twe-workspace-nav-caption">{search.trim()?matchingEntries.length+" matches":entries.length+" items"}</div>
   <nav className="twe-workspace-tree" aria-label="Pages and folders">
    {matchingEntries.map(entry=>{
      const depth=Math.min(ancestry(entry).length,6);
      const folder=entry.kind==="folder";
      return <div key={entry.id} className={"twe-workspace-tree-row"+(selected===entry.id?" is-active":"")} style={{paddingLeft:8+depth*14}}>
       {folder?<button type="button" className="twe-workspace-tree-toggle" aria-label={(collapsedFolders.has(entry.id)?"Expand ":"Collapse ")+entry.title} aria-expanded={!collapsedFolders.has(entry.id)} onClick={()=>toggleFolder(entry.id)}>{collapsedFolders.has(entry.id)?"▸":"▾"}</button>:<span className="twe-workspace-tree-spacer"/>}
       <button type="button" className="twe-workspace-tree-name" aria-current={selected===entry.id?"page":undefined} onClick={()=>{setSelected(entry.id);setEditing(false);}}><span className="twe-workspace-tree-glyph" aria-hidden="true">{folder?"▰":<JournalPageIconView icon={entry.icon} size={16}/>}</span><span>{entry.title}</span></button>
      </div>;
    })}
    {!matchingEntries.length&&<p className="twe-workspace-nav-empty">{search?"No matching pages":"This journal is empty"}</p>}
   </nav>
   <div className="twe-workspace-nav-footer">CAMPAIGN LIBRARY</div>
  </aside>
  <main className="twe-workspace-document">
   <div className="twe-workspace-document-toolbar">
    <div className="twe-workspace-crumbs">{!sidebarOpen&&<button type="button" className="twe-workspace-icon-button" aria-label="Show sidebar" title="Show sidebar" onClick={()=>setSidebarOpen(true)}>☰</button>}<span>Journal</span>{current&&<>{ancestry(current).map(parent=><span key={parent.id}> / {parent.title}</span>)}<span className="twe-workspace-crumb-current"> / {current.title}</span></>}</div>
    {current&&<div className="twe-workspace-document-controls">{canEdit&&<span className={"twe-workspace-visibility twe-workspace-visibility-"+current.visibility}>{current.visibility==="gm"?"GM only":current.visibility==="selected"?"Selected players":"All players"}</span>}{canEdit&&!editing&&<button type="button" className="twe-button twe-button-subtle" onClick={()=>{setCreatingFolder(false);setDraft({title:current.title,content:current.content,visibility:current.visibility,icon:journalPageIcon(current.icon)});setEditing(true);}}>Edit page</button>}</div>}
   </div>
   {editing&&canEdit?<form className="twe-workspace-editor" onSubmit={save}>
    <div className="twe-workspace-editor-top"><span className="twe-workspace-eyebrow">{creatingFolder?"New folder":selected?"Edit page":"New page"}</span><span className="twe-workspace-editor-hint">Markdown</span></div>
    <label className="twe-workspace-field">Title<input autoFocus required maxLength={160} placeholder={creatingFolder?"Folder name":"Untitled page"} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
    {!creatingFolder&&<fieldset className="twe-workspace-icon-field"><legend>Page icon</legend><div className="twe-workspace-icon-search"><input aria-label="Search page icons" placeholder="Find an icon (NPC, creature, location…)" value={iconSearch} onChange={e=>setIconSearch(e.target.value)}/><span>{JOURNAL_PAGE_ICONS.length} icons</span></div><div className="twe-workspace-icon-picker">{JOURNAL_PAGE_ICONS.filter(option=>(option.label+" "+option.id).toLocaleLowerCase().includes(iconSearch.trim().toLocaleLowerCase())).map(option=><button type="button" key={option.id} className={"twe-workspace-icon-choice"+(draft.icon===option.id?" is-selected":"")} aria-label={option.label} aria-pressed={draft.icon===option.id} title={option.label} onClick={()=>setDraft({...draft,icon:option.id})}><JournalPageIconView icon={option.id} size={22}/><span>{option.label}</span></button>)}</div>{!JOURNAL_PAGE_ICONS.some(option=>(option.label+" "+option.id).toLocaleLowerCase().includes(iconSearch.trim().toLocaleLowerCase()))&&<p className="twe-workspace-icon-empty">No matching icons.</p>}</fieldset>}
    {!creatingFolder&&<label className="twe-workspace-field">Page content<textarea rows={16} placeholder="Begin writing your story…" value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/></label>}
    <div className="twe-workspace-editor-bottom"><label className="twe-workspace-field">Who can read this?<select value={draft.visibility} onChange={e=>setDraft({...draft,visibility:e.target.value})}><option value="gm">GM only</option><option value="players">All players</option><option value="selected">Selected players</option></select></label><div className="twe-workspace-action-row"><button className="twe-button twe-button-primary" type="submit">Save {creatingFolder?"folder":"page"}</button><button className="twe-button" type="button" onClick={()=>{setEditing(false);}}>Cancel</button></div></div>
   </form>:current?<article className="twe-workspace-page">
    <div className="twe-workspace-page-heading"><span className="twe-workspace-eyebrow">{current.kind==="folder"?"Folder":"Journal entry"}</span><h3 className="twe-workspace-article-heading">{current.kind==="page"&&<JournalPageIconView icon={current.icon} size={30}/>}<span>{current.title}</span></h3><div className="twe-workspace-page-meta">{current.kind==="folder"?"Organize the pages in this folder":"Campaign knowledge · Markdown"}</div></div>
    {canEdit&&current.kind==="page"&&<div className="twe-workspace-page-tools"><label className="twe-workspace-attach">Attach image or PDF <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" disabled={uploading} onChange={event=>{const file=event.target.files?.[0];if(file)void uploadJournalFile(file);event.target.value="";}}/></label>{current.visibility==="selected"&&<button type="button" className="twe-button twe-button-subtle" onClick={()=>void openReaders(current.id)}>Choose players</button>}</div>}
    {canEdit&&current.kind==="folder"&&<div className="twe-workspace-page-tools"><button type="button" className="twe-button twe-button-primary" onClick={()=>{setSelected("");setParentId(current.id);setCreatingFolder(false);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>+ New page here</button></div>}
    {current.kind==="page"&&<div className="twe-workspace-prose"><SessionRecapMarkdown content={resolveJournalWikilinks(current.content,current,entries)} onJournalNavigate={id=>{if(entries.some(entry=>entry.id===id&&entry.kind==="page")){setSelected(id);setEditing(false);}}}/></div>}
   </article>:<div className="twe-workspace-welcome"><div className="twe-workspace-welcome-icon" aria-hidden="true">✦</div><h3>Your campaign, one page at a time</h3><p>Select a page from the library to read it{canEdit?", or create a page to begin building your world":"."}.</p>{canEdit&&<button className="twe-button twe-button-primary" type="button" onClick={()=>{setSelected("");setCreatingFolder(false);setParentId(null);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>Create a page</button>}</div>}
  </main>
 </div>
</section>;
}
