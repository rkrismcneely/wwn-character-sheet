"use client";

import { useEffect, useRef, useState } from "react";

type Plan={provider:string;model:string;models:string[];sections:number;requests:number;characters:number;warning:string};
export function SessionRecapAIWriter({campaignId,recapId,onDraft}:{
  campaignId:string;recapId:string;onDraft:(content:string)=>boolean;
}) {
  const url="/api/campaigns/"+encodeURIComponent(campaignId)+"/session-recaps/generate";
  const [plan,setPlan]=useState<Plan|null>(null);
  const [key,setKey]=useState("");
  const [model,setModel]=useState("openai/gpt-oss-120b");
  const [shareApproved,setShareApproved]=useState(false);
  const [billingApproved,setBillingApproved]=useState(false);
  const [busy,setBusy]=useState(false);
  const [completed,setCompleted]=useState(0);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [generated,setGenerated]=useState("");
  const controller=useRef<AbortController|null>(null);
  const notes=useRef<string[]>([]);

  useEffect(()=>{
    const signal=new AbortController();
    void fetch(url+"?recapId="+encodeURIComponent(recapId),{cache:"no-store",signal:signal.signal})
      .then(async response=>{
        const data=await response.json() as Plan & {error?:string};
        if(!response.ok)throw new Error(data.error||"Recap planning unavailable.");
        return data;
      })
      .then(value=>{if(!signal.signal.aborted)setPlan(value);})
      .catch(cause=>{if(!signal.signal.aborted)setError(cause instanceof Error?cause.message:"Recap planning unavailable.");});
    return ()=>{signal.abort();controller.current?.abort();};
  },[recapId,url]);

  async function requestStage(
    phase:"section"|"final",signal:AbortSignal,partIndex?:number,summaryNotes?:string[],
  ):Promise<string> {
    const response=await fetch(url,{method:"POST",cache:"no-store",signal,
      headers:{"content-type":"application/json"},
      body:JSON.stringify({recapId,phase,partIndex,notes:summaryNotes,
        apiKey:key,model,consent:shareApproved,billingAcknowledged:billingApproved})});
    const body=await response.json() as {error?:string;text?:string};
    if(!response.ok||!body.text)throw new Error(body.error||"Provider request failed.");
    return body.text;
  }
  async function generate() {
    if(busy||!plan||!shareApproved||!billingApproved||!key.trim())return;
    const active=new AbortController();
    controller.current=active;
    setBusy(true);setError("");setNotice("");
    try{
      for(let i=notes.current.length;i<plan.sections;i++){
        const summary=await requestStage("section",active.signal,i);
        if(active.signal.aborted)return;
        notes.current.push(summary);setCompleted(notes.current.length);
      }
      const result=await requestStage("final",active.signal,undefined,notes.current);
      if(active.signal.aborted)return;
      setGenerated(result);
      setNotice("Draft generated. Review the text below, then choose whether to put it in the editor.");
      notes.current=[];setCompleted(0);setKey("");
    }catch(cause){
      if(!active.signal.aborted)setError(cause instanceof Error?cause.message:"Generation paused.");
    }finally{
      if(controller.current===active)controller.current=null;
      setBusy(false);
    }
  }
  function cancel(){controller.current?.abort();setBusy(false);setNotice("Paused. Completed sections remain in this tab for retry.");}
  function applyDraft(){
    if(!generated)return;
    if(onDraft(generated)){
      setGenerated("");
      setNotice("Draft applied to the Markdown editor. Review and explicitly Save Session Recap when ready.");
    }else{
      setNotice("The existing editor text was preserved. Your generated draft remains below.");
    }
  }
  return <section className="session-recap-reading" aria-label="Generate recap from transcript">
    <h4>Draft a recap with your own AI account</h4>
    <p className="campaign-empty-copy">
      Uses your personal Groq API key for this request only. The key stays in this page memory
      and is sent securely to the TWE server for each request, then forwarded to Groq.
      It is not saved as an account connection. Audio is never sent.
      Your provider may charge you; TWE cannot verify remaining free quota.
    </p>
    {plan && <>
      <label><span>Groq model</span>{" "}
        <select value={model} disabled={busy} onChange={event=>{setModel(event.target.value);notes.current=[];setCompleted(0);}}>
          <option value="openai/gpt-oss-120b">GPT-OSS 120B — higher quality</option>
          <option value="openai/gpt-oss-20b">GPT-OSS 20B — lower cost</option>
        </select>
      </label>
      <p><strong>{model}</strong> · {plan.sections} transcript sections · up to {plan.requests} provider requests
        {" · "}{plan.characters.toLocaleString()} dialogue characters</p>
      <p className="campaign-empty-copy">{plan.warning}</p>
      <label><span>Personal Groq API key (not saved)</span>
        <input type="password" autoComplete="off" value={key}
          onChange={event=>setKey(event.target.value)} placeholder="gsk_…" disabled={busy}/>
      </label>
      <p><a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
        Manage your personal Groq keys</a></p>
      <label style={{display:"block",marginBlock:"0.5rem"}}>
        <input type="checkbox" checked={shareApproved} disabled={busy}
          onChange={event=>setShareApproved(event.target.checked)}/>
        I agree to send my campaign transcript and bounded campaign context to Groq for this recap.
      </label>
      <label style={{display:"block",marginBlock:"0.5rem"}}>
        <input type="checkbox" checked={billingApproved} disabled={busy}
          onChange={event=>setBillingApproved(event.target.checked)}/>
        I understand that this uses my own provider quota and could incur charges on my account.
      </label>
      <div className="session-recap-form-actions">
        <button type="button" className="campaign-primary"
          disabled={busy||!key.trim()||!shareApproved||!billingApproved}
          onClick={()=>void generate()}>{completed?"Resume draft":"Generate draft"}</button>
        {busy&&<button type="button" className="campaign-secondary" onClick={cancel}>Stop after this step</button>}
      </div>
      {busy&&<p role="status">Summarized {completed} of {plan.sections} sections. Keep this page open.</p>}
      {!busy&&completed>0&&<p className="campaign-empty-copy">{completed} sections saved temporarily in this tab.</p>}
    </>}
    {generated && <div className="session-recap-reading" aria-label="Review AI draft">
      <h5>Review generated Markdown</h5>
      <textarea readOnly rows={14} value={generated} aria-label="Generated Markdown draft" />
      <button type="button" className="campaign-primary" onClick={applyDraft}>
        Use this draft in the recap editor
      </button>
    </div>}
    {notice&&<p className="session-recap-import-notice" role="status">{notice}</p>}
    {error&&<p className="campaign-error" role="alert">{error}</p>}
  </section>;
}
