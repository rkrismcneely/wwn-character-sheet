import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { TalesBrandLink } from "./app-header";
import "./landing-density.css";

/* eslint-disable @next/next/no-img-element -- the small shared static brand mark is served directly */

const playerFeatures = [
  ["✦", "Guided at level 1", "Work through a Worlds Without Number character one meaningful choice at a time, then keep the finished folio in your library."],
  ["⌁", "A rules-aware folio", "Keep attributes, skills, saves, attacks, equipment, spells, Arts, and notes together in the same readable record."],
  ["⚄", "Roll where you play", "Use the sheet's built-in dice controls and roll history without breaking your place at the table."],
  ["◈", "Saved and yours", "Characters are private by default, available from any device, and shareable only when you choose."],
];

function FolioShowcase() {
  return <section className="landing-folio-showcase" aria-label="Example Tales Without End character sheet">
    <div className="landing-folio-bar"><span>CHARACTER FOLIO</span><span><i aria-hidden="true" /> Saved online</span></div>
    <div className="landing-folio-identity">
      <div className="landing-folio-portrait" aria-hidden="true">✦</div>
      <div><p>LEVEL 3 · EXPERT</p><h2>Ilyra Venn</h2><span>Wayfarer, map-maker, and reluctant hero</span></div>
      <div className="landing-folio-vital"><small>HIT POINTS</small><b>14 <span>/ 14</span></b><small>ARMOR CLASS 13</small></div>
    </div>
    <div className="landing-folio-tabs"><b>CORE SHEET</b><span>MAGIC &amp; ARTS</span><span>INVENTORY</span><span>NOTES</span></div>
    <div className="landing-folio-body">
      <section className="landing-folio-card landing-folio-attributes"><h3>Attributes</h3><div>{[["STR", "10"], ["DEX", "14"], ["CON", "12"], ["INT", "13"], ["WIS", "11"], ["CHA", "9"]].map(([label, score]) => <span key={label}><small>{label}</small><b>{score}</b></span>)}</div></section>
      <section className="landing-folio-card"><h3>Skills &amp; saves</h3><p><b>Notice +1</b><b>Connect +1</b><b>Know +0</b></p><p className="landing-folio-muted">Physical 12 · Evasion 10 · Mental 11</p></section>
      <section className="landing-folio-card landing-folio-combat"><h3>Ready for play</h3><p><b>Shortbow</b><span>+1 hit · 1d6 damage</span></p><p><b>Traveling coat</b><span>AC 13 · Shock 1/15</span></p></section>
      <section className="landing-folio-card landing-folio-gear"><h3>Equipment &amp; notes</h3><p>Field journal · lantern · rope · 21 silver</p><div><small>LATEST ROLL</small><b>Notice check <strong>17</strong></b></div></section>
    </div>
    <div className="landing-folio-foot"><span>Interactive fields · click-to-roll tools · printable record</span><span aria-hidden="true">↗</span></div>
  </section>;
}

function CampaignShowcase() {
  return <section className="landing-campaign-showcase" aria-label="Example Tales Without End GM Console">
    <div className="landing-campaign-bar"><span>GM CONSOLE</span><span>LIVE SESSION</span></div>
    <div className="landing-campaign-tabs"><b>Encounter</b><span>Bestiary</span><span>My NPCs</span><span>Party</span></div>
    <div className="landing-campaign-body">
      <div className="landing-campaign-heading"><div><small>ROUND 2</small><strong>The Broken Road</strong></div><b>Moderate</b></div>
      <div className="landing-combatant landing-combatant-pc"><span>→</span><div><b>Ilyra Venn</b><small>Player character</small></div><strong>Init 16</strong><strong>14 / 14 HP</strong><strong>AC 13</strong></div>
      <div className="landing-combatant"><span /> <div><b>Roadside Thug</b><small>Built-In Bestiary</small></div><strong>Init 11</strong><strong>5 / 5 HP</strong><strong>AC 12</strong></div>
      <div className="landing-campaign-tools"><span><b>35</b> SRD creatures</span><span><b>2</b> campaign NPCs</span><span><b>Live</b> rolls</span></div>
    </div>
  </section>;
}

