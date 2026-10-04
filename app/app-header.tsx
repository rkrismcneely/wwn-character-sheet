"use client";

/* eslint-disable @next/next/no-img-element -- shared static navigation mark */

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { characterSaveDisposition } from "./pending-character-save";
import {
  characterIdFromPathname,
  characterRecoveryStorageKey,
  clearCharacterRecoveryDraft,
  readCharacterRecoveryDraft,
  writeCharacterRecoveryDraft,
} from "./character-save-recovery";

export type AppHeaderDestination =
  | "account"
  | "characters"
  | "campaigns"
  | "public";

const pendingSaveMessage = "Your character still has unsaved changes. Wait for the save to finish or use Save Now before leaving this page.";
const failedSaveMessage = "Your latest character changes are preserved in this browser but are not online yet. Use Save Now to retry, or open the recovery copy before leaving this page.";

function currentCharacterSaveState(): string {
  const status = document.querySelector<HTMLElement>(".app-header .save-state");
  return status?.textContent?.trim() ?? "";
}

function currentCharacterSaveDisposition() {
  return characterSaveDisposition(currentCharacterSaveState());
}

function currentBlockedSaveMessage(): string {
  return currentCharacterSaveDisposition() === "failed"
    ? failedSaveMessage
    : pendingSaveMessage;
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
  const { data: session } = authClient.useSession();
  const ownerUserId = session?.user?.id ?? null;
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [error, setError] = useState("");
  const [recoveryCharacterId, setRecoveryCharacterId] = useState<string | null>(null);

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
        setError(failedSaveMessage);
        return;
      }

      navigationPending = true;
      setError("");
      void waitForPendingCharacterSave().then(saved => {
        navigationPending = false;
        if (saved) window.location.assign(destination.href);
        else setError(currentBlockedSaveMessage());
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

  useEffect(() => {
    if (!ownerUserId) return;

    let trackedCharacterId: string | null = null;
    let sawPendingSave = false;
    let captureInterval: number | null = null;
    let baseVersionPromise: Promise<number | null> | null = null;
    let disposed = false;

    const stopCaptureInterval = () => {
      if (captureInterval === null) return;
      window.clearInterval(captureInterval);
      captureInterval = null;
    };

    const synchronizeTrackedCharacter = () => {
      const nextCharacterId = characterIdFromPathname(window.location.pathname);
      if (nextCharacterId === trackedCharacterId) return nextCharacterId;
      stopCaptureInterval();
      trackedCharacterId = nextCharacterId;
      sawPendingSave = false;
      baseVersionPromise = null;
      const stored = nextCharacterId
        ? readCharacterRecoveryDraft(window.localStorage, nextCharacterId, ownerUserId)
        : null;
      setRecoveryCharacterId(stored ? nextCharacterId : null);
      return nextCharacterId;
    };

    const loadBaseVersion = async (characterId: string): Promise<number | null> => {
      const existing = readCharacterRecoveryDraft(window.localStorage, characterId, ownerUserId);
      if (Number.isInteger(existing?.baseVersion)) return existing!.baseVersion;
      if (!baseVersionPromise) {
        baseVersionPromise = fetch(`/api/characters/${characterId}`, { cache: "no-store" })
          .then(async response => {
            if (!response.ok) return null;
            const payload = await response.json() as { version?: number };
            return Number.isInteger(payload.version) && Number(payload.version) > 0
              ? Number(payload.version)
              : null;
          })
          .catch(() => null);
      }
      return baseVersionPromise;
    };

    const captureRecoveryDraft = async () => {
      const characterId = synchronizeTrackedCharacter();
      if (!characterId) return;
      const raw = window.localStorage.getItem("wwn-cecil-sheet");
      if (!raw) return;

      let character: Record<string, unknown>;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
        character = parsed as Record<string, unknown>;
      } catch {
        return;
      }

      const state = currentCharacterSaveState();
      const existing = readCharacterRecoveryDraft(window.localStorage, characterId, ownerUserId);
      const baseVersion = state === "Newer online copy found"
        ? null
        : existing?.baseVersion ?? await loadBaseVersion(characterId);
      if (disposed || characterId !== synchronizeTrackedCharacter()) return;

      writeCharacterRecoveryDraft(window.localStorage, {
        schema: 1,
        characterId,
        ownerUserId,
        baseVersion,
        savedAt: new Date().toISOString(),
        character,
      });
      setRecoveryCharacterId(characterId);
    };

    const synchronizeRecoveryState = () => {
      const characterId = synchronizeTrackedCharacter();
      if (!characterId) {
        stopCaptureInterval();
        return;
      }

      const disposition = currentCharacterSaveDisposition();
      if (disposition === "pending" || disposition === "failed") {
        sawPendingSave = true;
        void captureRecoveryDraft();
        if (captureInterval === null) {
          captureInterval = window.setInterval(() => {
            void captureRecoveryDraft();
          }, 400);
        }
        return;
      }

      stopCaptureInterval();
      if (sawPendingSave) {
        clearCharacterRecoveryDraft(window.localStorage, characterId);
        setRecoveryCharacterId(null);
        sawPendingSave = false;
        baseVersionPromise = null;
        return;
      }

      const stored = readCharacterRecoveryDraft(window.localStorage, characterId, ownerUserId);
      setRecoveryCharacterId(stored ? characterId : null);
    };

    const retryAfterReconnect = () => {
      synchronizeRecoveryState();
      if (currentCharacterSaveState() !== "Not saved online") return;
      const saveButton = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".app-header-utilities button"),
      ).find(button => /^(Save Now|Save Character)$/u.test(button.textContent?.trim() ?? ""));
      saveButton?.click();
    };

    const recoveryResolvedInAnotherTab = (event: StorageEvent) => {
      const characterId = synchronizeTrackedCharacter();
      if (!characterId || event.key !== characterRecoveryStorageKey(characterId) || event.newValue !== null) return;
      stopCaptureInterval();
      sawPendingSave = false;
      baseVersionPromise = null;
      setRecoveryCharacterId(null);
      if (currentCharacterSaveDisposition() === "failed") {
        window.location.reload();
      }
    };

    const observer = new MutationObserver(synchronizeRecoveryState);
    const header = document.querySelector(".app-header");
    if (header) observer.observe(header, { childList: true, subtree: true, characterData: true });
    const routeInterval = window.setInterval(synchronizeRecoveryState, 750);
    window.addEventListener("online", retryAfterReconnect);
    window.addEventListener("storage", recoveryResolvedInAnotherTab);
    synchronizeRecoveryState();

    return () => {
      disposed = true;
      stopCaptureInterval();
      observer.disconnect();
      window.clearInterval(routeInterval);
      window.removeEventListener("online", retryAfterReconnect);
      window.removeEventListener("storage", recoveryResolvedInAnotherTab);
    };
  }, [ownerUserId]);

  async function signOut() {
    setSignOutBusy(true);
    setError("");
    const safeToLeave = await waitForPendingCharacterSave();
    if (!safeToLeave) {
      setSignOutBusy(false);
      setError(currentBlockedSaveMessage());
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
      {recoveryCharacterId && (
        <div className="app-header-error" role="status">
          A local recovery copy exists for character changes that are not confirmed online.{" "}
          <Link
            href={`/character-recovery?character=${encodeURIComponent(recoveryCharacterId)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open recovery copy
          </Link>
        </div>
      )}
      {error && <div className="app-header-error" role="alert">{error}</div>}
    </>
  );
}
