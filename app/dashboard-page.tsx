"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { CharacterVisibility } from "@/lib/characters/authorization";
import "./dashboard.css";

/* eslint-disable @next/next/no-img-element -- the existing navigation mark is a small static asset */

type DashboardCharacter = {
  id: string;
  name: string;
  player: string;
  classLabel: string;
  level: number;
  visibility: CharacterVisibility;
  version: number;
  createdAt: string;
  updatedAt: string;
};

const visibilityLabels: Record<CharacterVisibility, string> = {
  private: "Private",
  unlisted: "Unlisted",
  public: "Public",
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function DashboardPage() {
  const [characters, setCharacters] = useState<DashboardCharacter[]>([]);
  const [busy, setBusy] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [claimToken, setClaimToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const importInput = useRef<HTMLInputElement>(null);

  async function loadCharacters() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/characters?scope=mine", { cache: "no-store" });
      const payload = await response.json() as {
        characters?: DashboardCharacter[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Your character roster could not be loaded.");
      setCharacters(Array.isArray(payload.characters) ? payload.characters : []);
    } catch (loadError) {
      setCharacters([]);
      setError(loadError instanceof Error ? loadError.message : "Your character roster could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/characters?scope=mine", { cache: "no-store" })
      .then(async response => {
        const payload = await response.json() as {
          characters?: DashboardCharacter[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Your character roster could not be loaded.");
        if (active) setCharacters(Array.isArray(payload.characters) ? payload.characters : []);
      })
      .catch(loadError => {
        if (!active) return;
        setCharacters([]);
        setError(loadError instanceof Error ? loadError.message : "Your character roster could not be loaded.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function importCharacter(file?: File) {
    if (!file) return;
    setImportBusy(true);
    setError("");
    setNotice("");
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const isExport = Boolean(
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
        && (parsed as { format?: unknown }).format === "wwn-character-sheet",
      );
      const incoming = isExport
        ? (parsed as { character?: unknown }).character
        : parsed;
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
        throw new Error("That file does not contain a supported character.");
      }
      const character = { ...(incoming as Record<string, unknown>), portrait: "" };
      const body = isExport
        ? { ...(parsed as Record<string, unknown>), character }
        : character;
      const response = await fetch("/api/characters/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error || "That character could not be imported.");
      await loadCharacters();
      setNotice("Imported as a new private character. Open it from your roster when you are ready.");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "That file could not be imported.");
    } finally {
      setImportBusy(false);
      if (importInput.current) importInput.current.value = "";
    }
  }

  async function claimLegacyCharacter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = claimToken.trim();
    if (!token) {
      setError("Enter the one-time claim token you received.");
      return;
    }
    setClaimBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/legacy-claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json() as { claimed?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "The character claim could not be completed.");
      setClaimToken("");
      await loadCharacters();
      const count = Number(payload.claimed) || 0;
      setNotice(`${count} legacy character${count === 1 ? "" : "s"} added to My Characters.`);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "The character claim could not be completed.");
    } finally {
      setClaimBusy(false);
    }
  }

  async function signOut() {
    setSignOutBusy(true);
    setError("");
    try {
      const { error: signOutError } = await authClient.signOut();
      if (signOutError) throw new Error(signOutError.message || "The sign-out request could not be completed.");
      window.location.assign("/");
    } catch (signOutError) {
      setSignOutBusy(false);
      setError(signOutError instanceof Error ? signOutError.message : "The sign-out request could not be completed.");
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link href="/" className="dashboard-brand" aria-label="Tales Without End home">
          <img src="/assets/tales-without-end-navigation-logo.svg" alt="" />
          <span>Tales Without End</span>
        </Link>
        <nav className="dashboard-nav" aria-label="Account navigation">
          <Link href="/public-characters">Browse Public Characters</Link>
          <button type="button" onClick={() => void signOut()} disabled={signOutBusy}>
            {signOutBusy ? "Signing out…" : "Sign Out"}
          </button>
        </nav>
      </header>

      <section className="dashboard-heading" aria-labelledby="dashboard-title">
        <div>
          <p className="dashboard-kicker">THE COMPANY ARCHIVE · PRIVATE ROSTER</p>
          <h1 id="dashboard-title">My Characters</h1>
          <p>Welcome back. Keep your adventurers together, open a folio, or begin the next tale.</p>
        </div>
        <div className="dashboard-heading-actions">
          <Link className="dashboard-primary" href="/?new=1">＋ Create New Character</Link>
          <button type="button" className="dashboard-secondary" onClick={() => importInput.current?.click()} disabled={importBusy}>
            {importBusy ? "Importing…" : "Import Character"}
          </button>
          <input
            ref={importInput}
            className="dashboard-file-input"
            type="file"
            accept="application/json,.json"
            aria-label="Import a character JSON file"
            onChange={event => void importCharacter(event.currentTarget.files?.[0])}
          />
        </div>
      </section>

      {notice && <div className="dashboard-notice" role="status">{notice}</div>}
      {error && <div className="dashboard-error" role="alert">{error}</div>}

      <div className="dashboard-layout">
        <section className="dashboard-roster" aria-labelledby="roster-title">
          <div className="dashboard-section-heading">
            <div>
              <p className="dashboard-kicker">YOUR FOLIOS</p>
              <h2 id="roster-title">Character roster</h2>
            </div>
            <span className="dashboard-count" aria-label={`${characters.length} characters`}>{characters.length}</span>
          </div>

          {busy && <div className="dashboard-state" role="status"><span aria-hidden="true">⌛</span><p>Opening your roster…</p></div>}
          {!busy && !error && characters.length === 0 && (
            <div className="dashboard-state dashboard-empty">
              <span aria-hidden="true">✦</span>
              <h3>Your roster is waiting</h3>
              <p>Create a new folio, import a backup, or use a legacy claim token to bring an adventurer here.</p>
              <Link className="dashboard-primary" href="/?new=1">Create your first character</Link>
            </div>
          )}
          {!busy && characters.length > 0 && (
            <div className="dashboard-card-grid">
              {characters.map(character => (
                <article className="dashboard-card" key={character.id}>
                  <div className="dashboard-card-topline">
                    <span className="dashboard-level">LEVEL <b>{character.level}</b></span>
                    <span className={`dashboard-visibility visibility-${character.visibility}`}>{visibilityLabels[character.visibility]}</span>
                  </div>
                  <h3>{character.name || "Unnamed Character"}</h3>
                  <p className="dashboard-class">{character.classLabel || "Adventurer"}</p>
                  <dl>
                    <div><dt>Updated</dt><dd><time dateTime={character.updatedAt}>{formatUpdatedAt(character.updatedAt)}</time></dd></div>
                    <div><dt>Player</dt><dd>{character.player || "—"}</dd></div>
                  </dl>
                  <Link className="dashboard-open" href={`/character/${character.id}`}>Open character <span aria-hidden="true">→</span></Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="dashboard-sidebar" aria-label="Character tools">
          <section className="dashboard-tool">
            <p className="dashboard-kicker">RECOVER A RECORD</p>
            <h2>Claim a legacy character</h2>
            <p>Enter the private, one-time code supplied by the administrator. Claimed folios become part of your private roster.</p>
            <form onSubmit={claimLegacyCharacter}>
              <label htmlFor="dashboard-claim-token">One-time claim code</label>
              <input id="dashboard-claim-token" value={claimToken} onChange={event => setClaimToken(event.target.value)} autoComplete="off" spellCheck={false} />
              <button type="submit" className="dashboard-secondary" disabled={claimBusy}>{claimBusy ? "Claiming…" : "Claim character"}</button>
            </form>
          </section>
          <section className="dashboard-tool dashboard-public-tool">
            <p className="dashboard-kicker">THE PUBLIC ARCHIVE</p>
            <h2>Find another adventurer</h2>
            <p>Browse characters their owners have chosen to share. Private and unlisted folios stay out of the archive.</p>
            <Link className="dashboard-secondary dashboard-tool-link" href="/public-characters">Browse Public Characters <span aria-hidden="true">→</span></Link>
          </section>
        </aside>
      </div>

      <footer className="dashboard-footer">
        <span>Tales Without End</span>
        <span>Private by default · Owners control sharing</span>
      </footer>
    </main>
  );
}
