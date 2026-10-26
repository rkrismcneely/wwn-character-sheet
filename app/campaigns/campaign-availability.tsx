"use client";
import {useEffect,useState} from "react";
import "./campaign-availability.css";

type Status="yes"|"maybe"|"no";
type Entry={date:string;status:Status};
type RecordEntry=Entry&{userId:string;name:string};
type Member={userId:string;name:string};
const states:(Status|null)[]=[null,"yes","maybe","no"];
function monthKey(date:Date){return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0");}
export function CampaignAvailability({campaignId}:{campaignId:string}){
 const [month,setMonth]=useState(()=>monthKey(new Date()));
 const [mine,setMine]=useState<Record<string,Status>>({});
 const [records,setRecords]=useState<RecordEntry[]>([]);
 const [gm,setGm]=useState(false);
 const [memberCount,setMemberCount]=useState(0);
 const [members,setMembers]=useState<Member[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [gmOpen,setGmOpen]=useState(false);
 const [gameDays,setGameDays]=useState<string[]>([]);
 const [markGameDay,setMarkGameDay]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/game-days?month="+month,{cache:"no-store",signal:controller.signal}).then(r=>r.json()).then((value:unknown)=>{const v=value as {dates?:string[]};if(!controller.signal.aborted)setGameDays(v.dates||[]);}).catch(()=>{});
  void (async()=>{setLoading(true);setError("");
   try{
    const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/availability?month="+month,{cache:"no-store",signal:controller.signal});
    const data=await response.json() as {mine?:Entry[];records?:RecordEntry[];gm?:boolean;memberCount?:number;members?:Member[];error?:string};
    if(!response.ok)throw new Error(data.error||"Availability unavailable.");
    if(!controller.signal.aborted){setMine(Object.fromEntries((data.mine||[]).map(v=>[v.date,v.status])));setRecords(data.records||[]);setGm(Boolean(data.gm));setMemberCount(data.memberCount||0);setMembers(data.members||[]);}
   }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Availability unavailable.");}
   finally{if(!controller.signal.aborted)setLoading(false);}
  })();
  return()=>controller.abort();
 },[campaignId,month]);
 const year=Number(month.slice(0,4)),m=Number(month.slice(5,7))-1;
 const first=new Date(year,m,1),days=new Date(year,m+1,0).getDate();
 const offset=(first.getDay()+6)%7;
 const dates=Array.from({length:Math.ceil((offset+days)/7)*7},(_,i)=>{const d=i-offset+1;return d>0&&d<=days?month+"-"+String(d).padStart(2,"0"):null;});
 async function toggle(date:string){
  if(saving)return;
  const current=mine[date]??null,next=states[(states.indexOf(current)+1)%states.length];
  setSaving(date);setMine(old=>{const result={...old};if(next)result[date]=next;else delete result[date];return result;});setError("");
  try{
   const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/availability",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({date,status:next})});
   const data=await response.json() as {error?:string};
   if(!response.ok)throw new Error(data.error||"Could not save availability.");
   // The GM view uses the shared server data and refreshes when the panel is reopened.
   if(gm){const refresh=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/availability?month="+month,{cache:"no-store"});if(refresh.ok){const updated=await refresh.json() as {records?:RecordEntry[]};setRecords(updated.records||[]);}}
  }catch(cause){setMine(old=>{const result={...old};if(current)result[date]=current;else delete result[date];return result;});setError(cause instanceof Error?cause.message:"Could not save availability.");}
  finally{setSaving(null);}
 }
 async function toggleGameDay(date:string){
  const next=!gameDays.includes(date);
  setSaving(date);setError("");
  try{
   const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/game-days",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({date,gameDay:next})});
   if(!response.ok){const data=await response.json() as {error?:string};throw new Error(data.error||"Could not save game day.");}
   setGameDays(old=>next?[...old,date]:old.filter(v=>v!==date));
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not save game day.");}
  finally{setSaving(null);}
 }
 function shift(n:number){const next=new Date(year,m+n,1);setMonth(monthKey(next));}
 const totals=dates.filter((date):date is string=>Boolean(date)).map(date=>{const respondents=records.filter(e=>e.date===date);return {date,yes:respondents.filter(v=>v.status==="yes").length,maybe:respondents.filter(v=>v.status==="maybe").length,no:respondents.filter(v=>v.status==="no").length,respondents};});
 const best=totals.filter(v=>v.yes>0||v.maybe>0).sort((a,b)=>b.yes-a.yes||a.no-b.no||b.maybe-a.maybe||a.date.localeCompare(b.date));
 return <section className="campaign-availability" aria-label="Availability">
  <div className="campaign-availability-heading"><h2>Availability</h2><div className="campaign-availability-month"><button type="button" onClick={()=>shift(-1)} aria-label="Previous month">‹</button><strong>{first.toLocaleString(undefined,{month:"short",year:"numeric"})}</strong><button type="button" onClick={()=>shift(1)} aria-label="Next month">›</button></div>{gm&&<button type="button" className="campaign-availability-group-toggle" aria-pressed={markGameDay} onClick={()=>setMarkGameDay(v=>!v)}>{markGameDay?"Done":"Set game day"}</button>}{gm&&<button type="button" className="campaign-availability-group-toggle" aria-expanded={gmOpen} onClick={()=>setGmOpen(v=>!v)}>Group</button>}</div>
  <div className="campaign-availability-grid">{["M","T","W","T","F","S","S"].map((d,i)=><span key={i} className="campaign-availability-weekday">{d}</span>)}{dates.map((date,i)=>date?<button type="button" key={date} className={"campaign-availability-day "+(mine[date]||"unset")+(gameDays.includes(date)?" is-game-day":"")} title={date+(gameDays.includes(date)?" — GAME DAY":"")+": "+(mine[date]||"not answered")+(markGameDay?" (click to toggle Game day)":"")} disabled={Boolean(saving)||loading} onClick={()=>void (gm&&markGameDay?toggleGameDay(date):toggle(date))} aria-label={date+(gameDays.includes(date)?" Game day":"")+" "+(mine[date]||"not answered")}>{mine[date]==="yes"?"✓":mine[date]==="maybe"?"⚠":mine[date]==="no"?"✕":Number(date.slice(-2))}{gameDays.includes(date)&&<span className="campaign-availability-game-day-label" aria-hidden="true">GAME</span>}</button>:<span key={"blank"+i}/>)}</div>
  {error&&<p className="campaign-error" role="alert">{error}</p>}
  {gm&&gmOpen&&<div className="campaign-availability-gm" role="region" aria-label="Group availability"><div className="campaign-availability-group-head"><h3>Group Availability</h3><button type="button" onClick={()=>setGmOpen(false)} aria-label="Close group availability">✕</button></div><p className="campaign-availability-legend">✓ Available · ⚠ Maybe · ✕ Unavailable</p>{!best.length?<p>No availability responses yet.</p>:<ol>{best.map(item=><li key={item.date}><strong>{item.date}</strong>{memberCount>0&&item.yes===memberCount?" — Everyone available":""} — {item.yes} available · {item.maybe} maybe · {item.no} unavailable <small>({item.respondents.length} responses{memberCount?" / "+memberCount+" participants":""})</small><details><summary>Player responses</summary>{members.map(member=>{const response=item.respondents.find(person=>person.userId===member.userId);return <p key={member.userId}>{member.name}: {response?.status==="yes"?"Available":response?.status==="maybe"?"Maybe":response?.status==="no"?"Unavailable":"No response"}</p>;})}</details></li>)}</ol>}</div>}
 </section>;
}
