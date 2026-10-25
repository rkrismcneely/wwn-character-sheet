"use client";
import { useState } from "react";
import {builtInBestiaryCreatures,builtInBestiaryCreatureDraft} from "@/lib/campaigns/bestiary";
import {npcMagicCatalog} from "@/lib/campaigns/npc-magic-catalog";
const spellChoices=npcMagicCatalog("spells");
const artChoices=npcMagicCatalog("arts");
type Attack={name:string;attackBonus:number;damage:string;shock:string;description:string};
type CreatedNpc={id:string;name:string;hpMax:number;armorClass:number;physicalSave:number;evasionSave:number;mentalSave:number;hitDice:number|null;attacksPerMainAction:number|null;attacks:Attack[];notes:string;friendly:boolean};
export function JournalNpcCreator({campaignId,onInserted,onCancel}:{campaignId:string;onInserted:(markdown:string)=>void;onCancel:()=>void}){
 const [name,setName]=useState("");
 const [hp,setHp]=useState(1),[ac,setAc]=useState(10),[physical,setPhysical]=useState(15),[evasion,setEvasion]=useState(15),[mental,setMental]=useState(15);
 const [hd,setHd]=useState(""),[perAction,setPerAction]=useState("");
 const [attacks,setAttacks]=useState<Attack[]>([]),[notes,setNotes]=useState(""),[friendly,setFriendly]=useState(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState("");
 const [spells,setSpells]=useState<{name:string;summary:string;level?:number}[]>([]),[arts,setArts]=useState<{name:string;summary:string}[]>([]);
 const updateAttack=(i:number,patch:Partial<Attack>)=>setAttacks(old=>old.map((attack,n)=>n===i?{...attack,...patch}:attack));
 async function save(){
  if(saving)return;
  setSaving(true);setError("");
  try{
   const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/npcs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    name,hpMax:hp,armorClass:ac,physicalSave:physical,evasionSave:evasion,mentalSave:mental,
    hitDice:hd?Number(hd):null,attacksPerMainAction:perAction?Number(perAction):null,
    attacks,notes,friendly,spells,arts,inventory:[]
   })});
   const data=await response.json() as {error?:string;npc?:CreatedNpc};
   if(!response.ok||!data.npc)throw new Error(data.error||"Could not save NPC.");
   const npc=data.npc;
   const block="{{twe-npc:"+npc.id+"}}";
   onInserted(block);
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not save NPC.");}
  finally{setSaving(false);}
 }
 return <section className="journal-npc-creator" role="dialog" aria-modal="false" aria-label="Add NPC stat block">
  <div className="journal-npc-creator-heading"><h3>Create encounter-ready NPC</h3><button type="button" onClick={onCancel} disabled={saving}>Close</button></div>
  <p>Creates an NPC in the campaign library and inserts its stat block into this page. Save the Journal page to keep the inline block.</p>
  <label>Start from Bestiary archetype<select aria-label="Bestiary archetype" defaultValue="" onChange={event=>{
   const creature=builtInBestiaryCreatures.find(item=>item.id===event.target.value);
   if(!creature)return;
   const draft=builtInBestiaryCreatureDraft(creature.id);
   if(!draft)return;
   setName(String(draft.name??creature.name));setHp(Number(draft.hpMax??creature.hpMax));setAc(Number(draft.armorClass??creature.armorClass));
   setPhysical(Number(draft.physicalSave??creature.physicalSave));setEvasion(Number(draft.evasionSave??creature.evasionSave));setMental(Number(draft.mentalSave??creature.mentalSave));
   setHd(String(creature.sourceStats.hitDice));setPerAction(String(creature.sourceStats.attacksPerMainAction));
   setAttacks((draft.attacks as Attack[]).map(attack=>({...attack,shock:attack.shock??""})));
   setNotes(String(draft.notes??""));setFriendly(false);
   setSpells(((draft.spells??[]) as {name:string;summary:string;level?:number}[]).map(item=>({...item})));
   setArts(((draft.arts??[]) as {name:string;summary:string}[]).map(item=>({...item})));
  }}><option value="">Custom / choose archetype…</option>{builtInBestiaryCreatures.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(creature=><option key={creature.id} value={creature.id}>{creature.name}</option>)}</select></label>
  <div className="journal-npc-fields">
   <label>Name<input autoFocus required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
   {([["Max HP",hp,setHp,1],["Armor Class",ac,setAc,0],["Physical Save",physical,setPhysical,0],["Evasion Save",evasion,setEvasion,0],["Mental Save",mental,setMental,0]] as const).map(([label,value,set,min])=><label key={label}>{label}<input type="number" required min={min} max={label==="Max HP"?100000:1000} value={value} onChange={e=>set(Number(e.target.value))}/></label>)}
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
  {([{label:"Spells",entries:spells,change:setSpells,choices:spellChoices},{label:"Arts",entries:arts,change:setArts,choices:artChoices}] as {label:string;entries:{name:string;summary:string;level?:number}[];change:typeof setSpells;choices:ReturnType<typeof npcMagicCatalog>}[]).map(({label,entries,change,choices})=><fieldset key={label} className="journal-npc-magic"><legend>{label}</legend>
    {entries.map((item,i)=><div className="journal-npc-magic-item" key={i}><select aria-label={label+" "+(i+1)+" catalog choice"} value={choices.find(option=>option.name===item.name&&option.summary===item.summary&&option.level===item.level)?.key??"custom"} onChange={e=>{const chosen=choices.find(option=>option.key===e.target.value);if(chosen)change(old=>old.map((entry,j)=>j===i?{name:chosen.name,summary:chosen.summary,...(chosen.level===undefined?{}:{level:chosen.level})}:entry));}}><option value="custom">Custom entry…</option>{choices.map(option=><option key={option.key} value={option.key}>{option.name}{option.level!==undefined?" · Level "+option.level:""}</option>)}</select><input aria-label={label+" "+(i+1)+" name"} value={item.name} maxLength={100} onChange={e=>change(old=>old.map((entry,j)=>j===i?{...entry,name:e.target.value}:entry))}/><input aria-label={label+" "+(i+1)+" summary"} value={item.summary} maxLength={500} onChange={e=>change(old=>old.map((entry,j)=>j===i?{...entry,summary:e.target.value}:entry))}/><button type="button" onClick={()=>change(old=>old.filter((_,j)=>j!==i))}>Remove</button></div>)}
    <button type="button" disabled={entries.length>=24} onClick={()=>change(old=>[...old,{name:"",summary:""}])}>+ Add {label==="Spells"?"spell":"art"}</button>
   </fieldset>)}
  <label>Notes<textarea maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></label>
  {error&&<p role="alert" className="twe-workspace-alert">{error}</p>}
  <div className="twe-workspace-action-row"><button type="button" className="twe-button twe-button-primary" disabled={saving||!name.trim()||attacks.some(a=>!a.name.trim()||!a.damage.trim())} onClick={()=>void save()}>{saving?"Saving NPC…":"Save NPC and insert stat block"}</button><button type="button" className="twe-button" onClick={onCancel} disabled={saving}>Cancel</button></div>
 </section>;
}
