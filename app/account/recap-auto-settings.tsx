"use client";
import { useEffect,useState } from "react";

type Preferences={autoEnabled:boolean;billingApproved:boolean;detail:"brief"|"standard"|"detailed";consentAt:string|null};
export function RecapAutoSettings(){
  const [state,setState]=useState<Preferences|null>(null);
  const [ready,setReady]=useState({storageConnected:false,aiConnected:false});
  const [enable,setEnable]=useState(false);
  const [bill,setBill]=useState(false);
  const [privacy,setPrivacy]=useState(false);
  const [detail,setDetail]=useState<Preferences["detail"]>("detailed");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    const ctrl=new AbortController();
    void Promise.all([
      fetch("/api/account/recap-preferences",{cache:"no-store",signal:ctrl.signal}).then(r=>r.json()),
      fetch("/api/account/recap-setup",{cache:"no-store",signal:ctrl.signal}).then(r=>r.json()),
    ]).then(([prefs,setup])=>{
      if(ctrl.signal.aborted)return;
      if(typeof prefs.autoEnabled!=="boolean"||typeof setup.storageConnected!=="boolean")
        throw new Error("Recap setup is temporarily unavailable.");
      setState(prefs);setEnable(prefs.autoEnabled);setBill(prefs.billingApproved);
      setPrivacy(prefs.autoEnabled);setDetail(prefs.detail);
      setReady({storageConnected:setup.storageConnected,aiConnected:setup.aiConnected});
    }).catch(e=>{if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"Recap setup unavailable.");})
      .finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
    return ()=>ctrl.abort();
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    const refresh=()=>{
      void fetch("/api/account/recap-setup",{cache:"no-store",signal:controller.signal})
        .then(response=>response.json())
        .then((details:{storageConnected?:boolean;aiConnected?:boolean})=>{
          if(!controller.signal.aborted)setReady({
            storageConnected:details.storageConnected===true,
            aiConnected:details.aiConnected===true,
          });
        }).catch(()=>{});
    };
    window.addEventListener("twe:recap-account-changed",refresh);
    return ()=>{controller.abort();window.removeEventListener("twe:recap-account-changed",refresh);};
  },[]);
  async function save(){
    if(saving)return;
    setSaving(true);setError("");setNotice("");
    try{
      const res=await fetch("/api/account/recap-preferences",{method:"PUT",cache:"no-store",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({autoEnabled:enable,billingApproved:enable&&bill,privacyApproved:enable&&privacy,detail})});
      const body=await res.json() as Preferences&{error?:string};
      if(!res.ok||typeof body.autoEnabled!=="boolean")throw new Error(body.error||"Could not save recap setup.");
      setState(body);
      setNotice(body.autoEnabled
        ?"Automatic recaps enabled. New session recordings will be analyzed through your Gemini account after they are saved to Drive."
        :"Automatic recaps disabled for new uploads. Your previous recordings and recaps are untouched.");
    }catch(e){setError(e instanceof Error?e.message:"Could not save recap setup.");}
    finally{setSaving(false);}
  }
  return <section className="account-panel" aria-labelledby="recap-automation-heading">
    <div className="account-section-heading"><div>
      <p className="account-kicker">FINAL STEP</p>
      <h2 id="recap-automation-heading">Automatic Recap Preferences</h2>
    </div></div>
    <p className="account-explanation">
      Your recording stays in your own Drive. After the upload, TWE temporarily sends
      it to Gemini to write a chronological recap. Gemini can continue when your
      computer is off; the result is saved privately for your approval.
    </p>
    {loading?<p role="status">Checking connections…</p>:<>
      <p className="account-explanation">
        Google Drive: <strong>{ready.storageConnected?"Connected":"Not connected"}</strong>
        {" · "}Gemini: <strong>{ready.aiConnected?"Connected":"Not connected"}</strong>
      </p>
      <label className="account-explanation"><input type="checkbox" checked={enable}
        onChange={e=>setEnable(e.target.checked)} disabled={saving||!ready.storageConnected||!ready.aiConnected}/>
        Automatically create a private recap from new session recordings
      </label>
      <label htmlFor="recap-detail-level">Recap length</label>
      <select id="recap-detail-level" value={detail} disabled={saving} onChange={e=>setDetail(e.target.value as Preferences["detail"])}>
        <option value="brief">Brief — highlights</option>
        <option value="standard">Standard — major scenes and decisions</option>
        <option value="detailed">Detailed — chronological scenes, NPCs, quests and timestamps (recommended)</option>
      </select>
      <p className="account-explanation">
        Gemini Files retains temporary copies for up to 48 hours.
        Background AI results may expire on Google&apos;s free tier after one day;
        TWE checks and saves results automatically. The original Drive audio remains yours.
        Uploads above Gemini&apos;s 2 GB file limit cannot be analyzed automatically.
      </p>
      {enable&&<>
        <label className="account-explanation"><input type="checkbox" checked={privacy} disabled={saving}
          onChange={e=>setPrivacy(e.target.checked)}/>
          I permit TWE to send my recording and relevant campaign Journal/recap context to my Gemini project.
          I understand that Google may use free-tier content to improve its products.
        </label>
        <label className="account-explanation"><input type="checkbox" checked={bill} disabled={saving}
          onChange={e=>setBill(e.target.checked)}/>
          I understand my Gemini project may incur charges, depending on my billing configuration.
          TWE cannot reliably check remaining free quota or prevent charges in my provider account.
        </label>
      </>}
      <button type="button" className="account-primary" disabled={saving||(enable&&(!privacy||!bill))}
        onClick={()=>void save()}>{saving?"Saving…":"Save recap preferences"}</button>
      {state?.autoEnabled&&<p className="account-notice" role="status">Your saved account settings allow automatic recaps.</p>}
    </>}
    {notice&&<p className="account-notice" role="status">{notice}</p>}
    {error&&<p className="account-error" role="alert">{error}</p>}
  </section>;
}
