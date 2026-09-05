import fs from 'node:fs';
const path = 'app/campaigns/campaign-live-session.tsx';
let s = fs.readFileSync(path, 'utf8');
const start = s.indexOf('function EncounterThreatSummary(');
const end = s.indexOf('\nexport function EncounterTracker(', start);
if (start < 0 || end < 0) throw new Error('EncounterThreatSummary boundaries not found');
const replacement = `function EncounterThreatSummary({ encounter, partyLevels, partyLoaded }: { encounter: NonNullable<CampaignLiveSessionState["session"]>["encounter"]; partyLevels: readonly unknown[]; partyLoaded: boolean }) {
  const summary = summarizeEncounterThreat(encounter, partyLevels);
  if (!summary.npcCount) return <details className="campaign-encounter-threat campaign-encounter-threat-empty"><summary className="campaign-encounter-threat-heading"><div><h4>Encounter Threat</h4><p>No hostile encounter NPCs are present to estimate.</p></div></summary></details>;
  const { enemy, estimate, eligible, excluded } = summary;
  return <details className="campaign-encounter-threat">
    <summary className="campaign-encounter-threat-heading"><div><h4>Encounter Threat</h4><p>{wwnThreatEstimateMethod}</p></div>{estimate && <strong>{wwnThreatBandDetails[estimate.band].label}</strong>}</summary>
    <div className="campaign-encounter-threat-body">
      {enemy ? <>
        {!partyLoaded ? <p className="campaign-encounter-threat-note">Loading linked party…</p> : estimate ? <p className="campaign-encounter-threat-note">Party: {estimate.party.characterCount} {estimate.party.characterCount === 1 ? "character" : "characters"} · Levels {estimate.party.levels.join(", ")}</p> : <p className="campaign-encounter-threat-note">Link campaign characters to estimate encounter threat.</p>}
        <dl className="campaign-encounter-threat-grid">
          {estimate && <div><dt>Party Score</dt><dd>{estimate.party.score}</dd></div>}
          <div><dt>Total HD</dt><dd>{enemy.totalHitDice}</dd></div>
          <div><dt>Total attacks</dt><dd>{enemy.totalAttacks}</dd></div>
          <div><dt>Enemy Score</dt><dd>{enemy.score}</dd></div>
          {estimate && <div><dt>Threat ratio</dt><dd>{estimate.ratio.toFixed(2)}×</dd></div>}
        </dl>
        {estimate && <p className="campaign-encounter-threat-result"><strong>Estimated Threat: {wwnThreatBandDetails[estimate.band].label}</strong> · {wwnThreatBandDetails[estimate.band].summary}</p>}
      </> : <p className="campaign-encounter-threat-unavailable"><strong>Encounter threat unavailable.</strong> Add HD and attacks per Main Action to hostile NPCs to include them.</p>}
      {excluded.length > 0 && <details className="campaign-encounter-threat-details"><summary>{enemy ? \`Partial estimate · \${excluded.length} \${excluded.length === 1 ? "NPC" : "NPCs"} excluded\` : \`\${excluded.length} \${excluded.length === 1 ? "NPC" : "NPCs"} lack threat data\`}</summary><ul>{excluded.map(npc => <li key={npc.id}><strong>{npc.name}</strong> — {npc.missing.join(" and ")} missing</li>)}</ul></details>}
      {eligible.length > 0 && <details className="campaign-encounter-threat-details"><summary>Included hostile NPCs ({eligible.length})</summary><ul>{eligible.map(npc => <li key={npc.id}><strong>{npc.name}</strong> · {npc.hitDice} HD · {npc.attacksPerMainAction} {npc.attacksPerMainAction === 1 ? "attack" : "attacks"}</li>)}</ul></details>}
      <details className="campaign-encounter-threat-info"><summary>How this estimate works</summary><p>{wwnThreatEstimateCaveat}</p><p>{wwnThreatEstimateProvenance}</p></details>
    </div>
  </details>;
}
`;
s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(path, s);
