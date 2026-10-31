"use client";

import { useEffect,useState,type FormEvent } from "react";

type Connection={id:string;status:"connected"|"disconnected"|"needs_attention";
  connectedAt:string|null;updatedAt:string;keyFingerprint:string|null};
type State={configured:boolean;connection:Connection|null};
const url="/api/account/recap-ai/gemini";
/** An upstream Worker error can have no JSON body. Show guidance, never a JSON parser exception. */
async function readAccountReply<T>(response:Response):Promise<T>{
  const raw=await response.text();
  let body:T;
  try {body=JSON.parse(raw) as T;}
  catch {throw new Error(response.ok
    ? "The account server returned an invalid response. Reload Account and try again."
    : "The account service is not ready. Reload Account and try again; if this continues, check the recap database migration.");}
  if(!response.ok)throw new Error((body as {error?:string}).error||"Account service unavailable.");
  return body;
}
export function RecapAIConnections(){
  const [state,setState]=useState<State|null>(null);
  const [key,setKey]=useState("");
  const [approved,setApproved]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(url,{cache:"no-store",signal:controller.signal})
      .then(async response=>{
        const json=await readAccountReply<State&{error?:string}>(response);
        if(!controller.signal.aborted)setState(json);
      }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Connection status unavailable.");});
    return ()=>controller.abort();
  },[]);
  async function action(method:"PUT"|"POST"|"DELETE",body?:object){
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch(url,{method,headers:{"content-type":"application/json"},
        body:body?JSON.stringify(body):undefined,cache:"no-store"});
      const json=await readAccountReply<{saved?:boolean;disconnected?:boolean;verified?:boolean;
        notice?:string;error?:string}>(response);
      let savedNotice="";
      if(method==="PUT"&&json.saved){
        // Key validation uses Google's read-only models list: no audio or
        // billable generation request. Keep a saved key even if Google is offline.
        try{
          const check=await fetch(url,{method:"POST",cache:"no-store"});
          await readAccountReply<{verified:boolean;notice?:string}>(check);
          savedNotice="Gemini key securely saved and verified with Google. No AI request was started.";
        }catch(e){
          savedNotice="Gemini key securely saved, but Google couldn't verify access: "+
            (e instanceof Error?e.message:"Try Test connection again.");
        }
      }
      const refreshed=await fetch(url,{cache:"no-store"});
      const detail=await readAccountReply<State>(refreshed);
      setState(detail);
      window.dispatchEvent(new Event("twe:recap-account-changed"));
      if(method==="PUT"){setKey("");setApproved(false);}
      setNotice(savedNotice||json.notice||(method==="DELETE"
        ?"Gemini key disconnected from TWE.":"Gemini access verified."));
    }catch(e){setError(e instanceof Error?e.message:"Could not update Gemini connection.");}
    finally{setBusy(false);}
  }
  function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!approved||!key.trim())return;
    void action("PUT",{apiKey:key.trim(),consent:true});
  }
  return <section className="account-panel" aria-labelledby="recap-ai-connections-heading">
    <div className="account-section-heading"><div>
      <p className="account-kicker">SESSION RECAP PROVIDERS</p>
      <h2 id="recap-ai-connections-heading">AI Recap Accounts</h2>
    </div></div>
    <p className="account-explanation">
      Each GM can connect their own Gemini project. Your API key is encrypted on the TWE
      server and cannot be viewed by other GMs, campaign members, or site visitors.
      Free limits and potential charges belong to your Google AI Studio project, not TWE.
      Connecting does not submit audio or start any AI request.
    </p>
    <p className="account-explanation">
      Connect your Gemini key once, then upload a session recording to your Google Drive.
      Gemini only starts when you click Auto Summarize on that recording and approve its
      individual privacy and billing confirmation. Full transcripts remain optional.
    </p>
    {state?.connection&&state.connection.status!=="disconnected"&&
      <dl className="account-provider">
        <div><dt>Gemini</dt><dd>{state.connection.status==="connected"?
          "Key securely saved":"Connection needs attention"}</dd></div>
        <div><dt>Connected</dt><dd>{state.connection.connectedAt?
          new Date(state.connection.connectedAt).toLocaleDateString():"Pending"}</dd></div>
      </dl>}
    {state&&!state.configured&&<p className="account-error" role="status">
      TWE is finishing the server-side encryption setup. Your Gemini API key cannot
      be stored until the production Cloudflare Worker has the secure
      RECAP_STORAGE_ENCRYPTION_KEY secret. This is a site configuration issue,
      not a problem with your Google API key.
    </p>}
    <div className="account-actions">
      <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer"
         className="account-secondary">Get a Gemini API key from Google AI Studio</a>
    </div>
    <p className="account-explanation">
      Open Google AI Studio, create or select a project, choose <strong>Create API key</strong>,
      copy the API key string (not the key ID), and paste it below. Check quotas and billing before using AI.
    </p>
    <form className="account-form" onSubmit={save}>
      <label htmlFor="recap-gemini-api-key">Personal Google AI Studio API key</label>
      <input id="recap-gemini-api-key" type="password" value={key} autoComplete="off"
        disabled={busy||!state?.configured} placeholder="Paste your own Gemini API key"
        onChange={event=>setKey(event.target.value)}/>
      <small>
        <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer noopener">
          Create or manage your Google AI Studio key
        </a>. <strong>Privacy:</strong> Google states that content submitted under its free
        Gemini API tier may be used to improve its products. Paid-tier handling differs.
        Check your project&apos;s actual data-use terms before sending private recordings.
        <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer">
          {" Gemini tier terms"}
        </a>.
      </small>
      <label className="account-explanation">
        <input type="checkbox" checked={approved} disabled={busy||!state?.configured}
          onChange={event=>setApproved(event.target.checked)}/>
        I authorize storing my personal API key securely and understand my project
        may incur charges depending on its billing configuration.
      </label>
      <div className="account-name-entry">
        <button type="submit" className="account-primary"
          disabled={busy||!state?.configured||!approved||!key.trim()}>
          {busy?"Working…":state?.connection?.status==="connected"?"Replace Gemini key":"Connect Gemini"}
        </button>
        {state?.connection?.status!=="disconnected"&&state?.connection&&<>
          <button type="button" className="account-secondary" disabled={busy}
            onClick={()=>void action("POST")}>Test connection</button>
          <button type="button" className="account-secondary" disabled={busy}
            onClick={()=>{
              if(window.confirm("Disconnect Gemini from TWE? Queued background jobs will not have permission to use this key.")){
                void action("DELETE");
              }
            }}>Disconnect</button>
        </>}
      </div>
    </form>
    {notice&&<p className="account-notice" role="status">{notice}</p>}
    {error&&<p className="account-error" role="alert">{error}</p>}
  </section>;
}
