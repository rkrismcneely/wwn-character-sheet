"use client";

/* eslint-disable @next/next/no-img-element -- shared static navigation mark */

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { characterSaveDisposition } from "./pending-character-save";

export type AppHeaderDestination =
  | "account"
  | "characters"
  | "campaigns"
  | "public";

const pendingSaveMessage = "Your character still has unsaved changes. Wait for the save to finish or use Save Now before leaving this page.";

function currentCharacterSaveDisposition() {
  const status = document.querySelector<HTMLElement>(".app-header .save-state");
  return characterSaveDisposition(status?.textContent);
}

function waitForPendingCharacterSave(timeoutMs = 20_000): Promise<boolean> {
  const initial = currentCharacterSaveDisposition();
  if (initial === "safe") return Promise.resolve(true);
  if (initial === "failed") return Promise.resolve(false);

  return new Promise(resolve => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      resolve(result);
    };
    const check = () => {
      const disposition = currentCharacterSaveDisposition();
      if (disposition === "safe") finish(true);
      else if (disposition === "failed") finish(false);
    };
    const interval = window.setInterval(check, 50);
    const timeout = window.setTimeout(() => finish(false), timeoutMs);
    check();
  });
}

export function TalesBrandLink({
  href,
}: {
  href: string;
}) {
  return (
    <Link
      href={href}
      className="twe-brand"
      aria-label="Tales Without End"
    >
      <img
        className="twe-brand-logo"
        src="/assets/tales-without-end-navigation-logo.svg"
        alt=""
      />
      <strong>Tales Without End</strong>
    </Link>
  );
}

export function SignedInHeader({
  active,
  utilities,
}: {
  active?: AppHeaderDestination;
  utilities?: ReactNode;
}) {
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let navigationPending = false;

    const handleNavigationClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) return;
      const element = event.target instanceof Element ? event.target : null;
      const anchor = element?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      const disposition = currentCharacterSaveDisposition();
      if (disposition === "safe") return;

      event.preventDefault();
      event.stopPropagation();
      if (navigationPending) return;
      if (disposition === "failed") {
        setError(pendingSaveMessage);
        return;
      }

      navigationPending = true;
      setError("");
      void waitForPendingCharacterSave().then(saved => {
        navigationPending = false;
        if (saved) window.location.assign(destination.href);
        else setError(pendingSaveMessage);
      });
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (currentCharacterSaveDisposition() === "safe") return;
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("click", handleNavigationClick, true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("click", handleNavigationClick, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  async function signOut() {
    setSignOutBusy(true);
    setError("");
    const safeToLeave = await waitForPendingCharacterSave();
    if (!safeToLeave) {
      setSignOutBusy(false);
      setError(pendingSaveMessage);
      return;
    }
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
        {utilities && <div className="app-header-utilities" aria-label="Character controls">{utilities}</div>}
        <nav aria-label="Signed-in navigation">
          {link("account", "/account", "Account")}
          {link("characters", "/", "My Characters")}
          {link("campaigns", "/campaigns", "My Campaigns")}
          <button type="button" onClick={() => void signOut()} disabled={signOutBusy}>
            {signOutBusy ? "Signing out…" : "Sign Out"}
          </button>
        </nav>
      </header>
      {error && <div className="app-header-error" role="alert">{error}</div>}
    </>
  );
}
