"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SignedInHeader } from "./app-header";
import type { CharacterVisibility } from "@/lib/characters/authorization";
import "./dashboard.css";

type DashboardCharacter = {
  id: string;
  name: string;
  player: string;
  classLabel: string;
  level: number;
  visibility: CharacterVisibility;
  archivedAt: string | null;
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
  const [lifecycleBusy, setLifecycleBusy] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const importInput = useRef<HTMLInputElement>(null);

  async function loadCharacters() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/characters?scope=mine&archive=all", { cache: "no-store" });
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
    fetch("/api/characters?scope=mine&archive=all", { cache: "no-store" })
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


  const activeCharacters = characters.filter(character => !character.archivedAt);
  const archivedCharacters = characters.filter(character => Boolean(character.archivedAt));

  async function setArchived(character: DashboardCharacter, archived: boolean) {
    if (archived && !window.confirm(`Archive ${character.name || "this character"}? Existing campaign links and character data will be preserved.`)) return;
    setLifecycleBusy(character.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/characters/${character.id}/archive`, {
        method: archived ? "POST" : "DELETE",
      });
      const payload = await response.json() as { archivedAt?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error || `The character could not be ${archived ? "archived" : "restored"}.`);
      await loadCharacters();
      setNotice(`${character.name || "Character"} ${archived ? "archived" : "restored"}.`);
    } catch (lifecycleError) {
      setError(lifecycleError instanceof Error ? lifecycleError.message : "The character lifecycle could not be changed.");
    } finally {
      setLifecycleBusy(null);
    }
  }

  async function duplicate(character: DashboardCharacter) {
    setLifecycleBusy(character.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/characters/${character.id}/duplicate`, { method: "POST" });
      const payload = await response.json() as { character?: { id: string; name: string }; error?: string };
      if (!response.ok || !payload.character) throw new Error(payload.error || "The character could not be duplicated.");
      await loadCharacters();
      setNotice(`${payload.character.name} was created as a new private character.`);
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "The character could not be duplicated.");
    } finally {
      setLifecycleBusy(null);
    }
  }

  function characterCard(character: DashboardCharacter) {
    const working = lifecycleBusy === character.id;
    return <article className={`dashboard-card${character.archivedAt ? " dashboard-card-archived" : ""}`} key={character.id}>
      <div className="dashboard-card-topline">
        <span className="dashboard-level">LEVEL <b>{character.level}</b></span>
        <span className={`dashboard-visibility visibility-${character.visibility}`}>{character.archivedAt ? "Archived" : visibilityLabels[character.visibility]}</span>
      </div>
      <h3>{character.name || "Unnamed Character"}</h3>
      <p className="dashboard-class">{character.classLabel || "Adventurer"}</p>
      <dl>
        <div><dt>Updated</dt><dd><time dateTime={character.updatedAt}>{formatUpdatedAt(character.updatedAt)}</time></dd></div>
        <div><dt>Player</dt><dd>{character.player || "—"}</dd></div>
      </dl>
      <div className="dashboard-card-actions">
        <Link className="dashboard-open" href={`/character/${character.id}`}>Open character <span aria-hidden="true">→</span></Link>
        <button type="button" className="dashboard-secondary" onClick={() => void duplicate(character)} disabled={working}>Duplicate</button>
        <button type="button" className="dashboard-secondary" onClick={() => void setArchived(character, !character.archivedAt)} disabled={working}>
          {working ? "Working…" : character.archivedAt ? "Restore" : "Archive"}
        </button>
      </div>
    </article>;
  }

  return (
    <main className="dashboard-shell">
      <SignedInHeader active="characters" />

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
            <span className="dashboard-count" aria-label={`${activeCharacters.length} active characters`}>{activeCharacters.length}</span>
          </div>

          {busy && <div className="dashboard-state" role="status"><span aria-hidden="true">⌛</span><p>Opening your roster…</p></div>}
          {!busy && !error && activeCharacters.length === 0 && (
            <div className="dashboard-state dashboard-empty">
              <span aria-hidden="true">✦</span>
              <h3>Your roster is waiting</h3>
              <p>Create a new folio, import a backup, or use a legacy claim token to bring an adventurer here.</p>
              <Link className="dashboard-primary" href="/?new=1">Create your first character</Link>
            </div>
          )}
          {!busy && activeCharacters.length > 0 && (
            <div className="dashboard-card-grid">
              {activeCharacters.map(character => (
                characterCard(character)
              ))}
            </div>
          )}
          {!busy && archivedCharacters.length > 0 && <section className="dashboard-archived" aria-labelledby="archived-characters-title">
            <div className="dashboard-section-heading dashboard-archived-heading"><div><p className="dashboard-kicker">RETIRED FOLIOS</p><h2 id="archived-characters-title">Archived Characters</h2></div><span className="dashboard-count">{archivedCharacters.length}</span></div>
            <div className="dashboard-card-grid">{archivedCharacters.map(characterCard)}</div>
          </section>}
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
