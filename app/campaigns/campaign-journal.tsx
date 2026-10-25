"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "./twe-workspace.css";
import "./journal-editor.css";
import { journalPageIcon } from "@/lib/campaigns/journal-icons";
import { validateJournalFile, verifyJournalFileSignature } from "@/lib/campaigns/journal-files";
import { saveJournalEditorDraft, uploadJournalEditorFile, type PendingJournalAttachment } from "@/lib/campaigns/journal-editor-save";
import { JournalIconPicker } from "./journal-icon-picker";
import { JournalPageIconView } from "./journal-page-icon";
import { journalPropertiesMarkdown } from "@/lib/campaigns/journal-properties";
import { resolveJournalWikilinks } from "@/lib/campaigns/journal-links";
import { JournalImport } from "./journal-import";
import { JournalDocument } from "./journal-document";
type Entry={id:string;parentId:string|null;title:string;content:string;kind:string;visibility:string;icon?:string;sourcePath?:string|null};
const JournalVisualEditor=dynamic(()=>import("./journal-visual-editor").then(module=>module.JournalVisualEditor),{ssr:false,loading:()=> <p role="status">Opening editor…</p>});
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
const [dragged,setDragged]=useState<string|null>(null);
const [dropTarget,setDropTarget]=useState<string|null>(null);
const [moveId,setMoveId]=useState("");
const [collapsedFolders,setCollapsedFolders]=useState<Set<string>>(()=>new Set());
const [sidebarOpen,setSidebarOpen]=useState(true);
const [readers,setReaders]=useState<{userId:string;name:string;selected:number}[]>([]);
const [readerEditing,setReaderEditing]=useState(false);
const [readerEntryId,setReaderEntryId]=useState("");
const [importOpen,setImportOpen]=useState(false);
const [uploading,setUploading]=useState(false);
const [saving,setSaving]=useState(false);
const savingRef=useRef(false);
const allowLeave=useRef(false);
const [editorSession,setEditorSession]=useState(0);
const pendingAttachments=useRef(new Map<string,PendingJournalAttachment>());
const [localImageUrls,setLocalImageUrls]=useState<ReadonlySet<string>>(()=>new Set());
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
const dirty=editing&&(current?draft.title!==current.title||draft.content!==current.content||draft.visibility!==current.visibility||draft.icon!==journalPageIcon(current.icon):Boolean(draft.title.trim()||draft.content.trim()));
useEffect(()=>{
 if(!dirty)return;
 const warn=(event:BeforeUnloadEvent)=>{if(!allowLeave.current){event.preventDefault();event.returnValue="";}};
 const navigate=(event:MouseEvent)=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||!(event.target instanceof Element))return;
  const link=event.target.closest<HTMLAnchorElement>("a[href]");
  if(!link||link.target==="_blank"||link.hasAttribute("download")||link.closest(".journal-composer")||link.href===window.location.href||link.getAttribute("href")?.startsWith("#")||allowLeave.current)return;
  if(uploading||saving){event.preventDefault();event.stopPropagation();setError("Wait for the current save or attachment to finish.");return;}
  if(!window.confirm("Discard unsaved changes?")){event.preventDefault();event.stopPropagation();}else allowLeave.current=true;
 };
 window.addEventListener("beforeunload",warn);document.addEventListener("click",navigate,true);
 return()=>{window.removeEventListener("beforeunload",warn);document.removeEventListener("click",navigate,true);};
},[dirty,uploading,saving]);
useEffect(()=>{allowLeave.current=false;},[draft,editing,selected]);
useEffect(()=>{const files=pendingAttachments.current;return()=>{for(const url of files.keys())URL.revokeObjectURL(url);files.clear();};},[]);
function clearAttachments(){for(const url of pendingAttachments.current.keys())URL.revokeObjectURL(url);pendingAttachments.current.clear();setLocalImageUrls(new Set());}
function discardDraft(){if(uploading||saving)return false;if(dirty&&!window.confirm("Discard unsaved changes?"))return false;clearAttachments();setError("");setUploadNotice("");return true;}
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

