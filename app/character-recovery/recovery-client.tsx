"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SignedInHeader } from "../app-header";
import {
  canRestoreRecoveryToOriginal,
  clearCharacterRecoveryDraft,
  readCharacterRecoveryDraft,
  type CharacterRecoveryDraft,
} from "../character-save-recovery";

function recoveryName(draft: CharacterRecoveryDraft | null): string {
  const value = draft?.character?.name;
  return typeof value === "string" && value.trim() ? value.trim() : "Recovered Character";
}

export function CharacterRecoveryClient({
  characterId,
  ownerUserId,
}: {
  characterId: string;
  ownerUserId: string;
}) {
  const [draft, setDraft] = useState<CharacterRecoveryDraft | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [originalExists, setOriginalExists] = useState(false);
  const [canEditOriginal, setCanEditOriginal] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    const localDraft = readCharacterRecoveryDraft(
      window.localStorage,
      characterId,
      ownerUserId,
    );
    setDraft(localDraft);
    if (!localDraft) {
      setLoaded(true);
      return;
    }

    void fetch(`/api/characters/${characterId}`, { cache: "no-store" })
      .then(async response => {
        if (cancelled) return;
        if (response.status === 404) {
          setOriginalExists(false);
          setCurrentVersion(null);
          return;
        }
        const payload = await response.json() as {
          version?: number;
          permissions?: { canEdit?: boolean };
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "The online character could not be checked.");
        setOriginalExists(true);
        setCanEditOriginal(Boolean(payload.permissions?.canEdit));
        setCurrentVersion(Number.isInteger(payload.version) ? Number(payload.version) : null);
      })
      .catch(checkError => {
        if (!cancelled) {
          setError(checkError instanceof Error ? checkError.message : "The online character could not be checked.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [characterId, ownerUserId]);

  const name = recoveryName(draft);
  const safeToRestoreOriginal = useMemo(
    () => Boolean(
      draft
      && originalExists
      && canEditOriginal
      && canRestoreRecoveryToOriginal(draft, currentVersion)
    ),
    [canEditOriginal, currentVersion, draft, originalExists],
  );

  async function restoreOriginal() {
    if (!draft || !safeToRestoreOriginal || currentVersion === null) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/characters/${characterId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ character: draft.character, version: currentVersion }),
      });
      const payload = await response.json() as { version?: number; currentVersion?: number; error?: string };
      if (response.status === 409) {
        setCurrentVersion(Number.isInteger(payload.currentVersion) ? Number(payload.currentVersion) : null);
        throw new Error("The online character changed before recovery finished. Nothing was overwritten; save the recovery as a new copy instead.");
      }
      if (!response.ok || !payload.version) {
        throw new Error(payload.error || "The recovery copy could not be restored online.");
      }
      clearCharacterRecoveryDraft(window.localStorage, characterId);
      window.location.assign(`/character/${characterId}`);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "The recovery copy could not be restored online.");
      setBusy(false);
    }
  }

  async function saveAsNewCopy() {
    if (!draft) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const character = { ...draft.character, portrait: "" };
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ character }),
      });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || "A recovered copy could not be created.");
      }
      clearCharacterRecoveryDraft(window.localStorage, characterId);
      window.location.assign(`/character/${payload.id}`);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "A recovered copy could not be created.");
      setBusy(false);
    }
  }

  function downloadRecovery() {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft.character, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name.replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "") || "character"}-recovery.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice("Recovery JSON downloaded. The browser recovery copy is still available until you restore, duplicate, or discard it.");
  }

  function discardRecovery() {
    if (!draft || !window.confirm("Discard this browser recovery copy?\n\nThis removes only the unsynced recovery draft. It does not delete the online character.")) return;
    clearCharacterRecoveryDraft(window.localStorage, characterId);
    setDraft(null);
    setNotice("Browser recovery copy discarded. The online character was not changed.");
  }

  const guidance = !draft
    ? "No recovery copy for this character is available in this browser and account."
    : safeToRestoreOriginal
      ? "The online character is still the exact version this recovery copy was based on, so it is safe to restore the local changes to the original."
      : !originalExists
        ? "The original online character is no longer available. The recovery can still be saved as a new private character."
        : !canEditOriginal
          ? "This account can no longer edit the original character. The recovery can still be saved as a new private character."
          : draft.baseVersion === null
            ? "The recovery copy could not prove which online version it was based on. To avoid overwriting newer data, restore-to-original is disabled; save it as a new private character instead."
            : "The online character has changed since this recovery copy was made. Nothing will overwrite that newer copy; save the recovery as a new private character instead.";

  return (
    <main className="campaign-shell">
      <SignedInHeader active="characters" />
      <section className="campaign-hero" aria-labelledby="character-recovery-title">
        <div>
          <p className="campaign-kicker">LOCAL SAVE RECOVERY</p>
          <h1 id="character-recovery-title">Recover Character Changes</h1>
          <p>Use this only when an online character save was interrupted or failed.</p>
        </div>
      </section>

      {!loaded ? (
        <div className="campaign-page-state" role="status">Checking the browser recovery copy…</div>
      ) : (
        <section className="campaign-panel" aria-labelledby="recovery-copy-title">
          <div className="campaign-section-heading">
            <div>
              <p className="campaign-kicker">PRESERVED IN THIS BROWSER</p>
              <h2 id="recovery-copy-title">{draft ? name : "No recovery copy found"}</h2>
            </div>
          </div>

          <p>{guidance}</p>
          {draft && <p><strong>Recovery saved:</strong> {new Date(draft.savedAt).toLocaleString()}</p>}
          {draft && <p><strong>Recovery base version:</strong> {draft.baseVersion ?? "unverified"}{currentVersion ? ` · Current online version: ${currentVersion}` : ""}</p>}
          {error && <div className="campaign-error" role="alert">{error}</div>}
          {notice && <div className="campaign-notice" role="status">{notice}</div>}

          {draft && (
            <div className="campaign-management-actions">
              <button
                type="button"
                className="campaign-primary"
                onClick={() => void restoreOriginal()}
                disabled={busy || !safeToRestoreOriginal}
              >
                {busy && safeToRestoreOriginal ? "Restoring…" : "Restore to Original"}
              </button>
              <button
                type="button"
                className="campaign-secondary"
                onClick={() => void saveAsNewCopy()}
                disabled={busy}
              >
                {busy && !safeToRestoreOriginal ? "Saving Copy…" : "Save as New Private Copy"}
              </button>
              <button type="button" className="campaign-secondary" onClick={downloadRecovery} disabled={busy}>
                Download Recovery JSON
              </button>
              <button type="button" className="campaign-danger" onClick={discardRecovery} disabled={busy}>
                Discard Recovery Copy
              </button>
            </div>
          )}

          <p className="campaign-management-note">
            Creating a new recovery copy intentionally leaves its portrait blank so the new character does not share the original character&apos;s uploaded image object. You can upload the portrait again afterward.
          </p>
          <div className="campaign-dialog-actions">
            {originalExists ? <Link className="campaign-secondary" href={`/character/${characterId}`}>Open Online Character</Link> : <Link className="campaign-secondary" href="/">Return to My Characters</Link>}
          </div>
        </section>
      )}
    </main>
  );
}
