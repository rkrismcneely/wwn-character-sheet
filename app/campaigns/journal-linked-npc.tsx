"use client";
import {useEffect,useState} from "react";
import type {CampaignNpcTemplate} from "@/lib/campaigns/npcs";
export function JournalLinkedNpc({campaignId,npcId}:{campaignId:string;npcId:string}){
 const [npc,setNpc]=useState<CampaignNpcTemplate|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{
  const controller=new AbortController();
  const load=async()=>{
   try{
    const res=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/npcs/"+encodeURIComponent(npcId),{cache:"no-store",signal:controller.signal});
    const data=await res.json() as {npc?:CampaignNpcTemplate;error?:string};
    if(!res.ok||!data.npc)throw new Error(data.error||"NPC unavailable");
    if(!controller.signal.aborted){setNpc(data.npc);setError("");}
   }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"NPC unavailable");}
  };
  void load();const reload=()=>{void load();};
  window.addEventListener("focus",reload);
  return()=>{controller.abort();window.removeEventListener("focus",reload);};
 },[campaignId,npcId]);
 if(error)return <div className="journal-linked-npc journal-linked-npc-unavailable" role="note">Linked NPC unavailable. {error}</div>;
 if(!npc)return <p role="status">Loading linked NPC…</p>;
 return <section className="journal-linked-npc" aria-label={"NPC stat block: "+npc.name}>
  <header><h4>{npc.name}</h4><small>Linked NPC · Campaign library</small></header>
  <dl className="journal-linked-npc-stats">{[["HP",npc.hpMax],["AC",npc.armorClass],["Physical",npc.physicalSave],["Evasion",npc.evasionSave],["Mental",npc.mentalSave],["HD",npc.hitDice],["Attacks / action",npc.attacksPerMainAction]].filter(([,value])=>value!==null).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  {npc.attacks.length>0&&<ul>{npc.attacks.map((attack,i)=><li key={i}><strong>{attack.name}</strong> {attack.attackBonus>=0?"+":""}{attack.attackBonus} · {attack.damage}{attack.shock?" · Shock "+attack.shock:""}{attack.description?" · "+attack.description:""}</li>)}</ul>}
  {npc.spells.length>0&&<p><strong>Spells:</strong> {npc.spells.map(s=>s.name).join(", ")}</p>}
  {npc.arts.length>0&&<p><strong>Arts:</strong> {npc.arts.map(a=>a.name).join(", ")}</p>}
  {npc.friendly&&<p>Friendly / allied</p>}
  {npc.notes&&<p>{npc.notes}</p>}
 </section>;
}
