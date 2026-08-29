import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { TalesBrandLink } from "./app-header";
import "./landing-density.css";

/* eslint-disable @next/next/no-img-element -- small existing brand SVGs are served directly */

const featureCards = [
  {
    icon: "✦",
    title: "Complete Character Management",
    copy: "Create, edit, and organize your adventurers with every essential detail in one coherent folio.",
  },
  {
    icon: "⌁",
    title: "Rules-Aligned Calculations",
    copy: "Keep attributes, saves, combat values, skills, and progression legible and close at hand.",
  },
  {
    icon: "⚔",
    title: "Built-In Tools",
    copy: "Roll dice, search rules, manage equipment, prepare spells, and print or export from the same sheet.",
  },
  {
    icon: "◈",
    title: "Private by Default",
    copy: "Your characters begin private. Share publicly only when you deliberately choose to.",
  },
];

function CharacterPreview() {
  return (
    <div className="landing-preview" aria-label="Preview of the Tales Without End character folio">
      <div className="preview-toolbar">
        <span>THE COMPANY ARCHIVE</span>
        <span>Saved</span>
      </div>
      <div className="preview-hero">
        <div className="preview-portrait" aria-hidden="true">✥</div>
        <div>
          <small>WANDERING SCHOLAR</small>
          <strong>Mara of the Lantern Road</strong>
          <span>Expert · Level 3</span>
        </div>
        <div className="preview-vital"><small>HP</small><b>14 / 14</b></div>
      </div>
      <div className="preview-tabs"><b>Core</b><span>Magic</span><span>Inventory</span><span>Notes</span></div>
      <div className="preview-grid">
        <section><h3>Attributes</h3><div className="preview-scores">{["STR 10", "DEX 14", "CON 12", "INT 13", "WIS 11", "CHA 9"].map(score => <span key={score}>{score}</span>)}</div></section>
        <section><h3>Skills & Saves</h3><p>Notice +1 · Connect +1 · Shoot +0</p><p>Physical 12 · Evasion 10 · Mental 11</p></section>
        <section className="preview-wide"><h3>Equipment</h3><p>Traveler’s coat · Shortbow · Field journal · Lantern</p></section>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <main className="landing-shell">
      <header className="landing-header">
        <TalesBrandLink href="/" />
        <nav aria-label="Primary navigation">
          <GoogleSignInButton className="landing-button landing-button-small" />
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-kicker">AN INTERACTIVE CHARACTER FOLIO</p>
          <h1 id="landing-title">Your Adventures.<br />Your Characters.<br /><em>Without End.</em></h1>
          <p className="landing-lede">A polished digital character folio for Worlds Without Number—built for creating, managing, and sharing adventurers at the table and between sessions.</p>
          <div className="landing-actions">
            <GoogleSignInButton className="landing-button landing-button-primary">Create Your First Character</GoogleSignInButton>
            <Link href="/public-characters" className="landing-button landing-button-secondary">Browse Public Characters</Link>
          </div>
          <ul className="landing-trust" aria-label="Service highlights">
            <li>Free to use</li>
            <li>Private by default</li>
            <li>Google sign-in</li>
          </ul>
        </div>
        <CharacterPreview />
      </section>

      <section className="landing-features" aria-labelledby="features-title">
        <p className="landing-kicker">EVERYTHING IN ITS PLACE</p>
        <h2 id="features-title">Built for the whole journey</h2>
        <div className="feature-grid">
          {featureCards.map(feature => (
            <article key={feature.title}>
              <span aria-hidden="true">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-detail">
        <div>
          <p className="landing-kicker">A LIVING FOLIO</p>
          <h2>Every detail, ready when the story turns</h2>
          <p>Move from first-level choices to a seasoned adventurer without leaving the sheet. Core statistics, foci, equipment, magic, companions, notes, and table-ready tools stay organized in a readable ledger.</p>
          <ul>
            <li>Clear creation and advancement controls</li>
            <li>Automatic derived values and save tracking</li>
            <li>Built-in dice, rules search, export, and print tools</li>
          </ul>
        </div>
        <div className="detail-card">
          <span>CHARACTER FOLIO</span>
          <strong>One trusted record</strong>
          <p>From the first attribute roll to the final campaign note.</p>
        </div>
      </section>

      <section className="landing-detail landing-detail-reverse">
        <div>
          <p className="landing-kicker">SHARE ON YOUR TERMS</p>
          <h2>Private first. Discoverable when you decide.</h2>
          <p>Characters remain private by default. Owners can make a folio public for the wider table, while unlisted links support direct sharing without placing the character in public browsing.</p>
          <Link href="/public-characters" className="text-link">Explore the public archive <span aria-hidden="true">→</span></Link>
        </div>
        <div className="privacy-card" aria-label="Character visibility choices">
          <div><b>Private</b><span>Only you</span></div>
          <div><b>Unlisted</b><span>Anyone with the link</span></div>
          <div><b>Public</b><span>Visible in the archive</span></div>
        </div>
      </section>

      <section className="landing-final">
        <img src="/assets/tales-without-end-navigation-logo.svg" alt="" />
        <h2>Your next character is waiting.</h2>
        <p>Begin a new folio, bring an existing adventurer online, or explore the public archive.</p>
        <div className="landing-actions">
          <GoogleSignInButton className="landing-button landing-button-primary">Start Your Adventure</GoogleSignInButton>
          <Link href="/public-characters" className="landing-button landing-button-secondary">Browse Public Characters</Link>
        </div>
      </section>
    </main>
  );
}
