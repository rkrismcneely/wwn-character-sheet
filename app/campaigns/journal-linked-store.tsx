"use client";

import { useEffect, useState } from "react";
import type { CampaignStore } from "@/lib/campaigns/stores";
import { JournalLinkedNpc } from "./journal-linked-npc";

export function JournalLinkedStore({ campaignId, storeId }: { campaignId: string; storeId: string }) {
 const [store,setStore]=useState<CampaignStore|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  void (async()=>{
   setLoading(true);setError("");
   try {
    const response=await fetch("/api/campaigns/"+encodeURIComponent(campaignId)+"/stores",{cache:"no-store",signal:controller.signal});
    const data=await response.json() as {stores?:CampaignStore[];error?:string};
    if(!response.ok||!Array.isArray(data.stores))throw new Error(data.error||"Store inventory unavailable.");
    const found=data.stores.find(item=>item.id===storeId);
    if(!found)throw new Error("This store no longer exists in the campaign.");
    if(!controller.signal.aborted)setStore(found);
   }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Store inventory unavailable.");}
   finally{if(!controller.signal.aborted)setLoading(false);}
  })();
  return()=>controller.abort();
 },[campaignId,storeId,reload]);
 return <section className="journal-linked-store" aria-label="Live store inventory">
  <div className="journal-linked-store-heading"><span>Live store inventory · GM view</span><button type="button" onClick={()=>setReload(n=>n+1)} disabled={loading}>Refresh</button></div>
  {loading&&<p role="status">Loading current stock…</p>}
  {error&&<p role="alert">{error} The original Journal snapshot remains saved.</p>}
  {store&&!loading&&!error&&<>
   {store.description&&<p>{store.description}</p>}
   {(store.proprietorName||store.proprietorNpcId)&&<section className="journal-store-proprietor"><h3>Proprietor: {store.proprietorName||"Linked NPC"}</h3>{store.proprietorDescription&&<p>{store.proprietorDescription}</p>}{store.proprietorNpcId&&<details><summary>NPC details</summary><JournalLinkedNpc campaignId={campaignId} npcId={store.proprietorNpcId}/></details>}</section>}
   <h3>Goods for sale</h3>
   {store.items.length?<div className="session-recap-table-wrap"><table><thead><tr><th>Item</th><th>Price</th><th>Availability</th></tr></thead><tbody>
    {store.items.map(item=><tr key={item.id}><td><strong>{item.name}</strong>{item.note&&<small className="journal-linked-store-note">{item.note}</small>}</td><td>{item.cost}</td><td>{item.quantity===null?"Unlimited":item.quantity+" in stock"}</td></tr>)}
   </tbody></table></div>:<p>No inventory listed yet.</p>}
  </>}
 </section>;
}
