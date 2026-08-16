"use client";

import Link from "next/link";
import { useState } from "react";
import { SignedInHeader } from "../app-header";
import type { AccountProfilePayload } from "@/lib/account/profile";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/account/display-name";

export function AccountPageClient({
  initialProfile,
}: {
  initialProfile: AccountProfilePayload;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [displayName, setDisplayName] = useState(
    initialProfile.displayName ?? initialProfile.effectiveDisplayName,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function saveDisplayName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const payload = await response.json() as {
        profile?: AccountProfilePayload;
        error?: string;
      };
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error || "Your username could not be saved.");
      }
      setProfile(payload.profile);
      setDisplayName(payload.profile.effectiveDisplayName);
      setNotice("Your Tales Without End username has been updated.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Your username could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetToGoogleName() {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/account/profile", { method: "DELETE" });
      const payload = await response.json() as {
        profile?: AccountProfilePayload;
        error?: string;
      };
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error || "Your username could not be reset.");
      }
      setProfile(payload.profile);
      setDisplayName(payload.profile.effectiveDisplayName);
      setNotice("Your Google profile name is now used throughout Tales Without End.");
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Your username could not be reset.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-shell">
      <SignedInHeader active="account" />

      <section className="account-hero" aria-labelledby="account-title">
        <p className="account-kicker">THE COMPANY ARCHIVE · YOUR PROFILE</p>
        <h1 id="account-title">Account</h1>
        <p>Choose the name other players see and move between your private rosters.</p>
      </section>

      {notice && <div className="account-notice" role="status">{notice}</div>}
      {error && <div className="account-error" role="alert">{error}</div>}

      <div className="account-layout">
        <section className="account-panel" aria-labelledby="username-title">
          <div className="account-section-heading">
            <div>
              <p className="account-kicker">APPLICATION IDENTITY</p>
              <h2 id="username-title">Username</h2>
            </div>
            <span>{profile.usesProviderName ? "Google fallback" : "Custom"}</span>
          </div>
          <p className="account-explanation">
            This is your public display name inside Tales Without End. It appears in
            campaign rosters and beside your linked campaign characters. It does not
            change your Google account or sign-in.
          </p>
          <form onSubmit={saveDisplayName} className="account-form">
            <label htmlFor="account-display-name">Username</label>
            <input
              id="account-display-name"
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              autoComplete="nickname"
              aria-describedby="account-name-guidance"
            />
            <small id="account-name-guidance">
              2–{DISPLAY_NAME_MAX_LENGTH} visible characters. Spaces and punctuation are welcome.
            </small>
            <div className="account-actions">
              <button type="submit" className="account-primary" disabled={busy}>
                {busy ? "Saving…" : "Save Username"}
              </button>
              <button
                type="button"
                className="account-secondary"
                onClick={() => void resetToGoogleName()}
                disabled={busy || profile.usesProviderName}
              >
                Use Google Name
              </button>
            </div>
          </form>
          <dl className="account-provider">
            <div><dt>Current display</dt><dd>{profile.effectiveDisplayName}</dd></div>
            <div><dt>Google profile name</dt><dd>{profile.providerName}</dd></div>
            <div><dt>Signed in as</dt><dd>{profile.email}</dd></div>
          </dl>
        </section>

        <aside className="account-destinations" aria-label="Signed-in destinations">
          <Link href="/" className="account-destination">
            <span aria-hidden="true">✦</span>
            <div><strong>My Characters</strong><small>Open your private character roster.</small></div>
            <b aria-hidden="true">→</b>
          </Link>
          <Link href="/campaigns" className="account-destination">
            <span aria-hidden="true">⌁</span>
            <div><strong>My Campaigns</strong><small>Manage companies, members, and shared characters.</small></div>
            <b aria-hidden="true">→</b>
          </Link>
          <Link href="/public-characters" className="account-destination">
            <span aria-hidden="true">◈</span>
            <div><strong>Public Characters</strong><small>Browse the public archive.</small></div>
            <b aria-hidden="true">→</b>
          </Link>
        </aside>
      </div>
    </main>
  );
}
