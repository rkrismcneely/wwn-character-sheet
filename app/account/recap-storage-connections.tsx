"use client";

import { useEffect, useState } from "react";

type StorageConnection = {
  id: string;
  provider: string;
  displayName: string;
  status: "connected" | "disconnected" | "reconnect_required";
  connectedAt: string | null;
};

export function RecapStorageConnections() {
  const [connections,setConnections] = useState<StorageConnection[]>([]);
  const [available,setAvailable] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState("");
  const [confirmId,setConfirmId] = useState("");
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");

  async function refresh() {
    try {
      const res = await fetch("/api/account/storage/google-drive",{cache:"no-store"});
      const result = await res.json() as {
        available?: boolean; connections?: StorageConnection[]; error?: string;
      };
      if (!res.ok || !Array.isArray(result.connections)) {
        throw new Error(result.error || "Could not load storage connections.");
      }
      setConnections(result.connections);
      setAvailable(Boolean(result.available));
    } catch(e) {
      setError(e instanceof Error ? e.message : "Storage connections unavailable.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void refresh().then(() => {
      const result = new URLSearchParams(window.location.search).get("drive");
      if (result === "connected") setMessage("Google Drive connected for your session recordings.");
      if (result === "error") setError("Drive connection wasn't completed. Please try again.");
    });
  }, []);

  async function disconnect(connectionId: string) {
    setBusy(connectionId); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account/storage/google-drive/disconnect",{
        method:"POST", headers:{"content-type":"application/json"},
        body: JSON.stringify({connectionId}),
      });
      const json = await response.json() as {disconnected?:boolean;error?:string};
      if(!response.ok || !json.disconnected) throw new Error(json.error || "Disconnect failed.");
      setMessage("Google Drive disconnected. Your files have not been deleted.");
      setConfirmId("");
      await refresh();
    } catch(e){setError(e instanceof Error?e.message:"Disconnect failed.");}
    finally{setBusy("");}
  }

  return <section className="account-panel account-connections-panel" aria-labelledby="storage-connections-title">
    <div className="account-section-heading"><div>
      <p className="account-kicker">SESSION RECORDINGS</p>
      <h2 id="storage-connections-title">Storage</h2>
    </div></div>
    <p className="account-explanation">
      Connect your own Google Drive for future Session Recap recordings.
      Your files stay in your account. Players won&apos;t need to connect their own Drive.
    </p>
    {message && <p className="account-notice" role="status">{message}</p>}
    {error && <p className="account-error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading storage connections…</p> : <>
      <div className="account-connections-list">
        {connections.filter(x=>x.provider==="google-drive").map(c=><div className="account-connection" key={c.id}>
          <div><strong>{c.displayName || "Google Drive"}</strong>
            <span>{c.status === "connected" ? "Connected" : c.status === "reconnect_required" ? "Reconnect required" : "Disconnected"}</span>
          </div>
          {c.status === "connected" && (confirmId === c.id
            ? <div className="account-actions">
                <button type="button" className="account-secondary" onClick={()=>setConfirmId("")}>Cancel</button>
                <button type="button" className="account-secondary" disabled={busy===c.id}
                  onClick={()=>void disconnect(c.id)}>{busy===c.id ? "Disconnecting…" : "Confirm disconnect"}</button>
              </div>
            : <button type="button" className="account-secondary" onClick={()=>setConfirmId(c.id)}>Disconnect</button>)}
        </div>)}
      </div>
      {available
        ? <div className="account-actions"><a href="/api/account/storage/google-drive/start" className="account-secondary">Connect Google Drive</a></div>
        : <p className="account-explanation">Google Drive connections are not configured on TWE yet.</p>}
    </>}
    <p className="account-explanation">Disconnecting removes TWE&apos;s access, not the recordings in your Drive. Uploading and in-page playback will be added separately.</p>
  </section>;
}
