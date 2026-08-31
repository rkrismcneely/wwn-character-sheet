"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, providerName, type AuthProvider } from "@/lib/auth-providers";
import type { ConnectedAccount } from "@/lib/account/connected-accounts";

async function loadConnections(): Promise<ConnectedAccount[]> {
  const response = await fetch("/api/account/connections", { cache: "no-store" });
  if (!response.ok) throw new Error("Connections unavailable.");
  const payload = await response.json() as { accounts: ConnectedAccount[] };
  return payload.accounts;
}

export function ConnectedAccounts() {
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<AuthProvider | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const disconnectButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let active = true;
    void loadConnections().then(accounts => {
      if (!active) return;
      setAccounts(accounts);
      const url = new URL(window.location.href);
      if (url.searchParams.get("connected") === "1") {
        setNotice("Connection returned. Your current connected accounts are shown below.");
        url.searchParams.delete("connected");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }).catch(() => { if (active) setError("Connected accounts could not be loaded. Refresh to try again."); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (confirm) cancelButton.current?.focus(); }, [confirm]);

  function cancel() { setConfirm(null); disconnectButton.current?.focus(); }

  async function connect(provider: AuthProvider) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await authClient.linkSocial({ provider, callbackURL: "/account?connected=1", errorCallbackURL: "/auth/error" });
      if (result.error) { setError(authErrorMessage(result.error.code)); setBusy(false); }
    } catch { setError(authErrorMessage()); setBusy(false); }
  }

  async function disconnect(provider: AuthProvider) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await authClient.unlinkAccount({ providerId: provider });
      if (result.error) setError(authErrorMessage(result.error.code));
      else setNotice(`${providerName(provider)} disconnected. Your Tales Without End account and data are unchanged.`);
      setAccounts(await loadConnections());
    } catch { setError(authErrorMessage()); }
    finally { setBusy(false); cancel(); }
  }

  return <section className="account-panel" aria-labelledby="connected-accounts-title">
    <div className="account-section-heading"><h2 id="connected-accounts-title">Connected Accounts</h2></div>
    <p className="account-explanation">Use either connected method to open the same characters and campaigns. Connect a method here before signing in with it separately.</p>
    {error && <p role="alert" className="account-error">{error}</p>}
    {notice && <p role="status" className="account-notice">{notice}</p>}
    {!accounts && !error && <p role="status">Loading connected accounts…</p>}
    {accounts?.map(account => <div className="account-connection" key={account.provider}>
      <div><strong>{providerName(account.provider)}</strong><span>{account.connected ? "Connected" : "Not connected"}</span></div>
      {account.connected
        ? <button type="button" className="account-secondary" disabled={busy || !account.canDisconnect} aria-label={`Disconnect ${providerName(account.provider)}`} onClick={event => { disconnectButton.current = event.currentTarget; setConfirm(account.provider); }}>Disconnect</button>
        : account.available
          ? <button type="button" className="account-secondary" disabled={busy} onClick={() => void connect(account.provider)} aria-label={`Connect ${providerName(account.provider)}`}>Connect</button>
          : <span>Currently unavailable</span>}
    </div>)}
    <p className="account-explanation">Keep at least one available sign-in method connected. Connecting or disconnecting never moves your characters or campaigns.</p>
    {confirm && <div className="account-disconnect-confirmation" role="group" aria-label={`Confirm disconnect ${providerName(confirm)}`} onKeyDown={event => { if (event.key === "Escape" && !busy) cancel(); }}>
      <p>Disconnect {providerName(confirm)}? You will need your other connected method to sign in. Your account and game data will remain.</p>
      <div className="account-actions"><button ref={cancelButton} type="button" className="account-secondary" disabled={busy} onClick={cancel}>Cancel</button><button type="button" className="account-primary" disabled={busy} onClick={() => void disconnect(confirm)}>Disconnect {providerName(confirm)}</button></div>
    </div>}
  </section>;
}
