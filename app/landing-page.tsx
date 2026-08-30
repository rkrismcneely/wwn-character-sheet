import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { TalesBrandLink } from "./app-header";
import "./landing-density.css";

/* eslint-disable @next/next/no-img-element -- the small shared static brand mark is served directly */

const playerFeatures = [
  ["✦", "Guided Level 1 creation", "Choose a background, class, skills, Foci, and starting equipment in order. The sheet applies the resulting level-1 character as you go."],
  ["⌁", "A sheet that does the bookkeeping", "Keep attributes, skills, saves, combat values, armor, and equipment together, with derived values based on your character choices."],
  ["⚄", "Roll and check rules", "Roll skills, saves, attacks, damage, and initiative from the sheet. Recent rolls and the Rules Assistant are there when a rule comes up."],
  ["◈", "Keep the character", "Save it to your account, reopen it from another device, print it, or choose private, unlisted, or public sharing."],
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
      <div className="landing-campaign-tools"><span>SRD Creatures</span><span>Campaign NPCs</span><span>Live Rolls</span></div>
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
        <h1 id="landing-title">Your Adventures.<br />Your Characters.<br /><em>Without End.</em></h1>
        <p className="landing-hero-deck">Tales Without End is an online character sheet and Level 1 character builder for Worlds Without Number. Build a character, use it at the table, then save it to return to whenever you play.</p>
        <div className="landing-actions">
          <GoogleSignInButton className="landing-button landing-button-primary">Sign in with Google</GoogleSignInButton>
          <Link href="/public-characters" className="landing-button landing-button-secondary">Browse Public Characters</Link>
        </div>
        <ul className="landing-trust" aria-label="Tales Without End highlights"><li>Guided Level 1 creation</li><li>Interactive WWN sheets</li><li>Campaign tools for GMs</li></ul>
      </div>
      <FolioShowcase />
    </section>

    <section id="character-folio" className="landing-features" aria-labelledby="player-features-title">
      <p className="landing-kicker">BUILD IT. THEN PLAY IT.</p>
      <h2 id="player-features-title">A WWN character sheet that stays useful after creation</h2>
      <p className="landing-section-intro">Build a level-1 character with guided choices, then keep the numbers, gear, and rules details you use at the table on the same sheet.</p>
      <div className="feature-grid">{playerFeatures.map(([icon, title, copy]) => <article key={title}><span aria-hidden="true">{icon}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="landing-detail landing-detail-folio">
      <div>
        <p className="landing-kicker">BUILT FOR ACTUAL SESSIONS</p>
        <h2>More useful than a static sheet</h2>
        <p>Tales Without End keeps the information that changes during play attached to the character. Track HP and System Strain, manage structured equipment and coin, roll a readied attack, and keep spells, Arts, and notes on hand.</p>
        <ul><li>Equipment and armor stay in the record instead of a notes field</li><li>Spells, Arts, Foci, and companions sit beside the rest of the sheet</li><li>Print or save a PDF when you want paper at the table</li></ul>
      </div>
      <div className="landing-detail-card"><span>THE CHARACTER LIBRARY</span><strong>Open the same character at the next session</strong><p>Saved characters stay in your library. Reopen them where you play and choose who can see each one when you are ready to share.</p></div>
    </section>

    <section id="campaign-tools" className="landing-campaign" aria-labelledby="campaign-tools-title">
      <div className="landing-campaign-copy"><p className="landing-kicker">FOR GMS AND CAMPAIGNS</p><h2 id="campaign-tools-title">Run the encounter, not another tracker.</h2><p>The GM Console puts the party, encounter order, hit points, and NPC combat in one place. Add a creature from the Built-In Bestiary or a campaign NPC, roll attacks and damage, and check practical encounter threat guidance.</p><ul><li>Keep campaign membership separate from a player&apos;s private folio</li><li>Use Built-In Bestiary creatures and editable campaign NPC templates</li><li>See live session rolls alongside the encounter</li></ul></div>
      <CampaignShowcase />
    </section>

    <section className="landing-final" aria-labelledby="landing-final-title">
      <img src="/assets/tales-without-end-navigation-logo.svg" alt="" />
      <p className="landing-kicker">BUILD A CHARACTER YOU CAN KEEP</p>
      <h2 id="landing-final-title">Create a WWN character, then bring it to the table.</h2>
      <p>Sign in to begin a character and save it in your library, or browse public character sheets for inspiration.</p>
      <div className="landing-actions"><GoogleSignInButton className="landing-button landing-button-primary">Sign in with Google</GoogleSignInButton><Link href="/public-characters" className="landing-button landing-button-secondary">Browse Public Characters</Link></div>
    </section>
  </main>;
}
