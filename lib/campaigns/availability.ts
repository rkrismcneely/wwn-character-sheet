import { canViewCampaign, canManageCampaignContent } from "./authorization.ts";
import { CampaignServiceError, loadCampaignAccess, requireActiveCampaign } from "./service.ts";
import type { CampaignActor } from "./types.ts";

export type AvailabilityStatus="yes"|"maybe"|"no";
let schemaReady:Promise<void>|null=null;
async function ensureAvailabilityTable(db:D1Database){
 if(!schemaReady){
  schemaReady=(async()=>{
   await db.prepare("CREATE TABLE IF NOT EXISTS campaign_availability (campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE cascade,user_id text NOT NULL REFERENCES user(id) ON DELETE cascade,session_date text NOT NULL,status text NOT NULL CHECK(status IN ('yes','maybe','no')),updated_at text NOT NULL,PRIMARY KEY(campaign_id,user_id,session_date))").run();
   await db.prepare("CREATE INDEX IF NOT EXISTS campaign_availability_by_date_idx ON campaign_availability(campaign_id,session_date)").run();
  })().catch(error=>{schemaReady=null;throw error;});
 }
 await schemaReady;
}

export async function readCampaignAvailability(db:D1Database,actor:CampaignActor|null,campaignId:string,month:string){
 if(!actor)throw new CampaignServiceError("Sign in required.",401);
 const {campaign,membership}=await loadCampaignAccess(db,actor,campaignId);
 if(!canViewCampaign(actor,campaign,membership))throw new CampaignServiceError("Campaign unavailable.",403);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new CampaignServiceError("Invalid month.",422);
 await ensureAvailabilityTable(db);
 const gm=canManageCampaignContent(actor,campaign,membership);
 const start=month+"-01",end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)).toISOString().slice(0,10);
 const mine=await db.prepare("SELECT session_date AS date,status FROM campaign_availability WHERE campaign_id=? AND user_id=? AND session_date>=? AND session_date<?").bind(campaign.id,actor.userId,start,end).all<{date:string;status:AvailabilityStatus}>();
 if(!gm)return {mine:mine.results,gm:false};
 const records=await db.prepare("SELECT a.session_date AS date,a.user_id AS userId,a.status,COALESCE(u.name,'Player') AS name FROM campaign_availability a LEFT JOIN user u ON u.id=a.user_id WHERE a.campaign_id=? AND a.session_date>=? AND a.session_date<? ORDER BY a.session_date,u.name").bind(campaign.id,start,end).all<{date:string;userId:string;status:AvailabilityStatus;name:string}>();
 const roster=await db.prepare("SELECT u.id AS userId,COALESCE(u.name,'Player') AS name FROM user u WHERE u.id IN (SELECT user_id FROM campaign_members WHERE campaign_id=? UNION SELECT owner_user_id FROM campaigns WHERE id=?) ORDER BY u.name").bind(campaign.id,campaign.id).all<{userId:string;name:string}>();
 return {mine:mine.results,gm:true,records:records.results,members:roster.results,memberCount:roster.results.length};
}
export async function setCampaignAvailability(db:D1Database,actor:CampaignActor|null,campaignId:string,date:string,status:AvailabilityStatus|null){
 if(!actor)throw new CampaignServiceError("Sign in required.",401);
 const {campaign,membership}=await loadCampaignAccess(db,actor,campaignId);
 requireActiveCampaign(campaign);
 if(!canViewCampaign(actor,campaign,membership))throw new CampaignServiceError("Campaign unavailable.",403);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z"))||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)throw new CampaignServiceError("Invalid date.",422);
 if(status!==null&&!["yes","maybe","no"].includes(status))throw new CampaignServiceError("Invalid availability.",422);
 await ensureAvailabilityTable(db);
 if(status===null)await db.prepare("DELETE FROM campaign_availability WHERE campaign_id=? AND user_id=? AND session_date=?").bind(campaign.id,actor.userId,date).run();
 else await db.prepare("INSERT INTO campaign_availability(campaign_id,user_id,session_date,status,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(campaign_id,user_id,session_date) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at").bind(campaign.id,actor.userId,date,status,new Date().toISOString()).run();
 return {date,status};
}
