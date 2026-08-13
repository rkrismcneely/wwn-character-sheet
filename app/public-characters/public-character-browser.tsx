"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PublicCharacter = {
  id: string;
  name: string;
  player: string;
  classLabel: string;
  level: number;
  updatedAt: string;
};

export function PublicCharacterBrowser() {
  const [characters, setCharacters] = useState<PublicCharacter[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  async function load(nextQuery = "") {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ scope: "public" });
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      const response = await fetch(`/api/characters?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const payload = await response.json() as { characters?: PublicCharacter[] };
      setCharacters(Array.isArray(payload.characters) ? payload.characters : []);
    } catch {
      setCharacters([]);
      setError("The public archive is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/characters?scope=public", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ characters?: PublicCharacter[] }>;
      })
      .then(payload => {
        if (!active) return;
        setCharacters(Array.isArray(payload.characters) ? payload.characters : []);
      })
      .catch(() => {
        if (!active) return;
        setError("The public archive is temporarily unavailable.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="public-browser" aria-labelledby="public-results-title">
      <form onSubmit={event => { event.preventDefault(); void load(query); }}>
        <label htmlFor="public-character-search">Search public characters</label>
        <div>
          <input id="public-character-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, player, or class" />
          <button type="submit">Search</button>
        </div>
      </form>
      <h2 id="public-results-title" className="sr-only">Character results</h2>
      {busy && <p className="public-state" role="status">Opening the archive…</p>}
      {error && <p className="public-state public-error" role="alert">{error}</p>}
      {!busy && !error && characters.length === 0 && <p className="public-state">No public characters found.</p>}
      <div className="public-card-grid">
        {characters.map(character => (
          <article key={character.id}>
            <span>LEVEL {character.level}</span>
            <h3>{character.name}</h3>
            <p>{character.classLabel}{character.player ? ` · ${character.player}` : ""}</p>
            <Link href={`/character/${character.id}`}>View read-only folio <span aria-hidden="true">→</span></Link>
          </article>
        ))}
      </div>
    </section>
  );
}
