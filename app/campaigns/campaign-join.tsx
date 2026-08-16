"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { CANONICAL_ORIGIN, FALLBACK_WORKER_HOST } from "@/lib/auth-constants";

const INVITE_SESSION_KEY = "twe-campaign-invite";
const INVITE_PATTERN = /^cminv_[A-Za-z0-9_-]{43}$/u;

interface JoinCharacterOption {
  id: string;
  name: string;
  classLabel: string;
  level: number;
}

interface JoinPreview {
  campaign: { id: string; name: string };
  characters: JoinCharacterOption[];
}

function inviteError(status: number, message?: string): string {
  if (status === 400) return "This campaign invitation is invalid.";
  if (status === 404) return "This campaign invitation is invalid, expired, or no longer available.";
  if (status === 409 && message?.includes("already a member")) {
    return "You are already part of this campaign. Open it from My Campaigns.";
  }
  if (status === 409) return "This campaign invitation has already been used.";
  return message || "The campaign invitation could not be redeemed.";
}

export function CampaignJoin() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const authIntentHandled = useRef(false);
  const previewHandled = useRef(false);

  async function previewInvite(inviteToken: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/campaign-invites/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      });
      const payload = await response.json() as JoinPreview & { error?: string };
      if (!response.ok || !payload.campaign || !Array.isArray(payload.characters)) {
        const failure = new Error(inviteError(response.status, payload.error));
        Object.assign(failure, { status: response.status });
        throw failure;
      }
      setPreview({
        campaign: payload.campaign,
        characters: payload.characters,
      });
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : 500;
      if (status < 500) sessionStorage.removeItem(INVITE_SESSION_KEY);
      setMessage(error instanceof Error ? error.message : "The campaign invitation could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  async function joinCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || !selectedCharacterId) {
      setMessage("Choose one of your characters to join this campaign.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/campaign-invites/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          characterId: selectedCharacterId,
        }),
      });
      const payload = await response.json() as {
        campaign?: { id: string; name: string };
        character?: JoinCharacterOption;
        error?: string;
      };
      if (!response.ok || !payload.campaign || !payload.character) {
        const failure = new Error(inviteError(response.status, payload.error));
        Object.assign(failure, { status: response.status });
        throw failure;
      }
      sessionStorage.removeItem(INVITE_SESSION_KEY);
      router.replace(`/campaigns/${payload.campaign.id}`);
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : 500;
      if (status === 404 || status === 409) {
        sessionStorage.removeItem(INVITE_SESSION_KEY);
      }
      setMessage(error instanceof Error ? error.message : "The campaign invitation could not be redeemed.");
      setBusy(false);
    }
  }

  useEffect(() => {
    const rawFragment = decodeURIComponent(window.location.hash.slice(1)).trim();
    const fragmentToken = INVITE_PATTERN.test(rawFragment) ? rawFragment : "";
    if (fragmentToken) sessionStorage.setItem(INVITE_SESSION_KEY, fragmentToken);
    const storedToken = fragmentToken || sessionStorage.getItem(INVITE_SESSION_KEY) || "";
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    }
    // Session storage survives the OAuth round trip in this tab and is cleared
    // after a terminal result. The URL fragment never reaches request logs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(INVITE_PATTERN.test(storedToken) ? storedToken : "");
    setReady(true);
  }, []);

  useEffect(() => {
    if (isPending || session?.user || authIntentHandled.current) return;
    const url = new URL(window.location.href);
    if (
      url.hostname !== new URL(CANONICAL_ORIGIN).hostname
      || url.searchParams.get("auth") !== "google"
    ) return;
    authIntentHandled.current = true;
    url.searchParams.delete("auth");
    window.history.replaceState(window.history.state, "", url.pathname);
    void authClient.signIn.social({ provider: "google", callbackURL: "/campaigns/join" });
  }, [isPending, session?.user]);

  useEffect(() => {
    if (!ready || isPending || !session?.user || previewHandled.current) return;
    if (!token) {
      sessionStorage.removeItem(INVITE_SESSION_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessage("This campaign invitation is invalid.");
      return;
    }
    previewHandled.current = true;
    void previewInvite(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, ready, session?.user, token]);

  async function signIn() {
    if (!token) {
      setMessage("This campaign invitation is invalid.");
      return;
    }
    setBusy(true);
    setMessage("Opening Google sign-in…");
    if (window.location.hostname === FALLBACK_WORKER_HOST) {
      const canonical = new URL("/campaigns/join", CANONICAL_ORIGIN);
      canonical.searchParams.set("auth", "google");
      canonical.hash = token;
      window.location.assign(canonical);
      return;
    }
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/campaigns/join",
      });
      if (error) throw new Error(error.message || "Google sign-in could not be started.");
    } catch {
      setBusy(false);
      setMessage("Google sign-in could not be started. Please try again.");
    }
  }

  const signedIn = Boolean(session?.user);
  const selectedCharacter = preview?.characters.find(character => character.id === selectedCharacterId);
  return (
    <main className="campaign-shell">
      <header className="campaign-header">
        <Link href="/" className="campaign-brand">Tales Without End</Link>
        <nav aria-label="Campaign invitation navigation"><Link href="/campaigns">My Campaigns</Link></nav>
      </header>
      <section className="campaign-join-page" aria-labelledby="campaign-join-title">
        <div className="campaign-join-card">
          <span aria-hidden="true">✦</span>
          <p className="campaign-kicker">A PRIVATE INVITATION</p>
          <h1 id="campaign-join-title">{preview ? "Choose Your Character" : "Join the Campaign"}</h1>
          {!signedIn && <p>Sign in with Google to accept this private, single-use campaign invitation.</p>}
          {signedIn && preview && (
            <p>Select the one character who will join <strong>{preview.campaign.name}</strong>. Your other characters remain unrelated.</p>
          )}
          {message && <div className="campaign-error" role="alert">{message}</div>}
          {!isPending && !signedIn && (
            <div className="campaign-join-actions">
              <button type="button" className="campaign-primary" onClick={() => void signIn()} disabled={busy || !ready}>
                Sign in with Google to Join
              </button>
            </div>
          )}
          {signedIn && preview && preview.characters.length > 0 && (
            <form onSubmit={joinCampaign}>
              <fieldset className="campaign-join-character-list">
                <legend>Choose one character</legend>
                {preview.characters.map(character => (
                  <label key={character.id} className="campaign-join-character">
                    <input
                      type="radio"
                      name="campaign-character"
                      value={character.id}
                      checked={selectedCharacterId === character.id}
                      onChange={() => setSelectedCharacterId(character.id)}
                    />
                    <span><strong>{character.name}</strong><small>{character.classLabel} · Level {character.level}</small></span>
                  </label>
                ))}
              </fieldset>
              <button type="submit" className="campaign-primary" disabled={busy || !selectedCharacter}>
                {busy
                  ? "Joining…"
                  : selectedCharacter
                    ? `Join ${preview.campaign.name} as ${selectedCharacter.name}`
                    : "Choose a Character"}
              </button>
            </form>
          )}
          {signedIn && preview && preview.characters.length === 0 && (
            <div className="campaign-link-empty" role="status">
              <strong>You need an owned character to join.</strong>
              <p>Create or claim a character from My Characters, then return with this invitation.</p>
              <Link href="/" className="campaign-secondary">Open My Characters</Link>
            </div>
          )}
          {(isPending || (signedIn && busy && !preview)) && <p role="status">Checking your invitation…</p>}
          {(message || !token) && <Link href="/campaigns" className="campaign-secondary">Open My Campaigns</Link>}
        </div>
      </section>
    </main>
  );
}
