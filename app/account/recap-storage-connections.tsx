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
    let active = true;
    void fetch("/api/account/storage/google-drive", {cache:"no-store"})
      .then(async response => {
        const data = await response.json() as {available?: boolean;connections?: StorageConnection[];error?: string};
        if (!response.ok || !Array.isArray(data.connections)) {
          throw new Error(data.error || "Could not load storage connections.");
        }
        return data;
      })
      .then(data => {
        if (!active) return;
        setConnections(data.connections ?? []);
        setAvailable(Boolean(data.available));
        const result = new URLSearchParams(window.location.search).get("drive");
        if (result === "connected") setMessage("Google Drive connected for your session recordings.");
        if (result === "error") setError("Drive connection wasn't completed. Please try again.");
      })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : "Storage connections unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
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
      Connect your own Google Drive to store and play Session Recap recordings, including 2–3-hour audio files.
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
        : <div className="account-explanation" role="status">
            <strong>Google Drive needs one-time site setup before you can connect.</strong>
            <p>Your normal Google sign-in does not automatically grant access to Drive.</p>
            <details>
              <summary>Site owner: enable Google Drive connections</summary>
              <ol>
                <li>In <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener noreferrer">Google Auth Platform — Clients</a>,
                    open the existing TWE Google sign-in OAuth client (or create a separate Web client).</li>
                <li>Authorize this exact redirect URI:
                    <code>https://taleswithoutend.com/api/account/storage/google-drive/callback</code></li>
                <li>Enable the <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer">Google Drive API</a>
                    and declare the <code>drive.file</code> scope on the consent screen. Publish or configure testing access as required by Google.</li>
                <li>Set the <code>RECAP_STORAGE_ENCRYPTION_KEY</code> secret on the production Cloudflare Worker.
                    It must be a cryptographically random 32-byte value encoded in unpadded base64url (43 characters).
                    If using a separate OAuth client, also configure <code>GOOGLE_DRIVE_CLIENT_ID</code> and
                    <code>GOOGLE_DRIVE_CLIENT_SECRET</code>. Never enter these site credentials into a GM&apos;s account form.</li>
                <li>Reload this page and choose <strong>Connect Google Drive</strong>.
                    Google will then ask for permission for your individual account.</li>
              </ol>
              <p>Cloudflare Worker settings and Google OAuth configuration can only be changed by the site operator.
                 Existing Google sign-in credentials can be reused for the separate Drive consent after the redirect URI is approved.</p>
            </details>
          </div>}
    </>}
    <p className="account-explanation">Disconnecting removes TWE&apos;s access, not the recordings in your Drive. Existing playback and new uploads will stop until storage is reconnected. Recordings remain under your control.</p>
  </section>;
}
