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
import { campaignMapOpenEvent } from "./campaign-map-events";
import { JournalNpcCreator } from "./journal-npc-creator";
type RecoveryDraft={id:string;parentId:string|null;creatingFolder:boolean;draft:{title:string;content:string;visibility:string;icon:string};timestamp:number};
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
const [mapChoices,setMapChoices]=useState<{id:string;name:string}[]>([]);
const [mapLinkBusy,setMapLinkBusy]=useState(false);
const [chosenMapId,setChosenMapId]=useState("");

const searchRef=useRef<HTMLInputElement>(null);
const [backStack,setBackStack]=useState<string[]>([]);
const [forwardStack,setForwardStack]=useState<string[]>([]);
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
const [recovery,setRecovery]=useState<RecoveryDraft|null>(null);
const recoveryKey=viewerId?"twe-journal-recovery:"+viewerId+":"+campaignId:"";
useEffect(()=>{
 if(!recoveryKey||!canEdit||preview){return;}
 try{
  const raw=sessionStorage.getItem(recoveryKey);
  const data=raw?JSON.parse(raw) as RecoveryDraft:null;
  if(data&&typeof data.timestamp==="number"&&Date.now()-data.timestamp<7*24*60*60*1000&&
   typeof data.id==="string"&&typeof data.draft?.title==="string"&&typeof data.draft?.content==="string"&&
   typeof data.draft?.visibility==="string"&&typeof data.draft?.icon==="string"&&
   (!data.id||entries.some(entry=>entry.id===data.id))){
   requestAnimationFrame(()=>setRecovery(data));
  }else if(raw)sessionStorage.removeItem(recoveryKey);
 }catch{try{sessionStorage.removeItem(recoveryKey);}catch{}}
},[recoveryKey,canEdit,preview,entries]);
function clearRecoveredDraft(){
 if(recoveryKey)try{sessionStorage.removeItem(recoveryKey);}catch{}
 setRecovery(null);
}
function restoreRecoveredDraft(){
 if(!recovery||!discardDraft())return;
 setSelected(recovery.id);setParentId(recovery.parentId);setCreatingFolder(recovery.creatingFolder);
 setDraft(recovery.draft);setEditorSession(value=>value+1);setEditing(true);setRecovery(null);
}

