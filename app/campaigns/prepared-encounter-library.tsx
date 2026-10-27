"use client";
import {useEffect,useState,type FormEvent} from "react";
type Entry={kind:"saved"|"bestiary";npcId?:string;bestiaryId?:string;quantity:number};
type Plan={id:string;name:string;entries:Entry[];createdAt:string;updatedAt:string};
type Npc={id:string;name:string;kind?:"npc"|"creature"};
type Creature={id:string;name:string};
export function PreparedEncounterLibrary({campaignId,activeEncounter,canManage,busy,onDeploy,creatures}:{campaignId:string;activeEncounter:boolean;canManage:boolean;busy:boolean;onDeploy:(id:string)=>Promise<void>;creatures:readonly Creature[]}){
 const [plans,setPlans]=useState<Plan[]>([]);
 const [npcs,setNpcs]=useState<Npc[]>([]);
 const [editing,setEditing]=useState<string|null>(null);
 const [name,setName]=useState("");
 const [entries,setEntries]=useState<Entry[]>([]);
 const [kind,setKind]=useState<"saved"|"bestiary">("bestiary");
 const [selection,setSelection]=useState("");
 const [quantity,setQuantity]=useState(1);
 const [working,setWorking]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const url="/api/campaigns/"+encodeURIComponent(campaignId)+"/prepared-encounters";
 async function refresh(){
  const [p,n]=await Promise.all([fetch(url,{cache:"no-store"}),fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/npcs",{cache:"no-store"})]);
  const plansBody=await p.json() as {encounters?:Plan[];error?:string};
  const npcBody=await n.json() as {npcs?:Npc[];error?:string};
  if(!p.ok||!n.ok)throw new Error(plansBody.error||npcBody.error||"Could not load encounter plans.");
  setPlans(plansBody.encounters||[]);setNpcs(npcBody.npcs||[]);
 }
 useEffect(()=>{if(!canManage)return;void refresh().catch(e=>setError(String(e)));},[campaignId,canManage]); // eslint-disable-line react-hooks/exhaustive-deps
 if(!canManage)return null;
 const choices=kind==="saved"?npcs:creatures;
 const label=(entry:Entry)=>entry.kind==="saved"?npcs.find(n=>n.id===entry.npcId)?.name||"Missing saved NPC":creatures.find(c=>c.id===entry.bestiaryId)?.name||"Missing Bestiary creature";
 function edit(plan?:Plan){setEditing(plan?.id||"new");setName(plan?.name||"");setEntries(plan?.entries||[]);setError("");setNotice("");}
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setWorking(true);setError("");
  try{
   const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...(editing!=="new"?{id:editing}:{}),name,entries})});
   const body=await response.json() as {error?:string};
   if(!response.ok)throw new Error(body.error||"Could not save encounter.");
   setEditing(null);await refresh();setNotice("Encounter saved.");
  }catch(e){setError(e instanceof Error?e.message:"Could not save encounter.");}finally{setWorking(false);}
 }
 async function remove(plan:Plan){
  if(!window.confirm("Delete prepared encounter "+plan.name+"?"))return;
  setWorking(true);setError("");
  try{const response=await fetch(url,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:plan.id})});if(!response.ok)throw new Error("Could not delete encounter.");await refresh();}
  catch(e){setError(e instanceof Error?e.message:"Could not delete encounter.");}finally{setWorking(false);}
 }
 async function deploy(plan:Plan){
  setWorking(true);setError("");setNotice("");
  try{await onDeploy(plan.id);setNotice("Deployed "+plan.name+".");}
  catch(e){setError(e instanceof Error?e.message:"Could not deploy encounter.");}finally{setWorking(false);}
 }
 return <section className="gm-console-section" aria-labelledby="prepared-encounters-title">
  <div className="campaign-section-heading"><div><p className="campaign-kicker">ENCOUNTER PLANNING</p><h2 id="prepared-encounters-title">Prepared Encounters</h2></div><button className="campaign-primary" type="button" disabled={working||busy} onClick={()=>edit()}>Prepare Encounter</button></div>
  {error&&<p role="alert" className="campaign-error">{error}</p>}{notice&&<p role="status" className="campaign-notice">{notice}</p>}
  {editing&&<form className="gm-npc-form" onSubmit={save}>
   <div className="gm-npc-form-heading"><h3>{editing==="new"?"New Encounter":"Edit Encounter"}</h3><button className="campaign-quiet" type="button" onClick={()=>setEditing(null)}>Cancel</button></div>
   <label>Encounter name <input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Ambush at the Old Bridge"/></label>
   <div className="gm-bestiary-filters">
    <label>Creature source<select value={kind} onChange={e=>{setKind(e.target.value as "saved"|"bestiary");setSelection("");}}><option value="bestiary">Bestiary</option><option value="saved">Saved NPCs and creatures</option></select></label>
    <label>Creature<select value={selection} onChange={e=>setSelection(e.target.value)}><option value="">Choose creature</option>{choices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Quantity<input type="number" min={1} max={30} value={quantity} onChange={e=>setQuantity(Math.min(30,Math.max(1,Number(e.target.value)||1)))}/></label>
    <button type="button" className="campaign-secondary" disabled={!selection||entries.length>=30} onClick={()=>{setEntries(current=>[...current,kind==="saved"?{kind,npcId:selection,quantity}:{kind,bestiaryId:selection,quantity}]);setSelection("");}}>Add Creature</button>
   </div>
   <ul>{entries.map((entry,i)=><li key={i}>{entry.quantity} × {label(entry)} <button className="campaign-quiet" type="button" onClick={()=>setEntries(current=>current.filter((_,j)=>j!==i))}>Remove</button></li>)}</ul>
   <button className="campaign-primary" type="submit" disabled={working||busy}>Save Encounter</button>
  </form>}
  {!plans.length&&!editing&&<p className="campaign-empty-copy">Save encounters ahead of time, then deploy one during a live session.</p>}
  <div className="gm-npc-list">{plans.map(plan=><article className="gm-npc-card" key={plan.id}><div><h3>{plan.name}</h3><p>{plan.entries.reduce((total,item)=>total+item.quantity,0)} creatures</p><ul>{plan.entries.map((entry,i)=><li key={i}>{entry.quantity} × {label(entry)}</li>)}</ul></div><div className="gm-bestiary-actions"><button className="campaign-primary" type="button" disabled={busy||working||activeEncounter||!plan.entries.length} title={activeEncounter?"End the current encounter before deploying.":undefined} onClick={()=>void deploy(plan)}>Deploy</button><button className="campaign-secondary" type="button" disabled={busy||working} onClick={()=>edit(plan)}>Edit</button><button className="campaign-quiet" type="button" disabled={busy||working} onClick={()=>void remove(plan)}>Delete</button></div></article>)}</div>
 </section>;
}
