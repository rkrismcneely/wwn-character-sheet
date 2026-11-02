"use client";
import {useEffect,useState,type FormEvent} from "react";

type Status={configured:boolean;connection:{status:string;connectedAt:string|null}|null};
const endpoint="/api/account/recap-ai/groq";
export function RecapGroqConnection(){
 const [status,setStatus]=useState<Status|null>(null);
 const [key,setKey]=useState("");
 const [consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function refresh(){
  const response=await fetch(endpoint,{cache:"no-store"});
  const data=await response.json() as Status&{error?:string};
  if(!response.ok)throw Error(data.error||"Groq connection unavailable.");
  setStatus(data);
 }
 useEffect(()=>{const controller=new AbortController();
  void fetch(endpoint,{cache:"no-store",signal:controller.signal})
   .then(async response=>{const data=await response.json() as Status&{error?:string};
    if(!response.ok)throw Error(data.error||"Groq connection unavailable.");
    if(!controller.signal.aborted)setStatus(data);})
   .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Connection unavailable.");});
  return ()=>controller.abort();
 },[]);
 async function action(method:"PUT"|"POST"|"DELETE",body?:object){
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch(endpoint,{method,headers:{"content-type":"application/json"},
    body:body?JSON.stringify(body):undefined});
   const data=await response.json() as {error?:string;notice?:string};
   if(!response.ok)throw Error(data.error||"Could not update Groq connection.");
   await refresh();
   if(method==="PUT"){setKey("");setConsent(false);}
   setNotice(data.notice||(method==="PUT"?"Groq key saved. Use Test connection to verify.":"Groq disconnected."));
   window.dispatchEvent(new Event("twe:recap-account-changed"));
  }catch(e){setError(e instanceof Error?e.message:"Groq connection unavailable.");}
  finally{setBusy(false);}
 }
 function submit(event:FormEvent){event.preventDefault();if(consent&&key.trim())void action("PUT",{apiKey:key.trim(),consent:true});}
 return <section className="account-panel" aria-labelledby="groq-recap-heading">
  <div className="account-section-heading"><div>
   <p className="account-kicker">OPTIONAL RECAP WRITER</p>
   <h2 id="groq-recap-heading">GroqCloud</h2>
  </div></div>
  <p className="account-explanation">
   Connect your personal Groq key for AI-written session recaps. Gemini handles the audio;
   Groq will receive the resulting scene notes and relevant campaign context when you approve a recap.
   Your key is stored encrypted. Connecting a key never starts generation.
  </p>
  <p className="account-explanation">Status: <strong>{status?.connection?.status==="connected"?"Connected":
   status?.connection?.status==="needs_attention"?"Needs attention":"Not connected"}</strong></p>
  <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Get your Groq API key</a>
  <form className="account-form" onSubmit={submit}>
   <label htmlFor="recap-groq-api-key">Groq API key</label>
   <input id="recap-groq-api-key" type="password" value={key} autoComplete="off"
    placeholder="gsk_…" disabled={busy||!status?.configured} onChange={e=>setKey(e.target.value)}/>
   <label><input type="checkbox" checked={consent} disabled={busy||!status?.configured}
    onChange={e=>setConsent(e.target.checked)}/> I authorize securely saving my own Groq key and understand that its quota and billing terms apply.</label>
   <div className="account-name-entry">
    <button type="submit" className="account-primary" disabled={busy||!status?.configured||!consent||!key.trim()}>
     {busy?"Working…":"Save Groq key"}</button>
    {status?.connection?.status!=="disconnected"&&status?.connection&&<>
     <button type="button" className="account-secondary" disabled={busy} onClick={()=>void action("POST")}>Test connection</button>
     <button type="button" className="account-secondary" disabled={busy} onClick={()=>{
      if(window.confirm("Disconnect Groq? Any future Groq recap writing will require reconnection."))void action("DELETE");
     }}>Disconnect</button>
    </>}
   </div>
  </form>
  {notice&&<p className="account-notice" role="status">{notice}</p>}
  {error&&<p className="account-error" role="alert">{error}</p>}
 </section>;
}
