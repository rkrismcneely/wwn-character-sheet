"use client";
import {useEffect,useState} from "react";
import type {CampaignNpcTemplate} from "@/lib/campaigns/npcs";
import { npcSpellFullDescription } from "@/lib/campaigns/npc-magic-catalog";
import { NPC_CHANGED_EVENT, notifyCampaignNpcChanged } from "@/lib/campaigns/npc-change-events";
export function JournalLinkedNpc({campaignId,npcId}:{campaignId:string;npcId:string}){
 const [npc,setNpc]=useState<CampaignNpcTemplate|null>(null);
 const [error,setError]=useState("");
 const [editing,setEditing]=useState(false);
 const [draft,setDraft]=useState<CampaignNpcTemplate|null>(null);
 const [saving,setSaving]=useState(false);
 const [canEdit,setCanEdit]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  const load=async()=>{
   try{
    const res=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/npcs",{cache:"no-store",signal:controller.signal});
    const data=await res.json() as {npcs?:CampaignNpcTemplate[];error?:string};
    const linked=data.npcs?.find(entry=>entry.id===npcId);
    if(!res.ok||!linked)throw new Error(data.error||"NPC unavailable");
    if(!controller.signal.aborted){setNpc(linked);setError("");setCanEdit(true);}
   }catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:"NPC unavailable");setCanEdit(false);}}
  };
  void load();const reload=()=>{void load();};
  const onNpcChanged=(event:Event)=>{
   const detail=(event as CustomEvent<{campaignId:string;npcId:string}>).detail;
   if(detail?.campaignId===campaignId&&detail.npcId===npcId)reload();
  };
  const onVisibility=()=>{if(!document.hidden)reload();};
  window.addEventListener("focus",reload);
  window.addEventListener(NPC_CHANGED_EVENT,onNpcChanged);
  document.addEventListener("visibilitychange",onVisibility);
  return()=>{controller.abort();window.removeEventListener("focus",reload);window.removeEventListener(NPC_CHANGED_EVENT,onNpcChanged);document.removeEventListener("visibilitychange",onVisibility);};
 },[campaignId,npcId]);
 async function saveEdits(){
  if(!draft||saving)return;
  setSaving(true);setError("");
  try{
   const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/npcs/"+encodeURIComponent(npcId),{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({name:draft.name,hpMax:draft.hpMax,armorClass:draft.armorClass,physicalSave:draft.physicalSave,evasionSave:draft.evasionSave,mentalSave:draft.mentalSave,hitDice:draft.hitDice,attacksPerMainAction:draft.attacksPerMainAction,attacks:draft.attacks,spells:draft.spells,arts:draft.arts,inventory:draft.inventory,friendly:draft.friendly,notes:draft.notes})
   });
   const data=await response.json() as {npc?:CampaignNpcTemplate;error?:string};
   if(!response.ok||!data.npc)throw new Error(data.error||"Could not save NPC");
   setNpc(data.npc);setEditing(false);setDraft(null);
   notifyCampaignNpcChanged(campaignId,npcId);
  }catch(e){setError(e instanceof Error?e.message:"Could not save NPC");}
  finally{setSaving(false);}
 }
 if(error)return <div className="journal-linked-npc journal-linked-npc-unavailable" role="note">Linked NPC unavailable. {error}</div>;
 if(!npc)return <p role="status">Loading linked NPC…</p>;
 return <section className="journal-linked-npc" aria-label={"NPC stat block: "+npc.name}>
  <header><h4>{npc.name}</h4><small>Linked NPC · Campaign library</small>{canEdit&&!editing&&<button type="button" className="twe-button twe-button-subtle" onClick={()=>{setDraft({...npc,attacks:npc.attacks.map(a=>({...a}))});setEditing(true);}}>Edit NPC</button>}</header>
  {editing&&draft&&<div className="journal-linked-npc-editor">
   <label>Name<input maxLength={80} value={draft.name} onChange={e=>setDraft(old=>old&&({...old,name:e.target.value}))}/></label>
   {([["HP","hpMax"],["AC","armorClass"],["Physical","physicalSave"],["Evasion","evasionSave"],["Mental","mentalSave"]] as const).map(([label,key])=><label key={key}>{label}<input type="number" min={key==="hpMax"?1:0} value={draft[key]} onChange={e=>setDraft(old=>old&&({...old,[key]:Number(e.target.value)}))}/></label>)}
   <label>Notes<textarea value={draft.notes} onChange={e=>setDraft(old=>old&&({...old,notes:e.target.value}))}/></label>
   <div className="twe-workspace-action-row"><button type="button" className="twe-button twe-button-primary" disabled={saving||!draft.name.trim()} onClick={()=>void saveEdits()}>{saving?"Saving…":"Save NPC"}</button><button type="button" className="twe-button" disabled={saving} onClick={()=>{setEditing(false);setDraft(null);}}>Cancel</button></div>
  </div>}
  <dl className="journal-linked-npc-stats">{[["HP",npc.hpMax],["AC",npc.armorClass],["Physical",npc.physicalSave],["Evasion",npc.evasionSave],["Mental",npc.mentalSave],["HD",npc.hitDice],["Attacks / action",npc.attacksPerMainAction]].filter(([,value])=>value!==null).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  {npc.attacks.length>0&&<ul>{npc.attacks.map((attack,i)=><li key={i}><strong>{attack.name}</strong> {attack.attackBonus>=0?"+":""}{attack.attackBonus} · {attack.damage}{attack.shock?" · Shock "+attack.shock:""}{attack.description?" · "+attack.description:""}</li>)}</ul>}
  {npc.spells.length>0&&<div className="journal-linked-npc-spells"><strong>Spells:</strong><ul>{npc.spells.map((spell,i)=>{const full=npcSpellFullDescription(spell.name,spell.level,spell.summary);const brief=spell.summary.length>115?spell.summary.slice(0,112).trimEnd()+"…":spell.summary;return <li key={i}><span className="journal-linked-npc-spell" tabIndex={0} aria-label={spell.name+(full?": "+full:"")}><strong>{spell.name}</strong>{full&&<span className="journal-linked-npc-spell-popover" role="tooltip">{full}</span>}</span>{brief&&<span className="journal-linked-npc-spell-summary"> — {brief}</span>}</li>;})}</ul></div>}
  {npc.arts.length>0&&<p><strong>Arts:</strong> {npc.arts.map(a=>a.name).join(", ")}</p>}
  {npc.friendly&&<p>Friendly / allied</p>}
  {npc.notes&&<p>{npc.notes}</p>}
 </section>;
}
