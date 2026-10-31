"use client";
import {useEffect,useState} from "react";
type Preferences={autoEnabled:boolean;billingApproved:boolean;detail:"brief"|"standard"|"detailed";consentAt:string|null};
export function RecapAutoSettings(){
  const [detail,setDetail]=useState<Preferences["detail"]>("detailed");
  const [ready,setReady]=useState({storageConnected:false,aiConnected:false});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    const ctrl=new AbortController();
    const refresh=async()=>{
      const [preference,setup]=await Promise.all([
        fetch("/api/account/recap-preferences",{cache:"no-store",signal:ctrl.signal}),
        fetch("/api/account/recap-setup",{cache:"no-store",signal:ctrl.signal}),
      ]);
      if(!preference.ok||!setup.ok)throw Error("Recap preferences are temporarily unavailable.");
      const [prefs,connection]=await Promise.all([
        preference.json() as Promise<Preferences>,
        setup.json() as Promise<{storageConnected:boolean;aiConnected:boolean}>,
      ]);
      if(!ctrl.signal.aborted){
        setDetail(prefs.detail);
        setReady({storageConnected:connection.storageConnected,aiConnected:connection.aiConnected});
      }
    };
    void refresh().catch(e=>{if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"Recap setup unavailable.");})
      .finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
    const changed=()=>{
      void fetch("/api/account/recap-setup",{cache:"no-store",signal:ctrl.signal})
        .then(r=>r.json() as Promise<{storageConnected:boolean;aiConnected:boolean}>)
        .then(x=>{if(!ctrl.signal.aborted)setReady({storageConnected:x.storageConnected,aiConnected:x.aiConnected});})
        .catch(()=>{});
    };
    window.addEventListener("twe:recap-account-changed",changed);
    return ()=>{ctrl.abort();window.removeEventListener("twe:recap-account-changed",changed);};
  },[]);
  async function save(){
    if(saving)return;
    setSaving(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/account/recap-preferences",{
        method:"PUT",headers:{"content-type":"application/json"},
        body:JSON.stringify({autoEnabled:false,billingApproved:false,privacyApproved:false,detail}),
      });
      const result=await response.json() as Preferences&{error?:string};
      if(!response.ok||!result.detail)throw Error(result.error||"Could not save recap preferences.");
      setNotice("Default recap length saved. Audio is never sent to Gemini until you click Auto Summarize and confirm.");
    }catch(e){setError(e instanceof Error?e.message:"Could not save recap preferences.");}
    finally{setSaving(false);}
  }
  return <section className="account-panel" aria-labelledby="recap-automation-heading">
    <div className="account-section-heading"><div>
      <p className="account-kicker">OPTIONAL PREFERENCE</p>
      <h2 id="recap-automation-heading">AI Recap Preferences</h2>
    </div></div>
    <p className="account-explanation">
      Uploading a recording only stores it in your Google Drive. You choose whether to
      run Gemini later using <strong>Auto Summarize</strong> on that recording. Every AI
      request requires its own confirmation; no automatic billing starts after upload.
    </p>
    {loading?<p role="status">Checking accounts…</p>:<>
      <p className="account-explanation">
        Google Drive: <strong>{ready.storageConnected?"Connected":"Not connected"}</strong>
        {" · "}Gemini: <strong>{ready.aiConnected?"Connected":"Not connected"}</strong>
      </p>
      <label htmlFor="recap-detail-level">Default recap length</label>
      <select id="recap-detail-level" value={detail} disabled={saving}
        onChange={e=>setDetail(e.target.value as Preferences["detail"])}>
        <option value="brief">Brief — highlights</option>
        <option value="standard">Standard — major scenes and decisions</option>
        <option value="detailed">Detailed — scenes, NPCs, quests and timestamps (recommended)</option>
      </select>
      <p className="account-explanation">
        Gemini can incur charges in your own Google project. Free-tier submitted content
        may be used to improve Google products. You&apos;ll see these warnings again
        before each request. Original recordings remain in your Drive.
      </p>
      <button type="button" className="account-primary" disabled={saving}
        onClick={()=>void save()}>{saving?"Saving…":"Save recap preferences"}</button>
    </>}
    {notice&&<p className="account-notice" role="status">{notice}</p>}
    {error&&<p className="account-error" role="alert">{error}</p>}
  </section>;
}
