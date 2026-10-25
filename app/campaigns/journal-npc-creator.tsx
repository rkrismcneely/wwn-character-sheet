"use client";
import { useState } from "react";
type Attack={name:string;attackBonus:number;damage:string;shock:string;description:string};
type CreatedNpc={id:string;name:string;hpMax:number;armorClass:number;physicalSave:number;evasionSave:number;mentalSave:number;hitDice:number|null;attacksPerMainAction:number|null;attacks:Attack[];notes:string;friendly:boolean};
export function JournalNpcCreator({campaignId,onInserted,onCancel}:{campaignId:string;onInserted:(markdown:string)=>void;onCancel:()=>void}){
 const [name,setName]=useState("");
 const [hp,setHp]=useState(1),[ac,setAc]=useState(10),[physical,setPhysical]=useState(15),[evasion,setEvasion]=useState(15),[mental,setMental]=useState(15);
 const [hd,setHd]=useState(""),[perAction,setPerAction]=useState("");
 const [attacks,setAttacks]=useState<Attack[]>([]),[notes,setNotes]=useState(""),[friendly,setFriendly]=useState(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState("");
 const updateAttack=(i:number,patch:Partial<Attack>)=>setAttacks(old=>old.map((attack,n)=>n===i?{...attack,...patch}:attack));
 async function save(){
  if(saving)return;
  setSaving(true);setError("");
  try{
   const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/npcs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    name,hpMax:hp,armorClass:ac,physicalSave:physical,evasionSave:evasion,mentalSave:mental,
    hitDice:hd?Number(hd):null,attacksPerMainAction:perAction?Number(perAction):null,
    attacks,notes,friendly,spells:[],arts:[],inventory:[]
   })});
   const data=await response.json() as {error?:string;npc?:CreatedNpc};
   if(!response.ok||!data.npc)throw new Error(data.error||"Could not save NPC.");
   const npc=data.npc;
   const safe=(value:string)=>value.replace(/[\r\n|]/gu," ").trim();
   const block=[
    "### "+npc.name.replace(/[\r\n]/gu," "),
    "<!-- twe-npc:"+npc.id+" -->",
    "**NPC stat block · Saved in campaign NPC library**",
    "",
    "| HP | AC | Physical save | Evasion save | Mental save |",
    "| --- | --- | --- | --- | --- |",
    "| "+[npc.hpMax,npc.armorClass,npc.physicalSave,npc.evasionSave,npc.mentalSave].join(" | ")+" |",
    npc.hitDice!=null?"**Hit Dice:** "+npc.hitDice+(npc.attacksPerMainAction!=null?" · **Attacks/Main Action:** "+npc.attacksPerMainAction:""):"",
    npc.friendly?"**Disposition:** Friendly / allied":"",
    ...npc.attacks.map(a=>"- **"+safe(a.name)+"** "+(a.attackBonus>=0?"+":"")+a.attackBonus+" · "+safe(a.damage)+(a.shock?" · Shock "+safe(a.shock):"")+(a.description?" · "+safe(a.description):"")),
    npc.notes?npc.notes:"",
   ].filter(Boolean).join("\n");
   onInserted(block);
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not save NPC.");}
  finally{setSaving(false);}
 }
 return <section className="journal-npc-creator" role="dialog" aria-modal="false" aria-label="Add NPC stat block">
  <div className="journal-npc-creator-heading"><h3>Create encounter-ready NPC</h3><button type="button" onClick={onCancel} disabled={saving}>Close</button></div>
  <p>Creates an NPC in the campaign library and inserts its stat block into this page. Save the Journal page to keep the inline block.</p>
  <div className="journal-npc-fields">
   <label>Name<input autoFocus required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
   {([["Max HP",hp,setHp,1],["Armor Class",ac,setAc,0],["Physical Save",physical,setPhysical,0],["Evasion Save",evasion,setEvasion,0],["Mental Save",mental,setMental,0]] as const).map(([label,value,set,min])=><label key={label}>{label}<input type="number" required min={min} max={1000} value={value} onChange={e=>set(Number(e.target.value))}/></label>)}
   <label>Hit Dice (optional)<input type="number" min={1} max={1000} value={hd} onChange={e=>setHd(e.target.value)}/></label>
   <label>Attacks/Main Action (optional)<input type="number" min={1} max={100} value={perAction} onChange={e=>setPerAction(e.target.value)}/></label>
  </div>
  <label className="journal-npc-friendly"><input type="checkbox" checked={friendly} onChange={e=>setFriendly(e.target.checked)}/> Friendly / allied</label>
  <div className="journal-npc-attacks"><div className="journal-npc-creator-heading"><h4>Attacks</h4><button type="button" disabled={attacks.length>=8} onClick={()=>setAttacks(old=>[...old,{name:"",attackBonus:0,damage:"",shock:"",description:""}])}>+ Add attack</button></div>
   {attacks.map((attack,i)=><div className="journal-npc-attack" key={i}>
    <label>Name<input required value={attack.name} maxLength={80} onChange={e=>updateAttack(i,{name:e.target.value})}/></label>
    <label>Bonus<input type="number" min={-1000} max={1000} value={attack.attackBonus} onChange={e=>updateAttack(i,{attackBonus:Number(e.target.value)})}/></label>
    <label>Damage<input required placeholder="1d8+2" maxLength={80} value={attack.damage} onChange={e=>updateAttack(i,{damage:e.target.value})}/></label>
    <label>Shock<input maxLength={80} value={attack.shock} onChange={e=>updateAttack(i,{shock:e.target.value})}/></label>
    <label>Description<input maxLength={240} value={attack.description} onChange={e=>updateAttack(i,{description:e.target.value})}/></label>
    <button type="button" onClick={()=>setAttacks(old=>old.filter((_,n)=>n!==i))}>Remove</button>
   </div>)}
  </div>
  <label>Notes<textarea maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></label>
  {error&&<p role="alert" className="twe-workspace-alert">{error}</p>}
  <div className="twe-workspace-action-row"><button type="button" className="twe-button twe-button-primary" disabled={saving||!name.trim()||attacks.some(a=>!a.name.trim()||!a.damage.trim())} onClick={()=>void save()}>{saving?"Saving NPC…":"Save NPC and insert stat block"}</button><button type="button" className="twe-button" onClick={onCancel} disabled={saving}>Cancel</button></div>
 </section>;
}
