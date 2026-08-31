"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { CANONICAL_ORIGIN, FALLBACK_WORKER_HOST } from "@/lib/auth-constants";

export function GoogleSignInButton({
  children = "Sign in with Google",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const [message, setMessage] = useState("");
  const authIntentHandled = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (
      authIntentHandled.current
      || url.hostname !== new URL(CANONICAL_ORIGIN).hostname
      || url.searchParams.get("auth") !== "google"
    ) return;

    authIntentHandled.current = true;
    url.searchParams.delete("auth");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setMessage("Opening Google sign-in…");
    void authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
    });
  }, []);

  async function signIn() {
    setMessage("Opening Google sign-in…");

    if (window.location.hostname === FALLBACK_WORKER_HOST) {
      const canonical = new URL(CANONICAL_ORIGIN);
      canonical.searchParams.set("auth", "google");
      window.location.assign(canonical);
      return;
    }

    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (error) throw new Error(error.message || "Google sign-in could not be started.");
    } catch {
      setMessage("Google sign-in could not be started. Please try again.");
    }
  }

  return (
    <span className="google-signin-control provider-signin-control">
      <button type="button" className={`${className ?? ""} provider-signin-button provider-google-button`} onClick={() => void signIn()}>
        <img className="provider-signin-icon provider-google-icon" src="/assets/google-g-mark.png" alt="" aria-hidden="true" />
        <span>{children}</span>
      </button>
      {message && <span className="signin-status" role="status">{message}</span>}
    </span>
  );
}
