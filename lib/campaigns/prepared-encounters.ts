import { canManageCampaignRuntime } from "./authorization.ts";
import { CampaignServiceError, loadCampaignAccess, requireActiveCampaign } from "./service.ts";
import type { CampaignActor } from "./types.ts";

export type PreparedEncounterEntry =
 | { kind: "saved"; npcId: string; quantity: number }
 | { kind: "bestiary"; bestiaryId: string; quantity: number };
export type PreparedEncounter = { id: string; name: string; entries: PreparedEncounterEntry[]; createdAt: string; updatedAt: string };
type Row={id:string;name:string;entriesJson:string;createdAt:string;updatedAt:string};

export function normalizePreparedEntries(value:unknown):PreparedEncounterEntry[]{
 if(!Array.isArray(value)||value.length>30)throw new CampaignServiceError("Encounter creatures are invalid.",422);
 return value.map((candidate:unknown)=>{
  if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))throw new CampaignServiceError("Encounter creature is invalid.",422);
  const v=candidate as Record<string,unknown>;
  if(!Number.isInteger(v.quantity)||(v.quantity as number)<1||(v.quantity as number)>30)throw new CampaignServiceError("Creature quantity must be 1–30.",422);
  const quantity=v.quantity as number;
  if(v.kind==="saved"&&typeof v.npcId==="string"&&/^cnpc_[a-f0-9]{32}$/u.test(v.npcId))return {kind:"saved",npcId:v.npcId,quantity};
  if(v.kind==="bestiary"&&typeof v.bestiaryId==="string"&&v.bestiaryId.length>0&&v.bestiaryId.length<=100)return {kind:"bestiary",bestiaryId:v.bestiaryId,quantity};
  throw new CampaignServiceError("Encounter creature is invalid.",422);
 });
}
function rowToPlan(row:Row):PreparedEncounter{return {id:row.id,name:row.name,entries:normalizePreparedEntries(JSON.parse(row.entriesJson) as unknown),createdAt:row.createdAt,updatedAt:row.updatedAt};}
async function access(db:D1Database,actor:CampaignActor,publicId:string,mutation=false){
 const {campaign}=await loadCampaignAccess(db,actor,publicId);
 if(!canManageCampaignRuntime(actor,campaign))throw new CampaignServiceError("Only the campaign owner or a site admin can manage prepared encounters.",403);
 if(mutation)requireActiveCampaign(campaign);
 return campaign;
}
export async function listPreparedEncounters(db:D1Database,actor:CampaignActor,publicId:string){
 const campaign=await access(db,actor,publicId);
 const rows=await db.prepare("SELECT id,name,entries_json AS entriesJson,created_at AS createdAt,updated_at AS updatedAt FROM campaign_prepared_encounters WHERE campaign_id=? ORDER BY updated_at DESC LIMIT 100").bind(campaign.id).all<Row>();
 return rows.results.map(rowToPlan);
}
export async function getPreparedEncounter(db:D1Database,actor:CampaignActor,publicId:string,id:string){
 const campaign=await access(db,actor,publicId);
 const row=await db.prepare("SELECT id,name,entries_json AS entriesJson,created_at AS createdAt,updated_at AS updatedAt FROM campaign_prepared_encounters WHERE campaign_id=? AND id=?").bind(campaign.id,id).first<Row>();
 if(!row)throw new CampaignServiceError("Prepared encounter not found.",404);
 return rowToPlan(row);
}
export async function savePreparedEncounter(db:D1Database,actor:CampaignActor,publicId:string,input:{id?:unknown;name?:unknown;entries?:unknown}){
 const campaign=await access(db,actor,publicId,true);
 const name=typeof input.name==="string"?input.name.trim():"";
 if(!name||name.length>80||/[\u0000-\u001f\u007f]/u.test(name))throw new CampaignServiceError("Encounter name is invalid.",422);
 const entries=normalizePreparedEntries(input.entries);
 if(entries.reduce((total,item)=>total+item.quantity,0)>100)throw new CampaignServiceError("Encounter cannot contain more than 100 creatures.",422);
 const id=typeof input.id==="string"?input.id:"";
 const now=new Date().toISOString();
 if(id){
  if(!/^cenc_[a-f0-9]{32}$/u.test(id))throw new CampaignServiceError("Encounter ID is invalid.",422);
  const result=await db.prepare("UPDATE campaign_prepared_encounters SET name=?,entries_json=?,updated_at=? WHERE campaign_id=? AND id=?").bind(name,JSON.stringify(entries),now,campaign.id,id).run();
  if(result.meta.changes!==1)throw new CampaignServiceError("Prepared encounter not found.",404);
  return getPreparedEncounter(db,actor,publicId,id);
 }
 const newId="cenc_"+crypto.randomUUID().replaceAll("-","");
 await db.prepare("INSERT INTO campaign_prepared_encounters (id,campaign_id,name,entries_json,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(newId,campaign.id,name,JSON.stringify(entries),now,now).run();
 return getPreparedEncounter(db,actor,publicId,newId);
}
export async function deletePreparedEncounter(db:D1Database,actor:CampaignActor,publicId:string,id:string){
 const campaign=await access(db,actor,publicId,true);
 const result=await db.prepare("DELETE FROM campaign_prepared_encounters WHERE campaign_id=? AND id=?").bind(campaign.id,id).run();
 if(result.meta.changes!==1)throw new CampaignServiceError("Prepared encounter not found.",404);
}
