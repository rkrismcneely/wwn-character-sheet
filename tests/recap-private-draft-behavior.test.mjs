import assert from "node:assert/strict";
import test from "node:test";
import {
  createCampaignSessionRecap, getCampaignSessionRecap, listCampaignSessionRecaps,
  sessionRecapArchive, updateCampaignSessionRecap,
} from "../lib/campaigns/session-recaps.ts";

const campaignId = "cmp_ABCDEFGHIJKLMNOPQRSTUV";
const privateId = "c1b00000-0000-4000-8000-000000000000";
const owner = {userId:"gm",role:"user"};
const player = {userId:"player",role:"user"};
const times = [
  "2026-10-31T03:00:00.000Z",
  "2026-10-31T03:05:00.000Z",
  "2026-10-31T03:10:00.000Z",
  "2026-10-31T03:15:00.000Z",
];

function database() {
  const recaps = new Map();
  const internal = privateId;
  const calls = [];
  function find(id){return recaps.get(id)??null;}
  function row(rec){
    return rec && {id:rec.id,sessionDate:rec.date,title:rec.title,content:rec.content,
      isPublished:rec.isPublished,createdAt:rec.createdAt,updatedAt:rec.updatedAt};
  }
  return {
    recaps,calls,
    prepare(sql){
      return {
        bind(...params){
          return {
            async first(){
              if(sql.includes("FROM campaigns c"))return {id:internal,publicId:campaignId,
                ownerUserId:"gm",archivedAt:null};
              if(sql.includes("FROM campaign_members"))return {
                campaignId:internal,userId:params[1],role:params[1]==="gm"?"gm":"player",
              };
              if(sql.includes("SELECT COUNT(*) AS total FROM campaign_session_recaps")){
                return {total:[...recaps.values()].filter(x=>params[0]===internal&&
                  (!sql.includes("is_published = 1")||x.isPublished===1)).length};
              }
              if(sql.includes("SELECT is_published AS isPublished FROM campaign_session_recaps")){
                const rec=find(params[1]);return rec&&{isPublished:rec.isPublished};
              }
              if(sql.includes("SELECT id FROM campaign_session_recaps"))return find(params[1])?{id:params[1]}:null;
              if(sql.includes("FROM campaign_session_recaps")&&sql.includes("id = ?")){
                const rec=find(params[1]);return rec?row(rec):null;
              }
              throw Error("Unexpected first query: "+sql);
            },
            async all(){
              if(sql.includes("FROM campaign_session_recaps")){
                const items=[...recaps.values()].filter(x=>!sql.includes("is_published = 1")||x.isPublished===1);
                const sorted=items.sort((a,b)=>b.date.localeCompare(a.date));
                const data=sql.includes("LIMIT ? OFFSET ?")
                  ? sorted.slice(params[2],params[2]+params[1]) : sorted;
                return {results:data.map(row)};
              }
              throw Error("Unexpected all query: "+sql);
            },
            async run(){
              calls.push(sql);
              if(sql.includes("INSERT INTO campaign_session_recaps")){
                const [id,cid,date,title,content,isPublished,createdAt,updatedAt]=params;
                assert.equal(cid,internal);
                recaps.set(id,{id,date,title,content,isPublished,createdAt,updatedAt});
                return {meta:{changes:1}};
              }
              if(sql.includes("UPDATE campaign_session_recaps")){
                const [date,title,content,isPublished,updatedAt,id,cid,previous]=params;
                const current=find(id);
                if(cid!==internal||!current||previous!==current.updatedAt)return {meta:{changes:0}};
                Object.assign(current,{date,title,content,isPublished,updatedAt});
                return {meta:{changes:1}};
              }
              if(sql.includes("UPDATE campaign_journal_entries"))return {meta:{changes:0}};
              throw Error("Unexpected run query: "+sql);
            },
          };
        },
      };
    },
  };
}

test("private recording drafts can be reopened, saved, and edited without leaking to players",async()=>{
  const db=database();
  const draft=await createCampaignSessionRecap(db,owner,campaignId,
    {date:"2026-10-30",title:"An unfinished game",draftOnly:true},times[0]);
  assert.equal(draft.isPublished,false);
  assert.equal(draft.content,"");
  assert.equal((await getCampaignSessionRecap(db,owner,campaignId,draft.id)).content,"");
  await assert.rejects(()=>getCampaignSessionRecap(db,player,campaignId,draft.id),
    error=>error.status===404);
  assert.equal((await listCampaignSessionRecaps(db,player,campaignId,1)).total,0);
  assert.equal((await listCampaignSessionRecaps(db,owner,campaignId,1)).total,1);
  assert.equal((await sessionRecapArchive(db,player,campaignId)).latest,null);

  const saved=await updateCampaignSessionRecap(db,owner,campaignId,
    {id:draft.id,date:"2026-10-29",title:"Revised title",content:"## Rough draft",
      updatedAt:draft.updatedAt,publish:false},times[1]);
  assert.equal(saved.isPublished,false);
  assert.equal(saved.content,"## Rough draft");
  assert.equal((await getCampaignSessionRecap(db,owner,campaignId,draft.id)).content,"## Rough draft");
  await assert.rejects(()=>getCampaignSessionRecap(db,player,campaignId,draft.id),
    error=>error.status===404);

  await assert.rejects(()=>updateCampaignSessionRecap(db,owner,campaignId,{
    id:draft.id,date:saved.date,title:saved.title,content:"",
    updatedAt:saved.updatedAt,publish:true,
  },times[2]),error=>error.status===422);

  const published=await updateCampaignSessionRecap(db,owner,campaignId,{
    id:draft.id,date:saved.date,title:saved.title,content:"## Reviewed adventure recap",
    updatedAt:saved.updatedAt,publish:true,
  },times[2]);
  assert.equal(published.isPublished,true);
  assert.equal((await getCampaignSessionRecap(db,player,campaignId,draft.id)).content,
    "## Reviewed adventure recap");
  assert.equal((await sessionRecapArchive(db,player,campaignId)).latest?.id,draft.id);
  await assert.rejects(()=>updateCampaignSessionRecap(db,owner,campaignId,{
    id:draft.id,date:saved.date,title:saved.title,content:"## Keep public",
    updatedAt:published.updatedAt,publish:false,
  },times[3]),error=>error.status===422);
});

test("private blank drafts stay empty when saved, and stale updates cannot overwrite newer edits",async()=>{
  const db=database();
  const created=await createCampaignSessionRecap(db,owner,campaignId,
    {date:"2026-10-30",title:"Game audio",draftOnly:true},times[0]);
  const saved=await updateCampaignSessionRecap(db,owner,campaignId,
    {id:created.id,date:created.date,title:"New title",content:"",
      updatedAt:created.updatedAt,publish:false},times[1]);
  assert.equal(saved.content,"");
  await assert.rejects(()=>updateCampaignSessionRecap(db,owner,campaignId,{
    id:created.id,date:created.date,title:"Stale",content:"## Notes",
    updatedAt:created.updatedAt,publish:false,
  },times[2]),error=>error.status===409);
});