export function LandingPage() {
  return <main className="landing-shell landing-codex">
    <header className="landing-header">
      <TalesBrandLink href="/" />
      <nav aria-label="Signed-out navigation">
        <a href="#character-folio">Character folio</a>
        <a href="#campaign-tools">Campaign tools</a>
        <GoogleSignInButton className="landing-button landing-button-small">Sign in with Google</GoogleSignInButton>
      </nav>
    </header>

    <section className="landing-hero" aria-labelledby="landing-title">
      <div className="landing-hero-copy">
        <p className="landing-kicker">A WORLDS WITHOUT NUMBER PLAY COMPANION</p>
        <h1 id="landing-title">Tales Without End</h1>
        <p className="landing-hero-deck">An online character sheet and campaign companion for Worlds Without Number—built to keep the useful parts of play close at hand.</p>
        <div className="landing-actions">
          <GoogleSignInButton className="landing-button landing-button-primary">Sign in with Google</GoogleSignInButton>
          <Link href="/public-characters" className="landing-button landing-button-secondary">Browse Public Characters</Link>
        </div>
        <ul className="landing-trust" aria-label="Tales Without End highlights"><li>Guided character creation</li><li>Saved online folios</li><li>Campaign-ready tools</li></ul>
      </div>
      <FolioShowcase />
    </section>

    <section id="character-folio" className="landing-features" aria-labelledby="player-features-title">
      <p className="landing-kicker">FROM FIRST CHOICES TO THE NEXT SESSION</p>
      <h2 id="player-features-title">A character sheet made for the table</h2>
      <p className="landing-section-intro">Tales Without End follows the structure of Worlds Without Number while leaving your attention where it belongs: on the adventure.</p>
      <div className="feature-grid">{playerFeatures.map(([icon, title, copy]) => <article key={title}><span aria-hidden="true">{icon}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="landing-detail landing-detail-folio">
      <div>
        <p className="landing-kicker">A USEFUL RECORD, NOT A BLANK FORM</p>
        <h2>Keep every part of your adventurer within reach.</h2>
        <p>Use a detailed, responsive folio for the things that matter during play: class choices, skills, weapons, armor, inventory, spells and Arts, notes, dice, and the history of your recent rolls.</p>
        <ul><li>Built around the current Worlds Without Number SRD</li><li>Print-friendly records for the physical table</li><li>Private, unlisted, and public sharing choices</li></ul>
      </div>
      <div className="landing-detail-card"><span>THE CHARACTER LIBRARY</span><strong>Your adventurers, ready to reopen</strong><p>Save a fresh sheet today and return to the same record from your next device or your next session.</p></div>
    </section>

    <section id="campaign-tools" className="landing-campaign" aria-labelledby="campaign-tools-title">
      <div className="landing-campaign-copy"><p className="landing-kicker">FOR THE WHOLE TABLE</p><h2 id="campaign-tools-title">Bring the campaign ledger to the session.</h2><p>Campaigns connect characters to a GM workspace with encounters, a searchable Built-In Bestiary, editable NPC templates, shared session rolls, and practical threat guidance.</p><ul><li>Organize a party without exposing private folios</li><li>Run encounter order and NPC combat snapshots</li><li>Keep table-facing rolls and campaign tools together</li></ul></div>
      <CampaignShowcase />
    </section>

    <section className="landing-final" aria-labelledby="landing-final-title">
      <img src="/assets/tales-without-end-navigation-logo.svg" alt="" />
      <p className="landing-kicker">YOUR NEXT FOLIO AWAITS</p>
      <h2 id="landing-final-title">Start with the character. Keep the tale.</h2>
      <p>Sign in to create a Worlds Without Number character, or browse the public archive for inspiration.</p>
      <div className="landing-actions"><GoogleSignInButton className="landing-button landing-button-primary">Sign in with Google</GoogleSignInButton><Link href="/public-characters" className="landing-button landing-button-secondary">Browse Public Characters</Link></div>
    </section>
  </main>;
}
