"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-providers";
import { CANONICAL_ORIGIN, FALLBACK_WORKER_HOST } from "@/lib/auth-constants";

export function DiscordSignInButton({ className }: { className?: string }) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/sign-in-providers", { cache: "no-store" }).then(response => response.ok ? response.json() as Promise<{ providers?: string[] }> : null)
      .then(data => { if (active) setAvailable(data?.providers?.includes("discord") === true); }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function signIn() {
    if (window.location.hostname === FALLBACK_WORKER_HOST) {
      window.location.assign(CANONICAL_ORIGIN);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.signIn.social({ provider: "discord", callbackURL: "/", errorCallbackURL: "/auth/error" });
      if (result.error) { setMessage(authErrorMessage(result.error.code)); setBusy(false); }
    } catch { setMessage(authErrorMessage()); setBusy(false); }
  }
  if (!available) return null;
  return <span className="google-signin-control">
    <button type="button" className={className} disabled={busy} onClick={() => void signIn()}>Continue with Discord</button>
    {message && <span className="signin-status" role="alert">{message}</span>}
  </span>;
}
