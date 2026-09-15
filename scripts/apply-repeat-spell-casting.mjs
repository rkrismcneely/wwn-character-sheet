import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../app/character-sheet.tsx", import.meta.url);
let source = await readFile(path, "utf8");

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label} is not unique`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "spell casting helper import",
  `import { CampaignInventoryOptions, StoredItemsSection, useCampaignInventoryItems } from "./inventory-stored-items";`,
  `import { CampaignInventoryOptions, StoredItemsSection, useCampaignInventoryItems } from "./inventory-stored-items";\nimport { canRecordSpellCast, spellCastCost, spellCastCount, spellCastingUse } from "./spell-casting";`,
);

replaceOnce(
  "legacy casting normalization",
  `          cast: Boolean(pick.cast),\n          casts: Math.max(0, Number(pick.casts) || 0),`,
  `          cast: false,\n          casts: spellCastCount(pick),`,
);

replaceOnce(
  "rest casting count",
  `    const castings = isInvoker\n      ? sheet.spellPicks.reduce((total, pick) => total + (pick.casts || 0), 0)\n      : sheet.spellPicks.filter(pick => pick.cast).length;`,
  `    const castings = sheet.spellPicks.reduce((total, pick) => total + spellCastCount(pick), 0);`,
);

replaceOnce(
  "daily casting use",
  `  const castsUsed = isInvoker\n    ? sheet.spellPicks.reduce((total, pick) => total + (pick.name && pick.prepared ? (pick.casts || 0) * (availableSpells.find(spell => spell.name === pick.name)?.level || 0) : 0), 0)\n    : sheet.spellPicks.filter(s => s.name && s.cast).length;`,
  `  const castsUsed = spellCastingUse(\n    sheet.spellPicks,\n    isInvoker,\n    name => availableSpells.find(spell => spell.name === name)?.level || 0,\n  );`,
);

replaceOnce(
  "ordinary spellbook instructions",
  `: "Choose each known spell from the complete SRD list. Prepared spells are bright; unprepared spells remain in your spellbook but are muted."}`,
  `: "Choose each known spell from the complete SRD list. Prepared spells are bright; unprepared spells remain muted. Press Cast each time a spell is used; Undo removes one casting if play is retconned or the button is pressed accidentally."}`,
);

replaceOnce(
  "per-spell cast state",
  `                const unavailable = spell && spell.level > limits.max;\n                return <div className={\`spell-row \${pick.prepared ? "prepared":"unprepared"} \${unavailable ? "locked":""} \${dragging?.kind==="spell"&&dragging.index===i ? "dragging":""}\`} key={i} data-drag-kind="spell" data-drag-index={i}`,
  `                const unavailable = spell && spell.level > limits.max;\n                const castCount = spellCastCount(pick);\n                const castCost = spellCastCost(isInvoker, spell?.level || 0);\n                const canCast = Boolean(spell) && canRecordSpellCast({\n                  prepared: pick.prepared,\n                  castingBlocked,\n                  used: castsUsed,\n                  limit: limits.casts,\n                  cost: castCost,\n                });\n                return <div className={\`spell-row \${pick.prepared ? "prepared":"unprepared"} \${unavailable ? "locked":""} \${dragging?.kind==="spell"&&dragging.index===i ? "dragging":""}\`} key={i} data-drag-kind="spell" data-drag-index={i}`,
);

replaceOnce(
  "spell casting controls",
  `                  {isInvoker\n                    ? <label className={\`cast-check \${castingBlocked ? "casting-blocked" : ""}\`} title={castingBlockedReason}><input type="number" min={0} max={spell ? Math.floor(limits.casts / spell.level) : 0} value={pick.casts || 0} disabled={castingBlocked || !pick.prepared} aria-label={\`\${pick.name || "Spell"} casts today\`} onChange={e => patch("spellPicks", sheet.spellPicks.map((x,j) => j === i ? { ...x, casts: Math.max(0, Number(e.target.value) || 0), cast: false } : x))}/><span>Times cast</span></label>\n                    : <label className={\`cast-check \${castingBlocked ? "casting-blocked" : ""}\`} title={castingBlockedReason}><input type="checkbox" checked={pick.cast} disabled={castingBlocked || (!pick.prepared && !pick.cast) || (!pick.cast && castsUsed >= limits.casts)} onChange={e => patch("spellPicks", sheet.spellPicks.map((x,j) => j === i ? { ...x, cast: e.target.checked } : x))}/><span>Cast</span></label>}`,
  `                  <div className={\`spell-cast-control \${castingBlocked ? "casting-blocked" : ""}\`} title={castingBlocked ? castingBlockedReason : undefined}>\n                    <button type="button" className="spell-cast-button" disabled={!canCast} onClick={() => patch("spellPicks", sheet.spellPicks.map((x,j) => j === i ? { ...x, casts: castCount + 1, cast: false } : x))}>Cast</button>\n                    <span className="spell-cast-count" aria-label={\`\${pick.name || "Spell"} cast \${castCount} \${castCount === 1 ? "time" : "times"} today\`} aria-live="polite">×{castCount}</span>\n                    <button type="button" className="spell-cast-undo" disabled={castCount <= 0} onClick={() => patch("spellPicks", sheet.spellPicks.map((x,j) => j === i ? { ...x, casts: Math.max(0, castCount - 1), cast: false } : x))}>Undo</button>\n                  </div>`,
);

await writeFile(path, source);
