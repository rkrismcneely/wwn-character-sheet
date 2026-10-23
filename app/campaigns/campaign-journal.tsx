"use client";
import { useEffect, useState } from "react";
import { SessionRecapMarkdown } from "./session-recap-markdown";
type Entry={id:string;title:string;content:string;kind:string;visibility:string};
export function CampaignJournal({campaignId}:{campaignId:string}){
const [entries,setEntries]=useState<Entry[]>([]);
const [canEdit,setCanEdit]=useState(false);
const [selected,setSelected]=useState("");
const [preview,setPreview]=useState(false);
const [error,setError]=useState("");
const [draft,setDraft]=useState({title:"",content:"",visibility:"gm"});
const [editing,setEditing]=useState(false);
const endpoint="/api/campaigns/"+encodeURIComponent(campaignId)+"/journal";
async function refresh(){
 const r=await fetch(endpoint+(preview?"?preview=player":""));
 const j=await r.json();
 if(!r.ok){setError(j.error||"Journal unavailable");return;}
 setEntries(j.entries);setCanEdit(j.canEdit);setError("");
}
useEffect(()=>{void refresh();},[campaignId,preview]);
const current=entries.find(e=>e.id===selected);
async function save(e:React.FormEvent){
 e.preventDefault();
 const r=await fetch(endpoint,{method:selected?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(selected?{id:selected,...draft}:{kind:"page",...draft})});
 const j=await r.json();
 if(!r.ok){setError(j.error||"Save failed");return;}
 setSelected(j.entry.id);setEditing(false);await refresh();
}
return <section className="campaign-panel campaign-journal">
 <h2>Campaign Journal</h2>
 <div className="journal-actions">
 {canEdit&&<button onClick={()=>setPreview(true)}>View as Player</button>}
 {preview&&<button onClick={()=>setPreview(false)}>Return to GM View</button>}
 {canEdit&&<button onClick={()=>{setSelected("");setDraft({title:"",content:"",visibility:"gm"});setEditing(true);}}>New Page</button>}
 </div>
 {error&&<p role="alert">{error}</p>}
 <div className="journal-layout"><aside className="journal-sidebar">
 {entries.map(e=><button key={e.id} onClick={()=>{setSelected(e.id);setEditing(false);}}>{e.title}</button>)}
 </aside><div className="journal-main">
 {editing&&canEdit?<form onSubmit={save}>
 <label>Title<input required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
 <label>Markdown<textarea rows={12} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/></label>
 <label>Visibility<select value={draft.visibility} onChange={e=>setDraft({...draft,visibility:e.target.value})}><option value="gm">GM only</option><option value="players">All players</option></select></label>
 <button type="submit">Save</button><button type="button" onClick={()=>setEditing(false)}>Cancel</button>
 </form>:current?<article><h3>{current.title}</h3>{canEdit&&<button onClick={()=>{setDraft({title:current.title,content:current.content,visibility:current.visibility});setEditing(true);}}>Edit</button>}<SessionRecapMarkdown content={current.content}/></article>:<p>Select a page.</p>}
 </div></div></section>;
}