const endpoint="/api/campaigns/"+encodeURIComponent(campaignId)+"/journal";
const folderRoles=["Locations","NPCs","Items","Stores","Quests","Session Notes"] as const;
const [folderRoleDraft,setFolderRoleDraft]=useState("");
function roleFor(entry:Entry){const role=entry.icon?.startsWith("twe-role:")?entry.icon.slice(9):"";return folderRoles.find(name=>name.toLowerCase()===role)||folderRoles.find(name=>name.toLowerCase()===entry.title.trim().toLowerCase()&&!entries.some(other=>other.kind==="folder"&&other.icon==="twe-role:"+name.toLowerCase()))||null;}
async function designateFolder(entry:Entry,role:string){
 try{const response=await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"designateFolder",id:entry.id,role:role.toLowerCase()})});
 const body=await response.json() as {error?:string;icon?:string};if(!response.ok||!body.icon)throw new Error(body.error||"Could not designate folder.");
 setEntries(old=>old.map(item=>item.kind==="folder"?{...item,icon:item.id===entry.id?body.icon:item.icon===body.icon?"file-text":item.icon}:item));setMenuId("");
 }catch(cause){setError(cause instanceof Error?cause.message:"Could not designate folder.");}
}

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
useEffect(()=>{
 let active=true;
 const check=async()=>{
  if(!active||editing||saving||uploading||document.visibilityState!=="visible")return;
  try{
   const response=await fetch(endpoint+(preview?"?preview=player":""),{cache:"no-store"});
   if(!response.ok||!active)return;
   const body=await response.json() as {entries?:Entry[]};
   if(active&&Array.isArray(body.entries))setEntries(previous=>{
    const changed=previous.length!==body.entries!.length||previous.some((entry,i)=>{
     const other=body.entries![i];return !other||entry.id!==other.id||entry.title!==other.title||entry.content!==other.content||entry.parentId!==other.parentId||entry.icon!==other.icon||entry.visibility!==other.visibility;
    });
    return changed?body.entries!:previous;
   });
  }catch{}
 };
 const onFocus=()=>{void check();};
 const onDataChanged=(event:Event)=>{const detail=(event as CustomEvent<{campaignId?:string}>).detail;if(detail?.campaignId===campaignId)void check();};
 window.addEventListener("twe:campaign-data-changed",onDataChanged);
 window.addEventListener("focus",onFocus);
 document.addEventListener("visibilitychange",onFocus);
 const interval=window.setInterval(()=>{void check();},30_000);
 return()=>{active=false;window.clearInterval(interval);window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onFocus);window.removeEventListener("twe:campaign-data-changed",onDataChanged);};
},[endpoint,preview,editing,saving,uploading,campaignId]);
const current=entries.find(e=>e.id===selected);
function openJournalEntry(id:string){
 if(id===selected||!discardDraft())return;
 if(selected)setBackStack(stack=>[...stack.slice(-29),selected]);
 setForwardStack([]);
 setSelected(id);setEditing(false);
}
function travelJournal(direction:"back"|"forward"){
 const source=direction==="back"?backStack:forwardStack;
 const target=source[source.length-1];
 if(!target||!entries.some(entry=>entry.id===target)||!discardDraft())return;
 if(direction==="back"){setBackStack(stack=>stack.slice(0,-1));if(selected)setForwardStack(stack=>[...stack,selected]);}
 else{setForwardStack(stack=>stack.slice(0,-1));if(selected)setBackStack(stack=>[...stack,selected]);}
 setSelected(target);setEditing(false);
}
useEffect(()=>{
 const onKey=(event:KeyboardEvent)=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setSidebarOpen(true);searchRef.current?.focus();searchRef.current?.select();}
  if(event.key==="Escape"&&document.activeElement===searchRef.current){setSearch("");searchRef.current?.blur();}
 };
 document.addEventListener("keydown",onKey);
 return()=>document.removeEventListener("keydown",onKey);
},[]);
const dirty=editing&&(current?draft.title!==current.title||draft.content!==current.content||draft.visibility!==current.visibility||draft.icon!==journalPageIcon(current.icon):Boolean(draft.title.trim()||draft.content.trim()));
useEffect(()=>{
 if(!recoveryKey||!canEdit||preview||!editing||!dirty||uploading||draft.content.includes("blob:"))return;
 const snapshot:RecoveryDraft={id:selected,parentId,creatingFolder,draft,timestamp:Date.now()};
 try{sessionStorage.setItem(recoveryKey,JSON.stringify(snapshot));}catch{}
},[recoveryKey,canEdit,preview,editing,dirty,uploading,selected,parentId,creatingFolder,draft]);
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
function discardDraft(){if(uploading||saving)return false;if(dirty&&!window.confirm("Discard unsaved changes?"))return false;if(editing)clearRecoveredDraft();clearAttachments();setError("");setUploadNotice("");return true;}
const entryById=new Map(entries.map(entry=>[entry.id,entry]));
const ancestry=(entry:Entry):Entry[]=>{
 const parents:Entry[]=[];const seen=new Set<string>([entry.id]);let parent=entry.parentId;
 while(parent&&!seen.has(parent)){seen.add(parent);const item=entryById.get(parent);if(!item)break;parents.unshift(item);parent=item.parentId;}
 return parents;
};
const searchTerm=search.trim().toLocaleLowerCase();
const matchesSearch=(entry:Entry)=>!searchTerm||entry.title.toLocaleLowerCase().includes(searchTerm)||(entry.kind==="page"&&entry.content.toLocaleLowerCase().includes(searchTerm));
const searchSnippet=(entry:Entry)=>{
 if(!searchTerm||entry.kind!=="page")return "";
 const content=entry.content.replace(/[#*_~\x60>\[\]()]|\s+/g," ").trim();
 const at=content.toLocaleLowerCase().indexOf(searchTerm);
 if(at<0)return "";
 const start=Math.max(0,at-35);
 return (start?"…":"")+content.slice(start,at+searchTerm.length+60).trim()+(at+searchTerm.length+60<content.length?"…":"");
};
const visibleInTree=(entry:Entry)=>!ancestry(entry).some(folder=>collapsedFolders.has(folder.id));
const childrenByParent=new Map<string,Entry[]>();
for(const entry of entries){const key=entry.parentId??"";const siblings=childrenByParent.get(key)??[];siblings.push(entry);childrenByParent.set(key,siblings);}
const isSessionRecap=(entry:Entry|undefined)=>entry?.kind==="page"&&entry.content.includes("<!-- twe-session-recap:");
const compareEntries=(a:Entry,b:Entry)=>isSessionRecap(a)!==isSessionRecap(b)?(isSessionRecap(a)?-1:1):isSessionRecap(a)&&isSessionRecap(b)?b.title.localeCompare(a.title):a.sortOrder!=null&&b.sortOrder!=null?a.sortOrder-b.sortOrder:a.sortOrder!=null?-1:b.sortOrder!=null?1:a.kind===b.kind?a.title.localeCompare(b.title):a.kind==="folder"?-1:1;
for(const siblings of childrenByParent.values())siblings.sort(compareEntries);
const sortedEntries:Entry[]=[];const visited=new Set<string>();
function addChildren(parent:string,depth=0){if(depth>20)return;for(const entry of childrenByParent.get(parent)??[]){if(visited.has(entry.id))continue;visited.add(entry.id);sortedEntries.push(entry);addChildren(entry.id,depth+1);}}
addChildren("");for(const entry of entries.slice().sort(compareEntries)){if(!visited.has(entry.id)){visited.add(entry.id);sortedEntries.push(entry);}}
const matchingEntries=sortedEntries.filter(entry=>matchesSearch(entry)&&(search.trim()||visibleInTree(entry)));
const [bulkSelected,setBulkSelected]=useState<ReadonlySet<string>>(()=>new Set());
const [selectionAnchor,setSelectionAnchor]=useState("");
const [bulkBusy,setBulkBusy]=useState(false);
const [bulkNotice,setBulkNotice]=useState("");
const bulkIds=[...bulkSelected].filter(id=>entryById.get(id)?.kind==="page");
function selectJournalPage(event:React.MouseEvent,id:string){
 const visiblePages=matchingEntries.filter(item=>item.kind==="page").map(item=>item.id);
 if(event.shiftKey&&selectionAnchor&&visiblePages.includes(selectionAnchor)){
  event.preventDefault();
  const start=visiblePages.indexOf(selectionAnchor),end=visiblePages.indexOf(id);
  if(end>=0)setBulkSelected(new Set(visiblePages.slice(Math.min(start,end),Math.max(start,end)+1)));
 }else if(event.metaKey||event.ctrlKey){
  event.preventDefault();setBulkSelected(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});
  setSelectionAnchor(id);
 }else{setBulkSelected(new Set([id]));setSelectionAnchor(id);}
}
async function moveBulkPages(targetId:string|null){
 if(!canEdit||preview||bulkBusy||!bulkIds.length||bulkIds.some(id=>!validTarget(id,targetId)))return;
 const pending=bulkIds.filter(id=>entryById.get(id)?.parentId!==targetId);
 if(!pending.length){setBulkSelected(new Set());return;}
 setBulkBusy(true);setBulkNotice("");
 try{
  const response=await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"movePages",ids:pending,parentId:targetId})});
  const result=await response.json() as {move?:{ids:string[]};error?:string};
  if(!response.ok||!result.move)throw new Error(result.error||"Could not move selected articles.");
  const moved=new Set(result.move.ids);
  setEntries(old=>old.map(entry=>moved.has(entry.id)?{...entry,parentId:targetId}:entry));
  if(targetId)setCollapsedFolders(old=>{const next=new Set(old);next.delete(targetId);return next;});
  setBulkSelected(new Set());setSelectionAnchor("");setBulkNotice(moved.size+" articles moved.");setError("");
 }catch(error){
  setError(error instanceof Error?error.message:"Bulk move failed.");
  await refresh();
 }finally{setBulkBusy(false);setDragged(null);setDropTarget(null);setReorderTarget(null);}
}

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
 if(isSessionRecap(entryById.get(sourceId)!)||isSessionRecap(entryById.get(beforeId)!))return;
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
function normalizeRecapContent(content:string){
 if(!content.startsWith("<!-- twe-session-recap:"))return content;
 return content.replace(/^(<!-- twe-session-recap:[^>]* -->)\\n\\n/, "$1\n\n");
}
const mapLinkPattern=/^<!-- twe-map:(map_[a-f0-9-]{36}) -->\s*$/gmu;
function linkedMapId(entry:Entry){return /^<!-- twe-map:(map_[a-f0-9-]{36}) -->\s*$/mu.exec(entry.content)?.[1]??"";}
async function loadMapChoices(){
 setMapLinkBusy(true);
 try{
  const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/map",{cache:"no-store"});
  const data=await response.json() as {maps?:{id:string;name:string}[];error?:string};
  if(!response.ok||!Array.isArray(data.maps))throw new Error(data.error||"Unable to load maps.");
  setMapChoices(data.maps);
 }catch(cause){setError(cause instanceof Error?cause.message:"Unable to load maps.");}
 finally{setMapLinkBusy(false);}
}
useEffect(()=>{if(editing&&!creatingFolder)void loadMapChoices();},[editing,creatingFolder,campaignId]);
function openLinkedMap(mapId:string){
 window.dispatchEvent(new CustomEvent(campaignMapOpenEvent,{detail:{campaignId,action:"open",mapId}}));
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
async function changeFolderVisibility(entry:Entry,visibility:"gm"|"players",includeContents:boolean){
 if(!canEdit||preview||saving||uploading||!discardDraft())return;
 const count=entries.filter(item=>item.id===entry.id||(includeContents&&ancestry(item).some(parent=>parent.id===entry.id))).length;
 if(!window.confirm((visibility==="players"?"Reveal":"Hide")+" "+(includeContents?count+" folder and nested items":"folder only")+" for "+entry.title+"? Existing GM-only passages inside articles remain protected."))return;
 try{
  const response=await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"folderVisibility",id:entry.id,visibility,includeContents})});
  const result=await response.json() as {error?:string;updated?:number};
  if(!response.ok)throw new Error(result.error||"Folder visibility could not be updated.");
  await refresh();setError("");
 }catch(cause){setError(cause instanceof Error?cause.message:"Folder visibility could not be updated.");}
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
 const j=await r.json() as {error?:string};if(!r.ok){setError(j.error||"Could not save players");return;}const entry=entryById.get(readerEntryId);
 if(entry&&entry.visibility!=="selected"){
  const change=await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:entry.id,visibility:"selected"})});
  const outcome=await change.json() as {error?:string};
  if(!change.ok){setError(outcome.error||"Players saved but visibility could not be changed.");return;}
 }
 setReaderEditing(false);await refresh();
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
  const cleaned=draft.content.replace(mapLinkPattern,"").trimStart();
  const savedDraft={...draft,content:!creatingFolder&&chosenMapId?"<!-- twe-map:"+chosenMapId+" -->\n\n"+cleaned:cleaned};
  const entry=await saveJournalEditorDraft({endpoint,id:selected,kind:creatingFolder?"folder":"page",parentId,draft:savedDraft,attachments:pendingAttachments.current,onCreated:created=>{setSelected(created.id);setEntries(old=>[...old,created]);}});
  if(creatingFolder&&(folderRoleDraft!==""||Boolean(selected&&current?.kind==="folder"&&roleFor(current)))){await designateFolder(entry,folderRoleDraft);}
  setEntries(old=>old.some(item=>item.id===entry.id)?old.map(item=>item.id===entry.id?entry:item):[...old,entry]);setSelected(entry.id);setDraft({title:entry.title,content:entry.content,visibility:entry.visibility,icon:journalPageIcon(entry.icon)});setEditing(false);setCreatingFolder(false);clearRecoveredDraft();clearAttachments();setUploadNotice("");await refresh();window.dispatchEvent(new CustomEvent("twe:campaign-data-changed",{detail:{campaignId,area:"journal"}}));
 }catch(cause){setError(cause instanceof Error?cause.message:"The page could not be saved.");}
 finally{savingRef.current=false;setSaving(false);}
}
return <section className="campaign-panel campaign-journal twe-workspace" aria-label="Campaign Journal workspace">
 <header className="twe-workspace-header">
  <div className="twe-workspace-heading"><span className="twe-workspace-eyebrow">Campaign knowledge</span><h2>Campaign Journal</h2><p>Notes, places, characters and stories from your world.</p></div>
  <div className="twe-workspace-header-actions">
   {canEdit&&!preview&&<button type="button" disabled={uploading||saving} className="twe-button twe-button-primary" onClick={()=>{if(!discardDraft())return;setEditorSession(value=>value+1);setSelected("");setParentId(null);setCreatingFolder(false);setChosenMapId("");setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>+ New page</button>}
   {canEdit&&!preview&&<button type="button" disabled={uploading||saving} className="twe-button" onClick={()=>{if(!discardDraft())return;setEditorSession(value=>value+1);setSelected("");setParentId(null);setCreatingFolder(true);setFolderRoleDraft("");setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>New folder</button>}
   {canEdit&&!preview&&<button type="button" className="twe-button" aria-expanded={importOpen} onClick={()=>setImportOpen(open=>!open)}>{importOpen?"Close import":"Import"}</button>}
   {canEdit&&!preview&&<button type="button" disabled={uploading||saving} className="twe-button" onClick={()=>{if(discardDraft()){setEditing(false);setPreview(true);}}}>View as player</button>}
   {preview&&<button type="button" className="twe-button twe-button-primary" onClick={()=>setPreview(false)}>Return to GM view</button>}
  </div>
 </header>
 {error&&<p className="twe-workspace-alert" role="alert">{error}</p>}
 {uploadNotice&&<p className="twe-workspace-notice" role="status">{uploadNotice}</p>}
 {importOpen&&canEdit&&<div className="twe-workspace-import"><JournalImport endpoint={endpoint} onImported={refresh}/></div>}
 {recovery&&canEdit&&!preview&&<div className="journal-recovery-banner" role="status"><span>Unsaved Journal draft from this tab is available to restore. Attachments may need to be added again.</span><button type="button" className="twe-button twe-button-primary" onClick={restoreRecoveredDraft}>Restore draft</button><button type="button" className="twe-button" onClick={clearRecoveredDraft}>Discard</button></div>}
 {readerEditing&&canEdit&&<section className="twe-workspace-readers" aria-label="Selected journal readers"><h3>Share {entryById.get(readerEntryId)?.title} with players</h3><div className="twe-workspace-reader-list">{readers.map((reader,index)=><label key={reader.userId}><input type="checkbox" checked={Boolean(reader.selected)} onChange={e=>setReaders(old=>old.map((item,i)=>i===index?{...item,selected:e.target.checked?1:0}:item))}/>{reader.name}</label>)}</div><div className="twe-workspace-action-row"><button type="button" className="twe-button twe-button-primary" onClick={()=>void saveReaders()}>Save players</button><button type="button" className="twe-button" onClick={()=>setReaderEditing(false)}>Cancel</button></div></section>}
 <div className={"twe-workspace-shell"+(sidebarOpen?"":" twe-workspace-shell-collapsed")} style={{"--journal-sidebar-width":sidebarWidth+"px"} as CSSProperties}>
  <aside className="twe-workspace-nav" aria-label="Journal navigation">
   <div className="twe-workspace-nav-top"><span className="twe-workspace-section-label">Library</span><button type="button" className="twe-workspace-folders-all" onClick={toggleAllFolders} aria-label={entries.filter(item=>item.kind==="folder").every(item=>collapsedFolders.has(item.id))?"Expand all folders":"Collapse all folders"}>{entries.filter(item=>item.kind==="folder").every(item=>collapsedFolders.has(item.id))?"Expand all":"Collapse all"}</button><button type="button" className="twe-workspace-icon-button" title="Collapse sidebar" aria-label="Collapse sidebar" onClick={()=>setSidebarOpen(false)}>‹</button></div>
   <label className="twe-workspace-search"><span className="twe-workspace-search-icon" aria-hidden="true">⌕</span><input ref={searchRef} aria-label="Search journal" placeholder="Find a page… (Ctrl/⌘ K)" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" aria-label="Clear search" onClick={()=>setSearch("")}>×</button>}</label>
   <div className="twe-workspace-nav-caption">{search.trim()?matchingEntries.length+" matches":entries.length+" items"}</div>
   {canEdit&&!preview&&bulkIds.length>1&&<div className="twe-workspace-bulk-toolbar" role="status"><strong>{bulkIds.length} articles selected</strong><button type="button" onClick={()=>{setBulkSelected(new Set());setSelectionAnchor("");}}>Clear</button><select aria-label="Move selected articles to folder" value="" disabled={bulkBusy} onChange={event=>{if(event.target.value)void moveBulkPages(event.target.value==="root"?null:event.target.value);}}><option value="">Move to…</option><option value="root">Top level</option>{sortedEntries.filter(item=>item.kind==="folder").map(item=><option value={item.id} key={item.id}>{ancestry(item).map(p=>p.title+" / ").join("")+item.title}</option>)}</select></div>}
   {bulkNotice&&<div role="status" className="twe-workspace-nav-caption">{bulkNotice}</div>}
   {canEdit&&!preview&&<button type="button" className={"twe-workspace-root-drop"+(dropTarget==="root"?" is-drop-target":"")} onDragOver={e=>{if(dragged&&validTarget(dragged,null)){e.preventDefault();setDropTarget("root");}}} onDragLeave={()=>setDropTarget(null)} onDrop={e=>{e.preventDefault();if(dragged){if(bulkIds.length>1&&bulkSelected.has(dragged))void moveBulkPages(null);else void moveEntry(dragged,null);}}} onClick={()=>{if(moveId)void moveEntry(moveId,null);else if(bulkIds.length)void moveBulkPages(null);}}>↖ Top level {moveId?"(move selected item)":""}</button>}
   <nav className="twe-workspace-tree" aria-label="Pages and folders">
    {matchingEntries.map(entry=>{
      const depth=Math.min(ancestry(entry).length,6);
      const folder=entry.kind==="folder";
      return <div key={entry.id} className={"twe-workspace-tree-row"+(folder?" is-folder":" is-article")+(depth===0?" is-root":" is-nested")+(selected===entry.id?" is-active":"")+(bulkSelected.has(entry.id)?" is-bulk-selected":"")+(dropTarget===entry.id?" is-drop-target":"")+(reorderTarget===entry.id?" is-reorder-target":"")} draggable={canEdit&&!preview&&!isSessionRecap(entry)} onDragStart={e=>{if(entry.kind==="page"&&!bulkSelected.has(entry.id)){setBulkSelected(new Set([entry.id]));setSelectionAnchor(entry.id);}setDragged(entry.id);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",entry.id);}} onDragEnd={()=>{setDragged(null);setDropTarget(null);setReorderTarget(null);}} onDragOver={e=>{
 if(!dragged||dragged===entry.id)return;
 const source=entryById.get(dragged);
 if(bulkIds.length>1&&bulkSelected.has(dragged)){if(folder&&validTarget(dragged,entry.id)){e.preventDefault();setDropTarget(entry.id);}return;}
  if(source?.parentId===entry.parentId){e.preventDefault();setReorderTarget(entry.id);setDropTarget(null);}
 else if(folder&&validTarget(dragged,entry.id)){e.preventDefault();setDropTarget(entry.id);setReorderTarget(null);}
 }} onDragLeave={()=>{setDropTarget(null);setReorderTarget(null);}} onDrop={e=>{if(!dragged)return;e.preventDefault();e.stopPropagation();if(bulkIds.length>1&&bulkSelected.has(dragged)){if(folder)void moveBulkPages(entry.id);}else if(entryById.get(dragged)?.parentId===entry.parentId)void reorderEntry(dragged,entry.id);else if(folder&&validTarget(dragged,entry.id))void moveEntry(dragged,entry.id);}} style={{paddingLeft:8+depth*14}}>
       {folder?<button type="button" className="twe-workspace-tree-toggle" aria-label={(collapsedFolders.has(entry.id)?"Expand ":"Collapse ")+entry.title} aria-expanded={!collapsedFolders.has(entry.id)} onClick={()=>toggleFolder(entry.id)}>{collapsedFolders.has(entry.id)?"▸":"▾"}</button>:<span className="twe-workspace-tree-spacer"/>}
       <button type="button" disabled={uploading||saving} className="twe-workspace-tree-name" aria-current={selected===entry.id?"page":undefined} aria-expanded={folder?!collapsedFolders.has(entry.id):undefined} onClick={event=>{if(canEdit&&!preview&&entry.kind==="page"){selectJournalPage(event,entry.id);if(event.shiftKey||event.metaKey||event.ctrlKey)return;}else if(!event.shiftKey&&!event.ctrlKey&&!event.metaKey)setBulkSelected(new Set());if(entry.id!==selected){if(!discardDraft())return;if(selected)setBackStack(stack=>[...stack.slice(-29),selected]);setForwardStack([]);setSelected(entry.id);setEditing(false);}if(folder)toggleFolder(entry.id);}}><span className="twe-workspace-tree-glyph" aria-hidden="true">{folder?<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/><path d="M3 10h18"/></svg>:<JournalPageIconView icon={entry.icon} size={16}/>}</span><span title={searchTerm?ancestry(entry).map(parent=>parent.title).concat(entry.title).join(" / "):entry.title} className="twe-workspace-entry-title">{entry.title}{folder&&roleFor(entry)&&<small className="twe-workspace-folder-role-badge" title="Designated Journal category">{roleFor(entry)}</small>}{searchTerm&&searchSnippet(entry)&&<small className="twe-workspace-search-snippet">{searchSnippet(entry)}</small>}</span>{entry.visibility==="gm"&&<span className="twe-workspace-entry-lock" role="img" aria-label="GM only" title="GM only">🔒</span>}</button>{canEdit&&!preview&&<button type="button" className="twe-workspace-move-button" aria-label={"Actions for "+entry.title} aria-expanded={menuId===entry.id} title={"Actions for "+entry.title} onClick={()=>setMenuId(old=>old===entry.id?"":entry.id)}>⋮</button>}
       {menuId===entry.id&&canEdit&&!preview&&<div className="twe-workspace-entry-menu" role="group" aria-label={"Actions for "+entry.title}>
        <button type="button" onClick={()=>{setMoveId(entry.id);setMenuId("");}}>Move to folder…</button>
        <button type="button" onClick={()=>{const title=window.prompt("Rename entry",entry.title);if(title!==null&&title.trim()&&title!==entry.title)void editEntryQuick(entry,{title:title.trim()});else setMenuId("");}}>Rename</button>
        <button type="button" onClick={()=>void duplicateEntry(entry)}>Duplicate</button>
        <button type="button" aria-pressed={entry.visibility==="gm"} onClick={()=>void editEntryQuick(entry,{visibility:"gm"})}>{entry.visibility==="gm"?"✓ ":""}GM only</button>
        <button type="button" aria-pressed={entry.visibility==="players"} onClick={()=>void editEntryQuick(entry,{visibility:"players"})}>{entry.visibility==="players"?"✓ ":""}All players</button>
        <button type="button" onClick={()=>{setMenuId("");void openReaders(entry.id);}}>{entry.visibility==="selected"?"✓ ":""}Choose selected players…</button>{folder&&<><button type="button" onClick={()=>void changeFolderVisibility(entry,"players",false)}>Reveal folder only…</button><button type="button" onClick={()=>void changeFolderVisibility(entry,"players",true)}>Reveal folder and contents…</button><button type="button" onClick={()=>void changeFolderVisibility(entry,"gm",false)}>Hide folder only…</button><button type="button" onClick={()=>void changeFolderVisibility(entry,"gm",true)}>Hide folder and contents…</button></>}
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
    <div className="twe-workspace-crumbs"><div className="twe-workspace-history"><button type="button" aria-label="Previous Journal page" title="Previous Journal page" disabled={!backStack.length} onClick={()=>travelJournal("back")}>←</button><button type="button" aria-label="Next Journal page" title="Next Journal page" disabled={!forwardStack.length} onClick={()=>travelJournal("forward")}>→</button></div>{!sidebarOpen&&<button type="button" className="twe-workspace-icon-button" aria-label="Show sidebar" title="Show sidebar" onClick={()=>setSidebarOpen(true)}>☰</button>}<span>Journal</span>{current&&<>{ancestry(current).map(parent=><span key={parent.id}> / {parent.title}</span>)}<span className="twe-workspace-crumb-current"> / {current.title}</span></>}</div>
    {current&&<div className="twe-workspace-document-controls">{canEdit&&<span className={"twe-workspace-visibility twe-workspace-visibility-"+current.visibility}>{current.visibility==="gm"?"GM only":current.visibility==="selected"?"Selected players":"All players"}</span>}{canEdit&&!editing&&<button type="button" disabled={uploading||saving} className="twe-button twe-button-subtle" onClick={()=>{setCreatingFolder(current.kind==="folder");setDraft({title:current.title,content:current.content,visibility:current.visibility,icon:journalPageIcon(current.icon)});setFolderRoleDraft(current.kind==="folder"?(roleFor(current)??""):"");setChosenMapId(current.kind==="page"?linkedMapId(current):"");setEditing(true);}}>{current.kind==="folder"?"Edit folder":"Edit page"}</button>}{canEdit&&editing&&<div className="twe-workspace-action-row"><button form="twe-journal-page-editor" type="submit" disabled={uploading||saving} className="twe-button twe-button-primary">{saving?"Saving…":"Save "+(creatingFolder?"folder":"page")}</button><button type="button" disabled={uploading||saving} className="twe-button" onClick={()=>{if(discardDraft())setEditing(false);}}>Cancel</button></div>}</div>}
   </div>
   {editing&&canEdit?<form id="twe-journal-page-editor" className="twe-workspace-editor" onSubmit={save}>
    <div className="twe-workspace-editor-top"><span className="twe-workspace-eyebrow">{creatingFolder?"New folder":selected?"Edit page":"New page"}</span>{dirty&&<span className="journal-unsaved-indicator" role="status">● Unsaved changes</span>}{!current&&<div className="twe-workspace-action-row"><button className="twe-button twe-button-primary" type="submit" disabled={uploading||saving}>{saving?"Saving…":"Save "+(creatingFolder?"folder":"page")}</button><button className="twe-button" type="button" disabled={uploading||saving} onClick={()=>{if(discardDraft())setEditing(false);}}>Cancel</button></div>}</div>
    <label className="twe-workspace-field">Title<input autoFocus required disabled={saving} maxLength={160} placeholder={creatingFolder?"Folder name":"Untitled page"} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
    {creatingFolder&&<label className="twe-workspace-field">Folder category (optional)<select disabled={saving} value={folderRoleDraft} onChange={event=>setFolderRoleDraft(event.target.value)}><option value="">No category</option>{folderRoles.map(role=><option key={role} value={role.toLowerCase()}>{role}</option>)}</select></label>}
    {!creatingFolder&&<><label className="twe-workspace-field">Linked map<select disabled={saving||mapLinkBusy} value={chosenMapId} onChange={event=>setChosenMapId(event.target.value)}><option value="">No linked map</option>{mapChoices.map(map=><option key={map.id} value={map.id}>{map.name}</option>)}</select></label><button type="button" className="twe-button twe-button-subtle" disabled={mapLinkBusy} onClick={()=>void loadMapChoices()}>Refresh map list</button><button type="button" className="twe-button journal-add-npc" disabled={saving||uploading} onClick={()=>setNpcCreatorOpen(open=>!open)}>+ Add NPC stat block</button>{npcCreatorOpen&&<JournalNpcCreator campaignId={campaignId} onCancel={()=>setNpcCreatorOpen(false)} onInserted={markdown=>{setDraft(old=>({...old,content:old.content.trimEnd()+"\n\n"+markdown+"\n"}));setEditorSession(value=>value+1);setNpcCreatorOpen(false);setUploadNotice("NPC saved to the campaign library. Save this page to keep the stat block.");}}/>}<JournalIconPicker value={draft.icon} onChange={icon=>setDraft(old=>({...old,icon}))} disabled={uploading||saving}/><JournalVisualEditor campaignId={campaignId} key={(selected||"new-page")+":"+editorSession} value={draft.content} onChange={content=>setDraft(old=>({...old,content}))} disabled={uploading||saving} pages={entries} current={current} onAttach={uploadJournalFile} localImageUrls={localImageUrls}/></>}
    <div className="twe-workspace-editor-bottom"><label className="twe-workspace-field">Who can read this?<select disabled={saving} value={draft.visibility} onChange={e=>setDraft({...draft,visibility:e.target.value})}><option value="gm">GM only</option><option value="players">All players</option><option value="selected">Selected players</option></select></label>{current&&<button className="twe-button twe-button-danger twe-workspace-delete-entry" type="button" disabled={uploading||saving} onClick={()=>void deleteEntry(current)}>Delete {current.kind==="folder"?"folder":"page"}…</button>}</div>
   </form>:current?<article className={"twe-workspace-page journal-article-"+(current.kind==="folder"?"folder":(/npc|character|people|person/i.test(ancestry(current).map(p=>p.title).join(" / "))?"npc":/monster|creature|bestiary|enemy/i.test(ancestry(current).map(p=>p.title).join(" / "))?"monster":/location|city|town|village|region|place|settlement/i.test(ancestry(current).map(p=>p.title).join(" / "))?"location":"general"))}>
    <div className="twe-workspace-page-heading"><span className="twe-workspace-eyebrow">{current.kind==="folder"?"Folder":(/npc|character|people|person/i.test(ancestry(current).map(p=>p.title).join(" / "))?"NPC":/monster|creature|bestiary|enemy/i.test(ancestry(current).map(p=>p.title).join(" / "))?"Creature":/location|city|town|village|region|place|settlement/i.test(ancestry(current).map(p=>p.title).join(" / "))?"Location":"Journal entry")}</span><h3 className="twe-workspace-article-heading">{current.kind==="page"&&<JournalPageIconView icon={current.icon} size={30}/>}<span>{current.title}</span></h3><div className="twe-workspace-page-meta">{current.kind==="folder"?"Organize the pages in this folder":"Campaign knowledge"}</div></div>
    {canEdit&&current.kind==="page"&&current.visibility==="selected"&&<button type="button" className="twe-button twe-button-subtle" onClick={()=>void openReaders(current.id)}>Choose players</button>}
    {canEdit&&current.kind==="folder"&&<div className="twe-workspace-page-tools"><button type="button" className="twe-button twe-button-primary" onClick={()=>{if(!discardDraft())return;setEditorSession(value=>value+1);setSelected("");setParentId(current.id);setCreatingFolder(false);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>+ New page here</button></div>}
    {current.kind==="page"&&<div className="journal-map-link-bar">
    {canEdit&&!preview&&linkedMapId(current)&&<button type="button" className="twe-button twe-button-subtle" onClick={()=>openLinkedMap(linkedMapId(current))}>Open linked map</button>}
    
    
   </div>}
    {current.kind==="page"&&<div className="twe-workspace-prose"><JournalDocument campaignId={campaignId} gmView={canEdit&&!preview} content={resolveJournalWikilinks(journalPropertiesMarkdown(normalizeRecapContent(current.content)),current,entries)} onJournalNavigate={id=>{if(!uploading&&!saving&&entries.some(entry=>entry.id===id&&entry.kind==="page")){openJournalEntry(id);}}}/></div>}
   </article>:<div className="twe-workspace-welcome"><div className="twe-workspace-welcome-icon" aria-hidden="true">✦</div><h3>Your campaign, one page at a time</h3><p>Select a page from the library to read it{canEdit?", or create a page to begin building your world":"."}.</p>{canEdit&&<button className="twe-button twe-button-primary" type="button" onClick={()=>{if(!discardDraft())return;setEditorSession(value=>value+1);setSelected("");setCreatingFolder(false);setParentId(null);setDraft({title:"",content:"",visibility:"gm",icon:"file-text"});setEditing(true);}}>Create a page</button>}</div>}
  </main>
 </div>
</section>;
}