const validTarget=(sourceId:string,targetId:string|null)=>{
 const source=entryById.get(sourceId);
 if(!source||sourceId===targetId)return false;
 let cursor=targetId;const seen=new Set<string>([sourceId]);
 while(cursor){if(seen.has(cursor))return false;seen.add(cursor);cursor=entryById.get(cursor)?.parentId??null;}
 return targetId===null||entryById.get(targetId)?.kind==="folder";
};
async function moveEntry(sourceId:string,targetId:string|null){
 if(!canEdit||preview||!validTarget(sourceId,targetId))return;
 const source=entryById.get(sourceId);
 if(source?.parentId===targetId)return;
 try{
  const r=await fetch(endpoint,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:sourceId,parentId:targetId})});
  const j=await r.json() as {error?:string};
  if(!r.ok)throw new Error(j.error||"Move failed.");
  setEntries(old=>old.map(entry=>entry.id===sourceId?{...entry,parentId:targetId}:entry));
  if(targetId)setCollapsedFolders(old=>{const next=new Set(old);next.delete(targetId);return next;});
  setError("");
 }catch(e){setError(e instanceof Error?e.message:"Move failed.");await refresh();}
 finally{setDragged(null);setDropTarget(null);setMoveId("");}
}
async function openReaders(id:string){
 const r=await fetch(endpoint+"?readers="+encodeURIComponent(id));const j=await r.json() as {error?:string;readers:{userId:string;name:string;selected:number}[]};
 if(!r.ok){setError(j.error||"Could not load players");return;}
 setReaders(j.readers);setReaderEntryId(id);setReaderEditing(true);
}
async function saveReaders(){
 const r=await fetch(endpoint,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({entryId:readerEntryId,userIds:readers.filter(x=>x.selected).map(x=>x.userId)})});
 const j=await r.json() as {error?:string};if(!r.ok){setError(j.error||"Could not save players");return;}setReaderEditing(false);
}
async function uploadJournalFile(file:File):Promise<string>{
 if(!editing||creatingFolder||savingRef.current)throw new Error("Finish the current save first.");
 setUploading(true);setError("");setUploadNotice("");
 try{
  validateJournalFile(file.name,file.type,file.size);
  if(!verifyJournalFileSignature(file.type,new Uint8Array(await file.arrayBuffer())))throw new Error("The file does not match its type.");
  if(!selected){
   if(pendingAttachments.current.size>=20||[...pendingAttachments.current.values()].reduce((sum,item)=>sum+item.file.size,0)+file.size>40_000_000)throw new Error("Save this page before adding more attachments.");
   const url=URL.createObjectURL(file);pendingAttachments.current.set(url,{file});setLocalImageUrls(new Set(pendingAttachments.current.keys()));return url;
  }
  const url=await uploadJournalEditorFile(endpoint,selected,file);
  setUploadNotice("Attachment added. Save the page to keep it.");return url;
 }
 finally{setUploading(false);}
}
async function save(e:React.FormEvent){
 e.preventDefault();
 if(uploading||savingRef.current)return;
 savingRef.current=true;setSaving(true);setError("");
 try{
  const entry=await saveJournalEditorDraft({endpoint,id:selected,kind:creatingFolder?"folder":"page",parentId,draft,attachments:pendingAttachments.current,onCreated:created=>{setSelected(created.id);setEntries(old=>[...old,created]);}});
  setEntries(old=>old.some(item=>item.id===entry.id)?old.map(item=>item.id===entry.id?entry:item):[...old,entry]);setSelected(entry.id);setDraft({title:entry.title,content:entry.content,visibility:entry.visibility,icon:journalPageIcon(entry.icon)});setEditing(false);setCreatingFolder(false);clearAttachments();setUploadNotice("");await refresh();
 }catch(cause){setError(cause instanceof Error?cause.message:"The page could not be saved.");}
 finally{savingRef.current=false;setSaving(false);}
}
return <section className="campaign-panel campaign-journal twe-workspace" aria-label="Campaign Journal workspace">
 <header className="twe-workspace-header">
  <div className="twe-workspace-heading"><span className="twe-workspace-eyebrow">Campaign knowledge</span><h2>Campaign Journal</h2><p>Notes, places, characters and stories from your world.</p></div>
  <div className="twe-workspace-header-actions">
   {canEdit&&!preview&&<button type="button" disabled={uploading||saving} className="twe-button twe-button-primary" onClick={()=>{if(!discardDraft())return;setEditorSession(value=>value+1);setSelected("");setParentId(null);setCreatingFolder(false);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>+ New page</button>}
   {canEdit&&!preview&&<button type="button" disabled={uploading||saving} className="twe-button" onClick={()=>{if(!discardDraft())return;setEditorSession(value=>value+1);setSelected("");setParentId(null);setCreatingFolder(true);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>New folder</button>}
   {canEdit&&!preview&&<button type="button" className="twe-button" aria-expanded={importOpen} onClick={()=>setImportOpen(open=>!open)}>{importOpen?"Close import":"Import"}</button>}
   {canEdit&&!preview&&<button type="button" disabled={uploading||saving} className="twe-button" onClick={()=>{if(discardDraft()){setEditing(false);setPreview(true);}}}>View as player</button>}
   {preview&&<button type="button" className="twe-button twe-button-primary" onClick={()=>setPreview(false)}>Return to GM view</button>}
  </div>
 </header>
 {error&&<p className="twe-workspace-alert" role="alert">{error}</p>}
 {uploadNotice&&<p className="twe-workspace-notice" role="status">{uploadNotice}</p>}
 {importOpen&&canEdit&&<div className="twe-workspace-import"><JournalImport endpoint={endpoint} onImported={refresh}/></div>}
 {readerEditing&&canEdit&&<section className="twe-workspace-readers" aria-label="Selected journal readers"><h3>Share {entryById.get(readerEntryId)?.title} with players</h3><div className="twe-workspace-reader-list">{readers.map((reader,index)=><label key={reader.userId}><input type="checkbox" checked={Boolean(reader.selected)} onChange={e=>setReaders(old=>old.map((item,i)=>i===index?{...item,selected:e.target.checked?1:0}:item))}/>{reader.name}</label>)}</div><div className="twe-workspace-action-row"><button type="button" className="twe-button twe-button-primary" onClick={()=>void saveReaders()}>Save players</button><button type="button" className="twe-button" onClick={()=>setReaderEditing(false)}>Cancel</button></div></section>}
 <div className={"twe-workspace-shell"+(sidebarOpen?"":" twe-workspace-shell-collapsed")}>
  <aside className="twe-workspace-nav" aria-label="Journal navigation">
   <div className="twe-workspace-nav-top"><span className="twe-workspace-section-label">Library</span><button type="button" className="twe-workspace-icon-button" title="Collapse sidebar" aria-label="Collapse sidebar" onClick={()=>setSidebarOpen(false)}>‹</button></div>
   <label className="twe-workspace-search"><span className="twe-workspace-search-icon" aria-hidden="true">⌕</span><input aria-label="Search journal" placeholder="Find a page…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" aria-label="Clear search" onClick={()=>setSearch("")}>×</button>}</label>
   <div className="twe-workspace-nav-caption">{search.trim()?matchingEntries.length+" matches":entries.length+" items"}</div>
   {canEdit&&!preview&&<button type="button" className={"twe-workspace-root-drop"+(dropTarget==="root"?" is-drop-target":"")} onDragOver={e=>{if(dragged&&validTarget(dragged,null)){e.preventDefault();setDropTarget("root");}}} onDragLeave={()=>setDropTarget(null)} onDrop={e=>{e.preventDefault();if(dragged)void moveEntry(dragged,null);}} onClick={()=>{if(moveId)void moveEntry(moveId,null);}}>↖ Top level {moveId?"(move selected item)":""}</button>}
   <nav className="twe-workspace-tree" aria-label="Pages and folders">
    {matchingEntries.map(entry=>{
      const depth=Math.min(ancestry(entry).length,6);
      const folder=entry.kind==="folder";
      return <div key={entry.id} className={"twe-workspace-tree-row"+(selected===entry.id?" is-active":"")+(dropTarget===entry.id?" is-drop-target":"")} draggable={canEdit&&!preview} onDragStart={e=>{setDragged(entry.id);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",entry.id);}} onDragEnd={()=>{setDragged(null);setDropTarget(null);}} onDragOver={e=>{if(folder&&dragged&&validTarget(dragged,entry.id)){e.preventDefault();setDropTarget(entry.id);}}} onDragLeave={()=>setDropTarget(null)} onDrop={e=>{if(folder&&dragged){e.preventDefault();e.stopPropagation();void moveEntry(dragged,entry.id);}}} style={{paddingLeft:8+depth*14}}>
       {folder?<button type="button" className="twe-workspace-tree-toggle" aria-label={(collapsedFolders.has(entry.id)?"Expand ":"Collapse ")+entry.title} aria-expanded={!collapsedFolders.has(entry.id)} onClick={()=>toggleFolder(entry.id)}>{collapsedFolders.has(entry.id)?"▸":"▾"}</button>:<span className="twe-workspace-tree-spacer"/>}
       <button type="button" disabled={uploading||saving} className="twe-workspace-tree-name" aria-current={selected===entry.id?"page":undefined} onClick={()=>{if(!discardDraft())return;setSelected(entry.id);setEditing(false);}}><span className="twe-workspace-tree-glyph" aria-hidden="true">{folder?"▰":<JournalPageIconView icon={entry.icon} size={16}/>}</span><span>{entry.title}</span></button>{canEdit&&!preview&&<button type="button" className="twe-workspace-move-button" aria-label={"Move "+entry.title} title={"Move "+entry.title} onClick={()=>setMoveId(entry.id)}>⋮</button>}
      </div>;
    })}
    {moveId&&canEdit&&!preview&&<div className="twe-workspace-move-panel"><label>Move to folder<select aria-label="Destination folder" defaultValue="" onChange={e=>{if(e.target.value)void moveEntry(moveId,e.target.value==="root"?null:e.target.value);}}><option value="">Choose destination…</option><option value="root">Top level</option>{sortedEntries.filter(item=>item.kind==="folder"&&validTarget(moveId,item.id)).map(item=><option key={item.id} value={item.id}>{ancestry(item).map(p=>p.title).join(" / ")}{ancestry(item).length?" / ":""}{item.title}</option>)}</select></label><button type="button" onClick={()=>setMoveId("")}>Cancel</button></div>}
    {!matchingEntries.length&&<p className="twe-workspace-nav-empty">{search?"No matching pages":"This journal is empty"}</p>}
   </nav>
   <div className="twe-workspace-nav-footer">CAMPAIGN LIBRARY</div>
  </aside>
  <main className="twe-workspace-document">
   <div className="twe-workspace-document-toolbar">
    <div className="twe-workspace-crumbs">{!sidebarOpen&&<button type="button" className="twe-workspace-icon-button" aria-label="Show sidebar" title="Show sidebar" onClick={()=>setSidebarOpen(true)}>☰</button>}<span>Journal</span>{current&&<>{ancestry(current).map(parent=><span key={parent.id}> / {parent.title}</span>)}<span className="twe-workspace-crumb-current"> / {current.title}</span></>}</div>
    {current&&<div className="twe-workspace-document-controls">{canEdit&&<span className={"twe-workspace-visibility twe-workspace-visibility-"+current.visibility}>{current.visibility==="gm"?"GM only":current.visibility==="selected"?"Selected players":"All players"}</span>}{canEdit&&!editing&&<button type="button" disabled={uploading||saving} className="twe-button twe-button-subtle" onClick={()=>{setCreatingFolder(false);setDraft({title:current.title,content:current.content,visibility:current.visibility,icon:journalPageIcon(current.icon)});setEditing(true);}}>Edit page</button>}</div>}
   </div>
   {editing&&canEdit?<form className="twe-workspace-editor" onSubmit={save}>
    <div className="twe-workspace-editor-top"><span className="twe-workspace-eyebrow">{creatingFolder?"New folder":selected?"Edit page":"New page"}</span></div>
    <label className="twe-workspace-field">Title<input autoFocus required disabled={saving} maxLength={160} placeholder={creatingFolder?"Folder name":"Untitled page"} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
    {!creatingFolder&&<><JournalIconPicker value={draft.icon} onChange={icon=>setDraft(old=>({...old,icon}))} disabled={uploading||saving}/><JournalVisualEditor key={(selected||"new-page")+":"+editorSession} value={draft.content} onChange={content=>setDraft(old=>({...old,content}))} disabled={uploading||saving} pages={entries} current={current} onAttach={uploadJournalFile} localImageUrls={localImageUrls}/></>}
    <div className="twe-workspace-editor-bottom"><label className="twe-workspace-field">Who can read this?<select disabled={saving} value={draft.visibility} onChange={e=>setDraft({...draft,visibility:e.target.value})}><option value="gm">GM only</option><option value="players">All players</option><option value="selected">Selected players</option></select></label><div className="twe-workspace-action-row"><button className="twe-button twe-button-primary" type="submit" disabled={uploading||saving}>{saving?"Saving…":"Save "+(creatingFolder?"folder":"page")}</button><button className="twe-button" type="button" disabled={uploading||saving} onClick={()=>{if(discardDraft())setEditing(false);}}>Cancel</button></div></div>
   </form>:current?<article className="twe-workspace-page">
    <div className="twe-workspace-page-heading"><span className="twe-workspace-eyebrow">{current.kind==="folder"?"Folder":"Journal entry"}</span><h3 className="twe-workspace-article-heading">{current.kind==="page"&&<JournalPageIconView icon={current.icon} size={30}/>}<span>{current.title}</span></h3><div className="twe-workspace-page-meta">{current.kind==="folder"?"Organize the pages in this folder":"Campaign knowledge"}</div></div>
    {canEdit&&current.kind==="page"&&current.visibility==="selected"&&<button type="button" className="twe-button twe-button-subtle" onClick={()=>void openReaders(current.id)}>Choose players</button>}
    {canEdit&&current.kind==="folder"&&<div className="twe-workspace-page-tools"><button type="button" className="twe-button twe-button-primary" onClick={()=>{if(!discardDraft())return;setEditorSession(value=>value+1);setSelected("");setParentId(current.id);setCreatingFolder(false);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>+ New page here</button></div>}
    {current.kind==="page"&&<div className="twe-workspace-prose"><JournalDocument content={resolveJournalWikilinks(journalPropertiesMarkdown(current.content),current,entries)} onJournalNavigate={id=>{if(!uploading&&!saving&&entries.some(entry=>entry.id===id&&entry.kind==="page")&&discardDraft()){setSelected(id);setEditing(false);}}}/></div>}
   </article>:<div className="twe-workspace-welcome"><div className="twe-workspace-welcome-icon" aria-hidden="true">✦</div><h3>Your campaign, one page at a time</h3><p>Select a page from the library to read it{canEdit?", or create a page to begin building your world":"."}.</p>{canEdit&&<button className="twe-button twe-button-primary" type="button" onClick={()=>{if(!discardDraft())return;setEditorSession(value=>value+1);setSelected("");setCreatingFolder(false);setParentId(null);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>Create a page</button>}</div>}
  </main>
 </div>
</section>;
}
