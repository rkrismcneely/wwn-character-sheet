"use client";
import {useEffect,useState} from "react";
type StorageConnection={id:string;provider:string;displayName:string;
  status:"connected"|"disconnected"|"reconnect_required"};
type Status={available?:boolean;connections?:StorageConnection[];error?:string};
const ENDPOINT="/api/account/storage/dropbox";
const messages:Record<string,string>={
  invalid_origin:"Connect Dropbox from the TWE production website.",
  session_missing:"Sign in to TWE and connect Dropbox again.",
  oauth_denied:"Dropbox did not authorize TWE. Review the permissions and try again.",
  callback_incomplete:"Dropbox did not complete authorization. Try again.",
  state_cookie_missing:"This browser did not return the temporary connection cookie.",
  state_expired:"The connection expired. Connect Dropbox again.",
  server_config:"Dropbox app authorization is not yet configured by the TWE site owner.",
  token_exchange:"Dropbox could not complete authorization. Check app credentials and permissions.",
  missing_scope:"Dropbox permissions were incomplete.",
  secure_storage_error:"TWE could not encrypt the connection. Contact the site owner.",
  database_error:"TWE could not save the Dropbox connection. Contact the site owner.",
  unexpected:"Dropbox connection failed. Try again.",
};
export function RecapDropboxConnection(){
  const [available,setAvailable]=useState(false);
  const [connections,setConnections]=useState<StorageConnection[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  async function refresh(){
    const response=await fetch(ENDPOINT,{cache:"no-store"});
    const body=await response.json() as Status;
    if(!response.ok||!Array.isArray(body.connections))
      throw Error(body.error||"Dropbox status unavailable.");
    setAvailable(body.available===true);
    setConnections(body.connections);
  }
  useEffect(()=>{
    const url=new URL(window.location.href),outcome=url.searchParams.get("dropbox"),
      reason=url.searchParams.get("dropbox_error");
    if(outcome){
      url.searchParams.delete("dropbox");url.searchParams.delete("dropbox_error");
      window.history.replaceState(window.history.state,"",url.pathname+url.search+url.hash);
    }
    let active=true;
    const notification=window.setTimeout(()=>{
      if(!active)return;
      if(outcome==="connected")setMessage("Dropbox connected. You can choose it when uploading audio.");
      else if(outcome==="cancelled")setMessage("Dropbox connection cancelled.");
      else if(outcome)setError(messages[reason??""]??"Dropbox connection failed.");
    },0);
    void refresh().catch(e=>{if(active)setError(e instanceof Error?e.message:"Dropbox unavailable.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;window.clearTimeout(notification);};
  },[]);
  const account=connections.find(c=>c.status==="connected")??
    connections.find(c=>c.status==="reconnect_required");
  const connected=account?.status==="connected";
  async function disconnect(){
    if(!account||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      const response=await fetch(ENDPOINT+"/disconnect",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({connectionId:account.id})});
      const body=await response.json() as {disconnected?:boolean;error?:string};
      if(!response.ok||!body.disconnected)throw Error(body.error||"Could not disconnect Dropbox.");
      setConfirm(false);setMessage("Dropbox disconnected. Existing audio remains in Dropbox.");
      await refresh();window.dispatchEvent(new Event("twe:recap-account-changed"));
    }catch(e){setError(e instanceof Error?e.message:"Dropbox disconnect failed.");}
    finally{setBusy(false);}
  }
  return <section className="account-panel account-connections-panel" aria-labelledby="dropbox-storage-title">
    <div className="account-section-heading"><div>
      <p className="account-kicker">SESSION RECORDINGS</p>
      <h2 id="dropbox-storage-title">Dropbox Storage</h2>
    </div></div>
    <p className="account-explanation">Store session audio in your own Dropbox, independently of Google Drive.
      TWE requests access to upload and privately play recordings. Your existing Drive files are unchanged.</p>
    {loading?<p role="status">Checking Dropbox…</p>:
      connected?<div className="account-connection"><div>
        <strong>{account.displayName||"Dropbox"}</strong>
        <span>✓ Connected</span></div>
        <button type="button" className="account-secondary" disabled={busy}
          onClick={()=>setConfirm(true)}>Disconnect</button></div>
      :<div className="account-actions"><button type="button" className="account-primary"
        disabled={busy||!available} onClick={()=>window.location.assign(ENDPOINT+"/start")}>
        {account?.status==="reconnect_required"?"Reconnect Dropbox":"Connect Dropbox"}
      </button></div>}
    {!available&&!loading&&<p className="account-explanation">
      Dropbox requires the site owner to configure the Dropbox app key and secret before connecting.
    </p>}
    {confirm&&account&&<div className="account-disconnect-confirmation">
      <p>Disconnect Dropbox? Stored recordings will stay in your Dropbox, but TWE
        cannot play them until you reconnect.</p>
      <div className="account-actions">
        <button type="button" className="account-secondary" disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button>
        <button type="button" className="account-secondary" disabled={busy} onClick={()=>void disconnect()}>
          {busy?"Disconnecting…":"Confirm disconnect"}</button>
      </div></div>}
    {message&&<p className="account-notice" role="status">{message}</p>}
    {error&&<p className="account-error" role="alert">{error}</p>}
  </section>;
}
