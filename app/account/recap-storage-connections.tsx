"use client";

import { useCallback, useEffect, useState } from "react";

type StorageConnection = {
  id: string;
  provider: string;
  displayName: string;
  status: "connected" | "disconnected" | "reconnect_required";
  connectedAt: string | null;
};

type StorageStatus = {
  available?: boolean;
  connections?: StorageConnection[];
  error?: string;
};

const ENDPOINT = "/api/account/storage/google-drive";

async function readStatus(response: Response): Promise<StorageStatus> {
  // Cloudflare errors can contain an empty or non-JSON response. Don't expose
  // a JSON parser exception in the Account screen.
  const raw = await response.text();
  let result: StorageStatus;
  try {
    result = JSON.parse(raw) as StorageStatus;
  } catch {
    throw new Error("Google Drive connection status is unavailable. Reload Account and try again.");
  }
  if (!response.ok || !Array.isArray(result.connections)) {
    throw new Error(result.error || "Could not check your Google Drive connection.");
  }
  return result;
}

export function RecapStorageConnections() {
  const [connections, setConnections] = useState<StorageConnection[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(ENDPOINT, { cache: "no-store", signal });
    const result = await readStatus(response);
    if (signal?.aborted) return;
    setConnections(result.connections ?? []);
    setAvailable(result.available === true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const currentUrl = new URL(window.location.href);
    const outcome = currentUrl.searchParams.get("drive");
    // Defer state updates until after the first render (React effect safety).
    const notification = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      if (outcome === "connected") {
        setMessage("Google Drive connected. Your session recordings will be saved to your Drive.");
      } else if (outcome === "cancelled") {
        setMessage("Google Drive connection cancelled. Nothing was changed.");
      } else if (outcome === "error") {
        setError("Google couldn't complete the connection. Try again. If Google reports a redirect error, TWE needs to finish its Google authorization setup.");
      }
    }, 0);
    if (outcome === "connected" || outcome === "cancelled" || outcome === "error") {
      currentUrl.searchParams.delete("drive");
      window.history.replaceState(window.history.state, "", currentUrl.pathname + currentUrl.search + currentUrl.hash);
    }
    const requestTimer = window.setTimeout(() => {
      void refresh(controller.signal)
        .catch(cause => {
          if (!controller.signal.aborted) {
            setError(cause instanceof Error ? cause.message : "Google Drive is unavailable.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      controller.abort();
      window.clearTimeout(notification);
      window.clearTimeout(requestTimer);
    };
  }, [refresh]);

  // The API returns connections newest first. Use one account card rather
  // than showing old disconnected entries or multiple competing buttons.
  const drive = connections.find(x => x.provider === "google-drive" && x.status === "connected")
    ?? connections.find(x => x.provider === "google-drive" && x.status === "reconnect_required");
  const connected = drive?.status === "connected";

  function connect() {
    if (!available || disconnecting) return;
    setError("");
    window.location.assign(ENDPOINT + "/start");
  }

  async function disconnect() {
    if (!drive || disconnecting) return;
    setDisconnecting(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(ENDPOINT + "/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionId: drive.id }),
      });
      const body = await response.json() as { disconnected?: boolean; error?: string };
      if (!response.ok || !body.disconnected) {
        throw new Error(body.error || "Google Drive couldn't be disconnected.");
      }
      setConfirmDisconnect(false);
      setMessage("Google Drive disconnected. Your recordings are still in your Drive.");
      await refresh();
      window.dispatchEvent(new Event("twe:recap-account-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Drive couldn't be disconnected.");
    } finally {
      setDisconnecting(false);
    }
  }

  return <section className="account-panel account-connections-panel" aria-labelledby="storage-connections-title">
    <div className="account-section-heading"><div>
      <p className="account-kicker">SESSION RECORDINGS</p>
      <h2 id="storage-connections-title">Google Drive Storage</h2>
    </div></div>
    <p className="account-explanation">
      Keep your session recordings in your own Google Drive. TWE creates a
      <strong> Tales Without End</strong> folder for uploaded recordings, and
      Google asks your permission before connecting.
    </p>
    {loading ? <p role="status">Checking Google Drive…</p> : <>
      {connected ? <div className="account-connection">
        <div>
          <strong>{drive.displayName || "Google Drive"}</strong>
          <span><span aria-hidden="true">✓ </span>Connected</span>
        </div>
        <button type="button" className="account-secondary" disabled={disconnecting}
          onClick={() => setConfirmDisconnect(true)}>Disconnect</button>
      </div> : <div className="account-actions">
        <button type="button" className="account-primary" disabled={!available || disconnecting}
          onClick={connect}>
          {drive?.status === "reconnect_required" ? "Reconnect Google Drive" : "Connect Google Drive"}
        </button>
      </div>}
      {!connected && !available && <p className="account-explanation" role="status">
        Google Drive connection is temporarily unavailable. TWE needs to finish its
        Google authorization setup; no changes to your Drive are required.
      </p>}
      {!connected && available && <p className="account-explanation">
        You can approve access on Google&apos;s permission screen. TWE only requests
        access to files it creates or that you explicitly share with TWE.
      </p>}
      {confirmDisconnect && drive && <div className="account-disconnect-confirmation"
        role="group" aria-label="Confirm disconnect Google Drive">
        <p>Disconnect Google Drive? Your recordings won&apos;t be deleted, but TWE
          cannot upload or play them until you reconnect.</p>
        <div className="account-actions">
          <button type="button" className="account-secondary" disabled={disconnecting}
            onClick={() => setConfirmDisconnect(false)}>Cancel</button>
          <button type="button" className="account-secondary" disabled={disconnecting}
            onClick={() => void disconnect()}>
            {disconnecting ? "Disconnecting…" : "Confirm disconnect"}
          </button>
        </div>
      </div>}
    </>}
    {message && <p className="account-notice" role="status">{message}</p>}
    {error && <p className="account-error" role="alert">{error}</p>}
  </section>;
}
