"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SignedInHeader } from "../app-header";
import type { AccountProfilePayload } from "@/lib/account/profile";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/account/display-name";
import { rollDice } from "../dice";
import { ThemeSelect, useDisplayTheme } from "../theme-provider";
import {
  DiceStyleSelect,
  useDiceStylePreference,
  VirtualDiceSelect,
} from "../virtual-dice-preference";
import { VirtualDiceOverlay, type VirtualDiceOverlayHandle } from "../virtual-dice-overlay";
import { STANDARD_RPG_DICE_SIDES } from "../virtual-dice-style";
import { ConnectedAccounts } from "./connected-accounts";

function DicePreviewControl() {
  const { theme } = useDisplayTheme();
  const { style } = useDiceStylePreference();
  const overlay = useRef<VirtualDiceOverlayHandle>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewMessage, setPreviewMessage] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  async function previewDice() {
    setPreviewMessage("");
    if (reducedMotion) {
      setPreviewMessage("Your reduced-motion preference is enabled, so the animated dice preview is skipped.");
      return;
    }

    let dice: Array<{ sides: number; value: number }>;
    try {
      dice = STANDARD_RPG_DICE_SIDES.map(sides => {
        const roll = rollDice(1, sides);
        return { sides, value: roll.results[0] };
      });
    } catch {
      setPreviewMessage("Dice preview is unavailable because secure browser randomness could not be accessed.");
      return;
    }

    setPreviewBusy(true);
    let watchdog: number | undefined;
    try {
      const animation = overlay.current?.roll({ dice, style });
      if (!animation) throw new Error("The virtual dice preview is unavailable.");
      const timeout = new Promise<never>((_, reject) => {
        watchdog = window.setTimeout(
          () => reject(new Error("The virtual dice preview timed out.")),
          15_000,
        );
      });
      await Promise.race([animation, timeout]);
      setPreviewMessage("Preview complete. No character roll or history entry was created.");
    } catch {
      overlay.current?.cancel();
      setPreviewMessage("The dice preview could not be shown. Normal character rolling remains unchanged.");
    } finally {
      if (watchdog !== undefined) window.clearTimeout(watchdog);
      setPreviewBusy(false);
    }
  }

  return (
    <>
      <VirtualDiceOverlay ref={overlay} theme={theme} />
      <div className="account-dice-preview">
        <button
          type="button"
          className="account-secondary"
          onClick={() => void previewDice()}
          disabled={previewBusy}
          aria-busy={previewBusy || undefined}
          aria-describedby="account-test-dice-guidance"
        >
          {previewBusy ? "Testing Dice…" : "Test Dice"}
        </button>
        <small id="account-test-dice-guidance">
          Throws one d4, d6, d8, d10, d12, and d20 using this Dice Style. It is a visual preview only and works even when Virtual Dice is Off.
        </small>
        <p className="account-dice-preview-status" role="status" aria-live="polite">{previewMessage}</p>
      </div>
    </>
  );
}

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

  async function resetToProviderName() {
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
      setNotice("Your original profile name is now used throughout Tales Without End.");
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
        <p>Choose the name other players see, set your preferred appearance, and move between your private rosters.</p>
      </section>

      {notice && <div className="account-notice" role="status">{notice}</div>}
      {error && <div className="account-error" role="alert">{error}</div>}

      <div className="account-layout">
        <div className="account-main-panels">
          <section className="account-panel" aria-labelledby="username-title">
          <div className="account-section-heading">
            <div>
              <p className="account-kicker">APPLICATION IDENTITY</p>
              <h2 id="username-title">Username</h2>
            </div>
            <span>{profile.usesProviderName ? "Profile fallback" : "Custom"}</span>
          </div>
          <p className="account-explanation">
            This is your public display name inside Tales Without End. It appears in
            campaign rosters and beside your linked campaign characters. It does not
            change your connected accounts or sign-in.
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
                onClick={() => void resetToProviderName()}
                disabled={busy || profile.usesProviderName}
              >
                Use Original Name
              </button>
            </div>
          </form>
          <dl className="account-provider">
            <div><dt>Current display</dt><dd>{profile.effectiveDisplayName}</dd></div>
            <div><dt>Original profile name</dt><dd>{profile.providerName}</dd></div>
            <div><dt>Signed in as</dt><dd>{profile.email}</dd></div>
          </dl>
          </section>

          <ConnectedAccounts />

          <section className="account-panel account-appearance" aria-labelledby="appearance-title">
          <div className="account-section-heading">
            <div>
              <p className="account-kicker">PREFERENCES</p>
              <h2 id="appearance-title">Appearance</h2>
            </div>
          </div>
          <p className="account-explanation">
            Choose the Tales Without End presentation used throughout this browser.
          </p>
          <div className="account-theme-control">
            <label htmlFor="account-display-theme">Theme</label>
            <ThemeSelect
              id="account-display-theme"
              describedBy="account-theme-guidance"
            />
            <small id="account-theme-guidance">
              Applies immediately across your characters, campaigns, account, and public archive.
            </small>
          </div>
          <div className="account-theme-control account-virtual-dice-control">
            <VirtualDiceSelect
              id="account-virtual-dice"
              describedBy="account-virtual-dice-guidance"
            />
            <small id="account-virtual-dice-guidance">
              When enabled, rolls show opt-in animated 3D dice. Your browser generates the result first; reduced-motion settings and renderer failures use the normal instant result.
            </small>
          </div>
          <div className="account-theme-control account-dice-style-control">
            <DiceStyleSelect
              id="account-dice-style"
              describedBy="account-dice-style-guidance"
            />
            <small id="account-dice-style-guidance">
              Choose the dice set used for future virtual rolls and for the preview below. This stays in this browser and is separate from Virtual Dice On or Off.
            </small>
            <DicePreviewControl />
          </div>
          </section>
        </div>

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
