"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import { JournalNpcCreator } from "./journal-npc-creator";
type Entry={id:string;parentId:string|null;title:string;content:string;kind:string;visibility:string;icon?:string;sourcePath?:string|null;sortOrder?:number|null};
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
const [reorderTarget,setReorderTarget]=useState<string|null>(null);
const [moveId,setMoveId]=useState("");
const [menuId,setMenuId]=useState("");
const [npcCreatorOpen,setNpcCreatorOpen]=useState(false);
useEffect(()=>{
 if(!menuId)return;
 const close=(event:PointerEvent)=>{if(event.target instanceof Element&&!event.target.closest(".twe-workspace-entry-menu,.twe-workspace-move-button"))setMenuId("");};
 const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setMenuId("");};
 document.addEventListener("pointerdown",close);
 document.addEventListener("keydown",escape);
 return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape);};
},[menuId]);
const [collapsedFolders,setCollapsedFolders]=useState<Set<string>>(()=>new Set());
const [sidebarOpen,setSidebarOpen]=useState(true);
const [sidebarWidth,setSidebarWidth]=useState(270);
const [viewerId,setViewerId]=useState("");
const [loadedPreferencesKey,setLoadedPreferencesKey]=useState("");
const preferenceKey=viewerId?"twe-journal:"+viewerId+":"+campaignId+":":"";
const resizing=useRef(false);
useEffect(()=>{
 if(!preferenceKey)return;
 let folders:string[]=[];
 let width=270;
 let open=true;
 try{
  const stored=JSON.parse(localStorage.getItem(preferenceKey+"collapsed")??"[]") as unknown;
  if(Array.isArray(stored))folders=stored.filter((id):id is string=>typeof id==="string");
  const storedWidth=Number(localStorage.getItem(preferenceKey+"sidebar-width"));
  if(Number.isFinite(storedWidth)&&storedWidth>=220&&storedWidth<=520)width=storedWidth;
  open=localStorage.getItem(preferenceKey+"sidebar-open")!=="false";
 }catch{}
 const frame=requestAnimationFrame(()=>{
  setCollapsedFolders(new Set(folders));
  setSidebarWidth(width);
  setSidebarOpen(open);
  setLoadedPreferencesKey(preferenceKey);
 });
 return()=>cancelAnimationFrame(frame);
},[preferenceKey]);
useEffect(()=>{
 if(!preferenceKey||loadedPreferencesKey!==preferenceKey)return;
 try{localStorage.setItem(preferenceKey+"collapsed",JSON.stringify([...collapsedFolders]));}catch{}
},[preferenceKey,loadedPreferencesKey,collapsedFolders]);
useEffect(()=>{
 if(!preferenceKey||loadedPreferencesKey!==preferenceKey)return;
 try{localStorage.setItem(preferenceKey+"sidebar-width",String(sidebarWidth));}catch{}
},[preferenceKey,loadedPreferencesKey,sidebarWidth]);
useEffect(()=>{
 if(!preferenceKey||loadedPreferencesKey!==preferenceKey)return;
 try{localStorage.setItem(preferenceKey+"sidebar-open",String(sidebarOpen));}catch{}
},[preferenceKey,loadedPreferencesKey,sidebarOpen]);
useEffect(()=>{
 const onMove=(event:PointerEvent)=>{if(resizing.current)setSidebarWidth(Math.min(520,Math.max(220,event.clientX-(document.querySelector(".twe-workspace-shell")?.getBoundingClientRect().left??0))));};
 const onStop=()=>{resizing.current=false;document.body.style.cursor="";document.body.style.userSelect="";};
 window.addEventListener("pointermove",onMove);window.addEventListener("pointerup",onStop);
 return()=>{onStop();window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onStop);};
},[]);
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
 const j=await r.json() as {error?:string;entries:Entry[];canEdit:boolean;viewerId?:string};
 if(!r.ok){setError(j.error||"Journal unavailable");return;}
 setEntries(j.entries);setCanEdit(j.canEdit);if(j.viewerId)setViewerId(j.viewerId);setError("");
}
useEffect(()=>{
 const controller=new AbortController();
 void (async()=>{
  try{
   const response=await fetch(endpoint+(preview?"?preview=player":""),{signal:controller.signal});
   const body=await response.json() as {error?:string;entries:Entry[];canEdit:boolean;viewerId?:string};
   if(controller.signal.aborted)return;
   if(!response.ok){setError(body.error||"Journal unavailable");return;}
   setEntries(body.entries);setCanEdit(body.canEdit);if(body.viewerId)setViewerId(body.viewerId);setError("");
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
const compareEntries=(a:Entry,b:Entry)=>a.sortOrder!=null&&b.sortOrder!=null?a.sortOrder-b.sortOrder:a.sortOrder!=null?-1:b.sortOrder!=null?1:a.kind===b.kind?a.title.localeCompare(b.title):a.kind==="folder"?-1:1;
for(const siblings of childrenByParent.values())siblings.sort(compareEntries);
const sortedEntries:Entry[]=[];const visited=new Set<string>();
function addChildren(parent:string,depth=0){if(depth>20)return;for(const entry of childrenByParent.get(parent)??[]){if(visited.has(entry.id))continue;visited.add(entry.id);sortedEntries.push(entry);addChildren(entry.id,depth+1);}}
addChildren("");for(const entry of entries.slice().sort(compareEntries)){if(!visited.has(entry.id)){visited.add(entry.id);sortedEntries.push(entry);}}
const matchingEntries=sortedEntries.filter(entry=>matchesSearch(entry)&&(search.trim()||visibleInTree(entry)));
function toggleAllFolders(){const folders=entries.filter(entry=>entry.kind==="folder");setCollapsedFolders(old=>folders.every(folder=>old.has(folder.id))?new Set():new Set(folders.map(folder=>folder.id)));}
function toggleFolder(id:string){setCollapsedFolders(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});}

const validTarget=(sourceId:string,targetId:string|null)=>{
 const source=entryById.get(sourceId);
 if(!source||sourceId===targetId)return false;
 let cursor=targetId;const seen=new Set<string>([sourceId]);
 while(cursor){if(seen.has(cursor))return false;seen.add(cursor);cursor=entryById.get(cursor)?.parentId??null;}
 return targetId===null||entryById.get(targetId)?.kind==="folder";
};
async function reorderEntry(sourceId:string,beforeId:string){
 if(!canEdit||preview||sourceId===beforeId)return;
 const source=entryById.get(sourceId),target=entryById.get(beforeId);
 if(!source||!target||source.parentId!==target.parentId)return;
 try{
  const r=await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:sourceId,beforeId})});
  const data=await r.json() as {error?:string;order?:{ids:string[]}};
  if(!r.ok||!data.order)throw new Error(data.error||"Could not reorder items.");
  const positions=new Map(data.order.ids.map((id,index)=>[id,index]));
  setEntries(old=>old.map(entry=>positions.has(entry.id)?{...entry,sortOrder:positions.get(entry.id)}:entry));
  setError("");
 }catch(e){setError(e instanceof Error?e.message:"Could not reorder items.");await refresh();}
 finally{setDragged(null);setDropTarget(null);setReorderTarget(null);}
}
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
async function editEntryQuick(entry:Entry,fields:{title?:string;visibility?:string}){
 if(!canEdit||preview||saving||uploading)return;
 try{
  const r=await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:entry.id,...fields})});
  const data=await r.json() as {error?:string;entry?:Entry};
  if(!r.ok||!data.entry)throw new Error(data.error||"Could not update entry.");
  setEntries(old=>old.map(item=>item.id===entry.id?{...item,...data.entry}:item));
  if(selected===entry.id&&editing)setDraft(old=>({...old,...fields}));
  setError("");
 }catch(e){setError(e instanceof Error?e.message:"Could not update entry.");}
 finally{setMenuId("");}
}
async function duplicateEntry(entry:Entry){
 if(!canEdit||preview||saving||uploading)return;
 try{
  const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"duplicate",id:entry.id})});
  const data=await r.json() as {error?:string;copy?:{id:string;count:number}};
  if(!r.ok||!data.copy)throw new Error(data.error||"Could not duplicate entry.");
  await refresh();setSelected(data.copy.id);setEditing(false);setError("");
 }catch(e){setError(e instanceof Error?e.message:"Could not duplicate entry.");}
 finally{setMenuId("");}
}
async function deleteEntry(entry:Entry){
 if(!canEdit||preview||saving||uploading)return;
 const descendants=entries.filter(item=>ancestry(item).some(parent=>parent.id===entry.id)).length;
 if(!window.confirm(descendants?"Delete \""+entry.title+"\" and its "+descendants+" nested items? This cannot be undone.":"Delete \""+entry.title+"\"? This cannot be undone."))return;
 try{
  const r=await fetch(endpoint,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",id:entry.id})});
  const data=await r.json() as {error?:string};
  if(!r.ok)throw new Error(data.error||"Could not delete entry.");
  if(selected===entry.id||ancestry(current??entry).some(p=>p.id===entry.id)){setSelected("");setEditing(false);}
  await refresh();setError("");
 }catch(e){setError(e instanceof Error?e.message:"Could not delete entry.");}
 finally{setMenuId("");}
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
 <div className={"twe-workspace-shell"+(sidebarOpen?"":" twe-workspace-shell-collapsed")} style={{"--journal-sidebar-width":sidebarWidth+"px"} as CSSProperties}>
  <aside className="twe-workspace-nav" aria-label="Journal navigation">
   <div className="twe-workspace-nav-top"><span className="twe-workspace-section-label">Library</span><button type="button" className="twe-workspace-folders-all" onClick={toggleAllFolders} aria-label={entries.filter(item=>item.kind==="folder").every(item=>collapsedFolders.has(item.id))?"Expand all folders":"Collapse all folders"}>{entries.filter(item=>item.kind==="folder").every(item=>collapsedFolders.has(item.id))?"Expand all":"Collapse all"}</button><button type="button" className="twe-workspace-icon-button" title="Collapse sidebar" aria-label="Collapse sidebar" onClick={()=>setSidebarOpen(false)}>‹</button></div>
   <label className="twe-workspace-search"><span className="twe-workspace-search-icon" aria-hidden="true">⌕</span><input aria-label="Search journal" placeholder="Find a page…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" aria-label="Clear search" onClick={()=>setSearch("")}>×</button>}</label>
   <div className="twe-workspace-nav-caption">{search.trim()?matchingEntries.length+" matches":entries.length+" items"}</div>
   {canEdit&&!preview&&<button type="button" className={"twe-workspace-root-drop"+(dropTarget==="root"?" is-drop-target":"")} onDragOver={e=>{if(dragged&&validTarget(dragged,null)){e.preventDefault();setDropTarget("root");}}} onDragLeave={()=>setDropTarget(null)} onDrop={e=>{e.preventDefault();if(dragged)void moveEntry(dragged,null);}} onClick={()=>{if(moveId)void moveEntry(moveId,null);}}>↖ Top level {moveId?"(move selected item)":""}</button>}
   <nav className="twe-workspace-tree" aria-label="Pages and folders">
    {matchingEntries.map(entry=>{
      const depth=Math.min(ancestry(entry).length,6);
      const folder=entry.kind==="folder";
      return <div key={entry.id} className={"twe-workspace-tree-row"+(selected===entry.id?" is-active":"")+(dropTarget===entry.id?" is-drop-target":"")+(reorderTarget===entry.id?" is-reorder-target":"")} draggable={canEdit&&!preview} onDragStart={e=>{setDragged(entry.id);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",entry.id);}} onDragEnd={()=>{setDragged(null);setDropTarget(null);setReorderTarget(null);}} onDragOver={e=>{
 if(!dragged||dragged===entry.id)return;
 const source=entryById.get(dragged);
 if(source?.parentId===entry.parentId){e.preventDefault();setReorderTarget(entry.id);setDropTarget(null);}
 else if(folder&&validTarget(dragged,entry.id)){e.preventDefault();setDropTarget(entry.id);setReorderTarget(null);}
 }} onDragLeave={()=>{setDropTarget(null);setReorderTarget(null);}} onDrop={e=>{if(!dragged)return;e.preventDefault();e.stopPropagation();if(entryById.get(dragged)?.parentId===entry.parentId)void reorderEntry(dragged,entry.id);else if(folder&&validTarget(dragged,entry.id))void moveEntry(dragged,entry.id);}} style={{paddingLeft:8+depth*14}}>
       {folder?<button type="button" className="twe-workspace-tree-toggle" aria-label={(collapsedFolders.has(entry.id)?"Expand ":"Collapse ")+entry.title} aria-expanded={!collapsedFolders.has(entry.id)} onClick={()=>toggleFolder(entry.id)}>{collapsedFolders.has(entry.id)?"▸":"▾"}</button>:<span className="twe-workspace-tree-spacer"/>}
       <button type="button" disabled={uploading||saving} className="twe-workspace-tree-name" aria-current={selected===entry.id?"page":undefined} onClick={()=>{if(!discardDraft())return;setSelected(entry.id);setEditing(false);}}><span className="twe-workspace-tree-glyph" aria-hidden="true">{folder?"▰":<JournalPageIconView icon={entry.icon} size={16}/>}</span><span>{entry.title}</span>{entry.visibility==="gm"&&<span className="twe-workspace-entry-lock" role="img" aria-label="GM only" title="GM only">🔒</span>}</button>{canEdit&&!preview&&<button type="button" className="twe-workspace-move-button" aria-label={"Actions for "+entry.title} aria-expanded={menuId===entry.id} title={"Actions for "+entry.title} onClick={()=>setMenuId(old=>old===entry.id?"":entry.id)}>⋮</button>}
       {menuId===entry.id&&canEdit&&!preview&&<div className="twe-workspace-entry-menu" role="group" aria-label={"Actions for "+entry.title}>
        <button type="button" onClick={()=>{setMoveId(entry.id);setMenuId("");}}>Move to folder…</button>
        <button type="button" onClick={()=>{const title=window.prompt("Rename entry",entry.title);if(title!==null&&title.trim()&&title!==entry.title)void editEntryQuick(entry,{title:title.trim()});else setMenuId("");}}>Rename</button>
        <button type="button" onClick={()=>void duplicateEntry(entry)}>Duplicate</button>
        <button type="button" aria-pressed={entry.visibility==="gm"} onClick={()=>void editEntryQuick(entry,{visibility:"gm"})}>{entry.visibility==="gm"?"✓ ":""}GM only</button>
        <button type="button" aria-pressed={entry.visibility==="players"} onClick={()=>void editEntryQuick(entry,{visibility:"players"})}>{entry.visibility==="players"?"✓ ":""}All players</button>
        {entry.visibility==="selected"&&<button type="button" onClick={()=>{setMenuId("");void openReaders(entry.id);}}>Manage selected players…</button>}
        <button type="button" className="is-danger" onClick={()=>void deleteEntry(entry)}>Delete…</button>
       </div>}
      </div>;
    })}
    {moveId&&canEdit&&!preview&&<div className="twe-workspace-move-panel"><label>Move to folder<select aria-label="Destination folder" defaultValue="" onChange={e=>{if(e.target.value)void moveEntry(moveId,e.target.value==="root"?null:e.target.value);}}><option value="">Choose destination…</option><option value="root">Top level</option>{sortedEntries.filter(item=>item.kind==="folder"&&validTarget(moveId,item.id)).map(item=><option key={item.id} value={item.id}>{ancestry(item).map(p=>p.title).join(" / ")}{ancestry(item).length?" / ":""}{item.title}</option>)}</select></label><button type="button" onClick={()=>setMoveId("")}>Cancel</button></div>}
    {!matchingEntries.length&&<p className="twe-workspace-nav-empty">{search?"No matching pages":"This journal is empty"}</p>}
   </nav>
   <div className="twe-workspace-nav-footer">CAMPAIGN LIBRARY</div>
  </aside>
  {sidebarOpen&&<div className="twe-workspace-resize-handle" role="separator" aria-label="Resize Journal sidebar" aria-orientation="vertical" aria-valuemin={220} aria-valuemax={520} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();resizing.current=true;document.body.style.cursor="col-resize";document.body.style.userSelect="none";}} onKeyDown={event=>{if(event.key==="ArrowRight"||event.key==="ArrowLeft"){event.preventDefault();setSidebarWidth(width=>Math.min(520,Math.max(220,width+(event.key==="ArrowRight"?20:-20))));}}}/>}
  <main className="twe-workspace-document">
   <div className="twe-workspace-document-toolbar">
    <div className="twe-workspace-crumbs">{!sidebarOpen&&<button type="button" className="twe-workspace-icon-button" aria-label="Show sidebar" title="Show sidebar" onClick={()=>setSidebarOpen(true)}>☰</button>}<span>Journal</span>{current&&<>{ancestry(current).map(parent=><span key={parent.id}> / {parent.title}</span>)}<span className="twe-workspace-crumb-current"> / {current.title}</span></>}</div>
    {current&&<div className="twe-workspace-document-controls">{canEdit&&<span className={"twe-workspace-visibility twe-workspace-visibility-"+current.visibility}>{current.visibility==="gm"?"GM only":current.visibility==="selected"?"Selected players":"All players"}</span>}{canEdit&&!editing&&<button type="button" disabled={uploading||saving} className="twe-button twe-button-subtle" onClick={()=>{setCreatingFolder(current.kind==="folder");setDraft({title:current.title,content:current.content,visibility:current.visibility,icon:journalPageIcon(current.icon)});setEditing(true);}}>{current.kind==="folder"?"Edit folder":"Edit page"}</button>{canEdit&&editing&&<div className="twe-workspace-action-row"><button form="twe-journal-page-editor" type="submit" disabled={uploading||saving} className="twe-button twe-button-primary">{saving?"Saving…":"Save "+(creatingFolder?"folder":"page")}</button><button type="button" disabled={uploading||saving} className="twe-button" onClick={()=>{if(discardDraft())setEditing(false);}}>Cancel</button></div>}}</div>}
   </div>
   {editing&&canEdit?<form id="twe-journal-page-editor" className="twe-workspace-editor" onSubmit={save}>
    <div className="twe-workspace-editor-top"><span className="twe-workspace-eyebrow">{creatingFolder?"New folder":selected?"Edit page":"New page"}</span>{!current&&}</div>
    <label className="twe-workspace-field">Title<input autoFocus required disabled={saving} maxLength={160} placeholder={creatingFolder?"Folder name":"Untitled page"} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
    {!creatingFolder&&<><button type="button" className="twe-button journal-add-npc" disabled={saving||uploading} onClick={()=>setNpcCreatorOpen(open=>!open)}>+ Add NPC stat block</button>{npcCreatorOpen&&<JournalNpcCreator campaignId={campaignId} onCancel={()=>setNpcCreatorOpen(false)} onInserted={markdown=>{setDraft(old=>({...old,content:old.content.trimEnd()+"\n\n"+markdown+"\n"}));setEditorSession(value=>value+1);setNpcCreatorOpen(false);setUploadNotice("NPC saved to the campaign library. Save this page to keep the stat block.");}}/>}<JournalIconPicker value={draft.icon} onChange={icon=>setDraft(old=>({...old,icon}))} disabled={uploading||saving}/><JournalVisualEditor campaignId={campaignId} key={(selected||"new-page")+":"+editorSession} value={draft.content} onChange={content=>setDraft(old=>({...old,content}))} disabled={uploading||saving} pages={entries} current={current} onAttach={uploadJournalFile} localImageUrls={localImageUrls}/></>}
    <div className="twe-workspace-editor-bottom"><label className="twe-workspace-field">Who can read this?<select disabled={saving} value={draft.visibility} onChange={e=>setDraft({...draft,visibility:e.target.value})}><option value="gm">GM only</option><option value="players">All players</option><option value="selected">Selected players</option></select></label><div className="twe-workspace-action-row"><button className="twe-button twe-button-primary" type="submit" disabled={uploading||saving}>{saving?"Saving…":"Save "+(creatingFolder?"folder":"page")}</button><button className="twe-button" type="button" disabled={uploading||saving} onClick={()=>{if(discardDraft())setEditing(false);}}>Cancel</button></div>{current&&<button className="twe-button twe-button-danger twe-workspace-delete-entry" type="button" disabled={uploading||saving} onClick={()=>void deleteEntry(current)}>Delete {current.kind==="folder"?"folder":"page"}…</button>}</div>
   </form>:current?<article className={"twe-workspace-page journal-article-"+(current.kind==="folder"?"folder":(/npc|character|people|person/i.test(ancestry(current).map(p=>p.title).join(" / "))?"npc":/monster|creature|bestiary|enemy/i.test(ancestry(current).map(p=>p.title).join(" / "))?"monster":/location|city|town|village|region|place|settlement/i.test(ancestry(current).map(p=>p.title).join(" / "))?"location":"general"))}>
    <div className="twe-workspace-page-heading"><span className="twe-workspace-eyebrow">{current.kind==="folder"?"Folder":(/npc|character|people|person/i.test(ancestry(current).map(p=>p.title).join(" / "))?"NPC":/monster|creature|bestiary|enemy/i.test(ancestry(current).map(p=>p.title).join(" / "))?"Creature":/location|city|town|village|region|place|settlement/i.test(ancestry(current).map(p=>p.title).join(" / "))?"Location":"Journal entry")}</span><h3 className="twe-workspace-article-heading">{current.kind==="page"&&<JournalPageIconView icon={current.icon} size={30}/>}<span>{current.title}</span></h3><div className="twe-workspace-page-meta">{current.kind==="folder"?"Organize the pages in this folder":"Campaign knowledge"}</div></div>
    {canEdit&&current.kind==="page"&&current.visibility==="selected"&&<button type="button" className="twe-button twe-button-subtle" onClick={()=>void openReaders(current.id)}>Choose players</button>}
    {canEdit&&current.kind==="folder"&&<div className="twe-workspace-page-tools"><button type="button" className="twe-button twe-button-primary" onClick={()=>{if(!discardDraft())return;setEditorSession(value=>value+1);setSelected("");setParentId(current.id);setCreatingFolder(false);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>+ New page here</button></div>}
    {current.kind==="page"&&<div className="twe-workspace-prose"><JournalDocument campaignId={campaignId} content={resolveJournalWikilinks(journalPropertiesMarkdown(current.content),current,entries)} onJournalNavigate={id=>{if(!uploading&&!saving&&entries.some(entry=>entry.id===id&&entry.kind==="page")&&discardDraft()){setSelected(id);setEditing(false);}}}/></div>}
   </article>:<div className="twe-workspace-welcome"><div className="twe-workspace-welcome-icon" aria-hidden="true">✦</div><h3>Your campaign, one page at a time</h3><p>Select a page from the library to read it{canEdit?", or create a page to begin building your world":"."}.</p>{canEdit&&<button className="twe-button twe-button-primary" type="button" onClick={()=>{if(!discardDraft())return;setEditorSession(value=>value+1);setSelected("");setCreatingFolder(false);setParentId(null);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>Create a page</button>}</div>}
  </main>
 </div>
</section>;
}
