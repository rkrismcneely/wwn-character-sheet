import type {CampaignItem} from "./items.ts";

export const journalItemManagedStart="<!-- twe-item-managed:start -->";
export const journalItemManagedEnd="<!-- twe-item-managed:end -->";
const validItemId=/^citem_[0-9a-f]{32}$/u;

/** Stable identity prevents duplicate Journal pages even when an item is renamed. */
export function journalItemMarker(itemId:string):string {
 if(!validItemId.test(itemId))throw new Error("Invalid campaign item ID.");
 return "<!-- twe-item:"+itemId+" -->";
}

export function journalItemIcon(item:Pick<CampaignItem,"kind">):string {
 if(item.kind==="magical")return "gem";
 if(item.kind==="armor")return "shield-check";
 if(item.kind==="weapon")return "sword";
 return "package";
}

export function itemJournalManagedSection(item:CampaignItem):string {
 const lines:string[]=[journalItemManagedStart,
   "**Category:** "+(item.kind==="armor"?"Armour":item.kind==="weapon"?"Weapon":
     item.kind==="magical"?"Magical Item":"Mundane Item"),""];
 if(item.description.trim())lines.push(item.description.trim(),"");
 if(item.kind==="weapon"&&item.properties.weapon){
  const p=item.properties.weapon;
  lines.push("## Weapon Properties","",
   "**Damage:** "+p.damage,"",
   "**Shock:** "+p.shock,"",
   "**Range:** "+p.range,"",
   "**Attack:** "+p.skill+" / "+p.attribute,"",
   "**Encumbrance:** "+p.encumbrance,"");
  if(p.traits)lines.push("**Traits:** "+p.traits,"");
 }
 if(item.kind==="armor"&&item.properties.armor){
  const p=item.properties.armor;
  lines.push("## Armour Properties","",
   "**Armour Class:** "+p.armorClass,"",
   "**Encumbrance:** "+p.encumbrance,"",
   "**Shield:** "+(p.shield==="none"?"No":p.shield),"");
  if(p.restrictions)lines.push("**Restrictions:** "+p.restrictions,"");
  if(p.properties)lines.push("**Additional properties:** "+p.properties,"");
 }
 if(item.kind==="magical"&&item.properties.magical){
  const p=item.properties.magical;
  lines.push("## Magical Properties","");
  if(p.bonuses)lines.push("**Bonuses:** "+p.bonuses,"");
  if(p.abilities)lines.push("**Abilities:** "+p.abilities,"");
  if(p.charges!==null&&p.charges!==undefined)lines.push("**Charges:** "+p.charges,"");
  if(p.uses)lines.push("**Use guidance:** "+p.uses,"");
  if(p.rulesText)lines.push("**Rules:** "+p.rulesText,"");
 }
 lines.push(journalItemManagedEnd);
 return lines.join("\n");
}

/** Generated data can refresh while GM-authored Journal prose stays untouched. */
export function updatedItemJournalContent(content:string,item:CampaignItem):string {
 if(!content.includes(journalItemMarker(item.id)))return content;
 const start=content.indexOf(journalItemManagedStart);
 const end=content.indexOf(journalItemManagedEnd,start+journalItemManagedStart.length);
 if(start<0||end<0)return content;
 return content.slice(0,start)+itemJournalManagedSection(item)+
   content.slice(end+journalItemManagedEnd.length);
}

export function newItemJournalContent(item:CampaignItem):string {
 return journalItemMarker(item.id)+"\n\n"+itemJournalManagedSection(item)+"\n";
}
