"use client";

/* eslint-disable @next/next/no-img-element -- shared static navigation mark */

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export type AppHeaderDestination =
  | "account"
  | "characters"
  | "campaigns"
  | "public";

export function TalesBrandLink({
  href,
  className = "",
}: {
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`twe-brand ${className}`.trim()}
      aria-label="Tales Without End"
    >
      <img
        className="twe-brand-logo brand-logo"
        src="/assets/tales-without-end-navigation-logo.svg"
        alt=""
      />
      <strong>Tales Without End</strong>
    </Link>
  );
}

export function SignedInHeader({
  active,
}: {
  active?: AppHeaderDestination;
}) {
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setSignOutBusy(true);
    setError("");
    try {
      const { error: signOutError } = await authClient.signOut();
      if (signOutError) {
        throw new Error(signOutError.message || "Sign out could not be completed.");
      }
      window.location.assign("/");
    } catch (signOutError) {
      setSignOutBusy(false);
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Sign out could not be completed.",
      );
    }
  }

  const link = (
    destination: AppHeaderDestination,
    href: string,
    label: string,
  ) => (
    <Link href={href} aria-current={active === destination ? "page" : undefined}>
      {label}
    </Link>
  );

  return (
    <>
      <header className="app-header">
        <TalesBrandLink href="/account" />
        <nav aria-label="Signed-in navigation">
          {link("account", "/account", "Account")}
          {link("characters", "/", "My Characters")}
          {link("campaigns", "/campaigns", "My Campaigns")}
          {link("public", "/public-characters", "Public Characters")}
          <button type="button" onClick={() => void signOut()} disabled={signOutBusy}>
            {signOutBusy ? "Signing out…" : "Sign Out"}
          </button>
        </nav>
      </header>
      {error && <div className="app-header-error" role="alert">{error}</div>}
    </>
  );
}
