import {traditionInfo,traditionSpells} from "@/app/class-data";
import {bestiaryNpcMagicOptions,type BestiaryNpcMagicOption} from "./bestiary";

/** Complete game spell/Art choices, with Bestiary-specific powers preserved. */
export function npcMagicCatalog(kind:"spells"|"arts"):readonly BestiaryNpcMagicOption[]{
 const choices:BestiaryNpcMagicOption[]=[...bestiaryNpcMagicOptions(kind)];
 const seen=new Set(choices.map(item=>[item.name,item.level??"",item.summary].join("\u0001")));
 const add=(name:string,summary:string,source:string,level?:number)=>{
  if(!name.trim())return;
  const safeSummary=summary.slice(0,500);
  const key=[name,level??"",safeSummary].join("\u0001");
  if(seen.has(key))return;
  seen.add(key);
  choices.push({key:"game:"+source+":"+choices.length,name,summary:safeSummary,...(level===undefined?{}:{level})});
 };
 if(kind==="spells"){
  for(const [tradition,spells] of Object.entries(traditionSpells)){
   for(const spell of spells)add(spell.name,spell.text,tradition,spell.level);
  }
 }else{
  for(const [tradition,data] of Object.entries(traditionInfo)){
   for(const art of data.arts)add(art.name,art.text,tradition);
  }
 }
 return choices.sort((a,b)=>kind==="spells"
  ? (a.level??Number.MAX_SAFE_INTEGER)-(b.level??Number.MAX_SAFE_INTEGER)||a.name.localeCompare(b.name)
  : a.name.localeCompare(b.name));
}
