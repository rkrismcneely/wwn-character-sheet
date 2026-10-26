import {canViewCampaign,canManageCampaignContent} from "./authorization.ts";
import {CampaignServiceError,loadCampaignAccess,requireActiveCampaign} from "./service.ts";
import type {CampaignActor} from "./types.ts";
async function ready(db:D1Database){await db.prepare("CREATE TABLE IF NOT EXISTS campaign_game_days (campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE cascade,session_date text NOT NULL,created_by text NOT NULL REFERENCES user(id),created_at text NOT NULL,PRIMARY KEY(campaign_id,session_date))").run();}
function validDate(value:unknown){if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+"T00:00:00Z"))||new Date(value+"T00:00:00Z").toISOString().slice(0,10)!==value)throw new CampaignServiceError("Invalid game date.",422);return value;}
export async function readCampaignGameDays(db:D1Database,actor:CampaignActor|null,id:string,month:string){
 if(!actor)throw new CampaignServiceError("Sign in required.",401);
 const {campaign,membership}=await loadCampaignAccess(db,actor,id);
 if(!canViewCampaign(actor,campaign,membership))throw new CampaignServiceError("Campaign unavailable.",403);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new CampaignServiceError("Invalid month.",422);
 await ready(db);
 const start=month+"-01",end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)).toISOString().slice(0,10);
 const rows=await db.prepare("SELECT session_date AS date FROM campaign_game_days WHERE campaign_id=? AND session_date>=? AND session_date<? ORDER BY session_date").bind(campaign.id,start,end).all<{date:string}>();
 return {dates:rows.results.map(row=>row.date)};
}
export async function setCampaignGameDay(db:D1Database,actor:CampaignActor|null,id:string,date:unknown,gameDay:unknown){
 if(!actor)throw new CampaignServiceError("Sign in required.",401);
 const {campaign,membership}=await loadCampaignAccess(db,actor,id);
 requireActiveCampaign(campaign);
 if(!canManageCampaignContent(actor,campaign,membership))throw new CampaignServiceError("GM access required.",403);
 const day=validDate(date);
 if(typeof gameDay!=="boolean")throw new CampaignServiceError("Invalid game day status.",422);
 await ready(db);
 if(gameDay)await db.prepare("INSERT OR IGNORE INTO campaign_game_days(campaign_id,session_date,created_by,created_at) VALUES(?,?,?,?)").bind(campaign.id,day,actor.userId,new Date().toISOString()).run();
 else await db.prepare("DELETE FROM campaign_game_days WHERE campaign_id=? AND session_date=?").bind(campaign.id,day).run();
 return {date:day,gameDay};
}
