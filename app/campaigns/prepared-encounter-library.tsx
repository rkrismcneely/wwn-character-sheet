"use client";
import {useEffect,useState,type FormEvent} from "react";
import "./prepared-encounter-library.css";
type Entry={kind:"saved"|"bestiary"|"party";npcId?:string;bestiaryId?:string;characterId?:string;quantity:number};
type Plan={id:string;name:string;entries:Entry[];createdAt:string;updatedAt:string};
type Npc={id:string;name:string;kind?:"npc"|"creature"};
type Creature={id:string;name:string};
type PartyMember={id:string;name:string};
export function PreparedEncounterLibrary({campaignId,activeEncounter,sessionActive,canManage,busy,onDeploy,creatures}:{campaignId:string;activeEncounter:boolean;sessionActive:boolean;canManage:boolean;busy:boolean;onDeploy:(id:string)=>Promise<void>;creatures:readonly Creature[]}){
 const [plans,setPlans]=useState<Plan[]>([]);
 const [npcs,setNpcs]=useState<Npc[]>([]);
 const [party,setParty]=useState<PartyMember[]>([]);
 const [editing,setEditing]=useState<string|null>(null);
 const [name,setName]=useState("");
 const [entries,setEntries]=useState<Entry[]>([]);
 const [kind,setKind]=useState<"saved"|"bestiary"|"party">("bestiary");
 const [selection,setSelection]=useState("");
 const [quantity,setQuantity]=useState("1");
 const [working,setWorking]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const url="/api/campaigns/"+encodeURIComponent(campaignId)+"/prepared-encounters";
 async function refresh(){
  const [p,n,m]=await Promise.all([fetch(url,{cache:"no-store"}),fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/npcs",{cache:"no-store"}),fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/characters",{cache:"no-store"})]);
  const plansBody=await p.json() as {encounters?:Plan[];error?:string};
  const npcBody=await n.json() as {npcs?:Npc[];error?:string};
  const memberBody=await m.json() as {characters?:PartyMember[];error?:string};
  if(!p.ok||!n.ok||!m.ok)throw new Error(plansBody.error||npcBody.error||memberBody.error||"Could not load encounter plans.");
  setPlans(plansBody.encounters||[]);setNpcs(npcBody.npcs||[]);setParty(memberBody.characters||[]);
 }
 useEffect(()=>{if(!canManage)return;const timer=window.setTimeout(()=>void refresh().catch(e=>setError(String(e))),0);return ()=>window.clearTimeout(timer);},[campaignId,canManage]); // eslint-disable-line react-hooks/exhaustive-deps
 if(!canManage)return null;
 const choices=kind==="saved"?npcs:kind==="party"?[{id:"all",name:"All Party Members"},...party]:creatures;
 const label=(entry:Entry)=>entry.kind==="party"?(entry.characterId==="all"?"All Party Members":party.find(c=>c.id===entry.characterId)?.name||"Missing party member"):entry.kind==="saved"?npcs.find(n=>n.id===entry.npcId)?.name||"Missing saved NPC":creatures.find(c=>c.id===entry.bestiaryId)?.name||"Missing Bestiary creature";
 function edit(plan?:Plan){setEditing(plan?.id||"new");setName(plan?.name||"");setEntries(plan?.entries||[]);setError("");setNotice("");}
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setWorking(true);setError("");
  try{
   const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...(editing!=="new"?{id:editing}:{}),name,entries})});
   const body=await response.json() as {error?:string};
   if(!response.ok)throw new Error(body.error||`Could not save encounter (HTTP ${response.status}).`);
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
 return <section className="gm-console-section prepared-encounters" aria-labelledby="prepared-encounters-title">
  <div className="campaign-section-heading"><div><p className="campaign-kicker">ENCOUNTER PLANNING</p><h2 id="prepared-encounters-title">Prepared Encounters</h2></div><button className="campaign-primary" type="button" disabled={working||busy} onClick={()=>edit()}>Prepare Encounter</button></div>
  {error&&<p role="alert" className="campaign-error">{error}</p>}{notice&&<p role="status" className="campaign-notice">{notice}</p>}
  {editing&&<form className="gm-npc-form prepared-encounter-form" onSubmit={save}>
   <div className="gm-npc-form-heading"><h3>{editing==="new"?"New Encounter":"Edit Encounter"}</h3><button className="campaign-quiet" type="button" onClick={()=>setEditing(null)}>Cancel</button></div>
   <label className="prepared-encounter-name">Encounter name <input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Ambush at the Old Bridge"/></label>
   <div className="prepared-encounter-picker">
    <label className="prepared-encounter-source">Creature source<select value={kind} onChange={e=>{setKind(e.target.value as "saved"|"bestiary"|"party");setSelection("");}}><option value="bestiary">Bestiary</option><option value="saved">Saved NPCs and creatures</option><option value="party">Party</option></select></label>
    <label className="prepared-encounter-creature">Creature<select value={selection} onChange={e=>setSelection(e.target.value)}><option value="">Choose creature</option>{choices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="prepared-encounter-quantity">Quantity<input type="number" min={1} max={30} value={quantity} onChange={e=>setQuantity(e.target.value)} onBlur={()=>{if(!quantity||!Number.isInteger(Number(quantity))||Number(quantity)<1||Number(quantity)>30)setQuantity("1");}} disabled={kind==="party"}/></label>
    <button type="button" className="campaign-secondary prepared-encounter-add" disabled={!selection||entries.length>=30||(kind!=="party"&&(!Number.isInteger(Number(quantity))||Number(quantity)<1||Number(quantity)>30))} onClick={()=>{const count=Number(quantity);setEntries(current=>[...current,kind==="party"?{kind,characterId:selection,quantity:1}:kind==="saved"?{kind,npcId:selection,quantity:count}:{kind,bestiaryId:selection,quantity:count}]);}}>Add Creature</button>
   </div>
   {entries.length>0&&<div className="prepared-encounter-roster"><div className="prepared-encounter-roster-heading">Encounter participants <span>{entries.length} selections</span></div><ul>{entries.map((entry,i)=><li key={i}><span className="prepared-encounter-entry-label"><span className="prepared-encounter-entry-count">{entry.kind==="party"?"PC":`${entry.quantity} ×`}</span>{label(entry)}</span><button className="campaign-quiet" type="button" aria-label={`Remove ${label(entry)}`} onClick={()=>setEntries(current=>current.filter((_,j)=>j!==i))}>Remove</button></li>)}</ul></div>}
   <div className="prepared-encounter-form-actions"><button className="campaign-primary" type="submit" disabled={working||busy}>Save Encounter</button></div>
  </form>}
  {!plans.length&&!editing&&<p className="campaign-empty-copy">Save encounters ahead of time, then deploy one during a live session.</p>}
  <div className="prepared-encounter-list">{plans.map(plan=><article className="prepared-encounter-card" key={plan.id}><div className="prepared-encounter-card-content"><h3>{plan.name}</h3><p>{plan.entries.length} selections</p><ul>{plan.entries.map((entry,i)=><li key={i}>{entry.kind==="party"?"":`${entry.quantity} × `}{label(entry)}</li>)}</ul></div><div className="prepared-encounter-card-actions"><button className="campaign-primary" type="button" disabled={busy||working||activeEncounter||!sessionActive||!plan.entries.length} title={activeEncounter?"End the current encounter before deploying.":!sessionActive?"Start a live session before deploying.":undefined} onClick={()=>void deploy(plan)}>Deploy</button><button className="campaign-secondary" type="button" disabled={busy||working} onClick={()=>edit(plan)}>Edit</button><button className="campaign-quiet" type="button" disabled={busy||working} onClick={()=>void remove(plan)}>Delete</button></div></article>)}</div>
 </section>;
}
