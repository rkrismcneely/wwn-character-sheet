from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


# Creation rules: require an explicit bond choice rather than silently treating
# an undecided new Beastmaster as a normal Bind Companion character.
path = Path("app/character-creation.ts")
text = path.read_text()
text = replace_once(
    text,
    'export type BeastmasterBond = "bind-companion" | "chosen-friend";',
    'export type BeastmasterBond = "" | "bind-companion" | "chosen-friend";',
    "creation BeastmasterBond type",
)
text = replace_once(
    text,
    '  const beastmasterBond: BeastmasterBond =\n    state.beastmasterBond === "chosen-friend" ? "chosen-friend" : "bind-companion";\n  const chosenFriend =\n    selectedClasses.includes("Beastmaster") && beastmasterBond === "chosen-friend";',
    '  const beastmasterBond = state.beastmasterBond;\n  const chosenFriend =\n    selectedClasses.includes("Beastmaster") && beastmasterBond === "chosen-friend";',
    "creation bond normalization",
)
text = replace_once(
    text,
    '  if (\n    selectedClasses.includes("Beastmaster") &&\n    state.beastmasterBond &&\n    !beastmasterBondOptions.includes(state.beastmasterBond)\n  )',
    '  if (\n    selectedClasses.includes("Beastmaster") &&\n    !(beastmasterBondOptions as readonly BeastmasterBond[]).includes(state.beastmasterBond)\n  )',
    "creation bond validation",
)
path.write_text(text)


# Guided creation: show an undecided state, make the choice explicit, and clear
# redundant Arts if Chosen Friend supplies their benefits automatically.
path = Path("app/character-creation-wizard.tsx")
text = path.read_text()
text = replace_once(
    text,
    '  artChoiceValues,\n  creationBackgroundSkillChoiceOptions,',
    '  artChoiceValues,\n  chosenFriendBenefitArts,\n  creationBackgroundSkillChoiceOptions,',
    "wizard chosen-friend import",
)
text = replace_once(
    text,
    '  const setArtChoice = (selection: string, choiceIndex: number, value: string) => {\n    const key = artChoiceKey(selection);\n    const values = artChoiceValues(selection, sheet.artChoices);\n    if (!key || !values.length) return;\n    change({\n      artChoices: {\n        ...sheet.artChoices,\n        [key]: values.map((current, index) =>\n          index === choiceIndex ? value : current,\n        ),\n      },\n    });\n  };',
    '  const setArtChoice = (selection: string, choiceIndex: number, value: string) => {\n    const key = artChoiceKey(selection);\n    const values = artChoiceValues(selection, sheet.artChoices);\n    if (!key || !values.length) return;\n    change({\n      artChoices: {\n        ...sheet.artChoices,\n        [key]: values.map((current, index) =>\n          index === choiceIndex ? value : current,\n        ),\n      },\n    });\n  };\n  const setBeastmasterBond = (bond: LevelOneCreationCharacter["beastmasterBond"]) => {\n    const redundant = chosenFriendBenefitArts as readonly string[];\n    change({\n      beastmasterBond: bond,\n      ...(bond === "chosen-friend"\n        ? {\n            artPicks: sheet.artPicks.map((selection) =>\n              redundant.includes(artSelectionName(selection)) ? "" : selection,\n            ),\n          }\n        : {}),\n    });\n  };',
    "wizard bond setter",
)
text = replace_once(
    text,
    '                  value={sheet.beastmasterBond}\n                  onChange={(event) =>\n                    change({\n                      beastmasterBond: event.target.value as\n                        | "bind-companion"\n                        | "chosen-friend",\n                    })\n                  }\n                >\n                  <option value="bind-companion">',
    '                  value={sheet.beastmasterBond}\n                  onChange={(event) =>\n                    setBeastmasterBond(\n                      event.target.value as LevelOneCreationCharacter["beastmasterBond"],\n                    )\n                  }\n                >\n                  <option value="">Choose a companion bond…</option>\n                  <option value="bind-companion">',
    "wizard bond selector",
)
text = replace_once(
    text,
    '                  Both options use the required Bind Companion Art. Chosen\n                  Friend does not spend your additional Art pick; instead, that\n                  one permanent companion automatically gains the benefits of\n                  Shared Vitality and Mind Call.',
    '                  Choose this bond once for the Beastmaster. Both options use\n                  the required Bind Companion Art. Chosen Friend does not spend\n                  your additional Art pick; instead, that one permanent companion\n                  automatically gains the benefits of Shared Vitality and Mind Call.',
    "wizard bond explanation",
)
text = replace_once(
    text,
    '                {sheet.beastmasterBond === "chosen-friend"\n                  ? "Chosen Friend"\n                  : "Bind Companion"}',
    '                {sheet.beastmasterBond === "chosen-friend"\n                  ? "Chosen Friend"\n                  : sheet.beastmasterBond === "bind-companion"\n                    ? "Bind Companion"\n                    : "Not chosen"}',
    "wizard review bond label",
)
path.write_text(text)


# Level-up choices must not offer Arts already granted automatically by a
# Chosen Friend bond.
path = Path("app/level-up-wizard.tsx")
text = path.read_text()
text = replace_once(
    text,
    'import { highMageArts, highMagic } from "./wwn-data";\nimport "./character-creation-wizard.css";',
    'import { highMageArts, highMagic } from "./wwn-data";\nimport { beastmasterArtAvailableForBond } from "./beastmaster-companion";\nimport "./character-creation-wizard.css";',
    "level-up Beastmaster helper import",
)
text = replace_once(
    text,
    'function artChoices(character: WizardCharacter, targetLevel: number) {\n  return magicTraditions(character).flatMap((tradition) => (tradition === "High Mage" ? highMageArts : traditionInfo[tradition].arts)\n    .map((art) => ({ ...art, tradition, value: artSelectionValue(tradition, art.name), minLevel: "minLevel" in art ? art.minLevel : undefined }))\n    .filter((art) => (art.minLevel || 1) <= targetLevel));\n}',
    'function artChoices(character: WizardCharacter, targetLevel: number) {\n  return magicTraditions(character).flatMap((tradition) => (tradition === "High Mage" ? highMageArts : traditionInfo[tradition].arts)\n    .filter((art) => tradition !== "Beastmaster" || beastmasterArtAvailableForBond(art.name, character.beastmasterBond))\n    .map((art) => ({ ...art, tradition, value: artSelectionValue(tradition, art.name), minLevel: "minLevel" in art ? art.minLevel : undefined }))\n    .filter((art) => (art.minLevel || 1) <= targetLevel));\n}',
    "level-up Chosen Friend Art filtering",
)
path.write_text(text)


# Character sheet: preserve an explicit undecided state for fresh sheets,
# retain backward compatibility for old stored characters, and make the
# Beastmaster tab apply the actual companion rules instead of only describing
# them.
path = Path("app/character-sheet.tsx")
text = path.read_text()
text = replace_once(
    text,
    'import { armorRestrictsMagic, deriveSkillProfile, deriveUnarmedAttack, explicitFocusSkillChoices, focusIsRepeatable, focusTargetAvailable, reconcileFamiliarSlots, storedRankForDisplayedSkillRank } from "./phase2-rules";',
    'import { armorRestrictsMagic, deriveSkillProfile, deriveUnarmedAttack, explicitFocusSkillChoices, focusIsRepeatable, focusTargetAvailable, reconcileFamiliarSlots, storedRankForDisplayedSkillRank } from "./phase2-rules";\nimport {\n  beastmasterArtAvailableForBond,\n  beastmasterCompanionRules,\n  chosenFriendBenefitArts,\n  formatBeastmasterHitBonus,\n  formatBeastmasterHitDice,\n} from "./beastmaster-companion";',
    "sheet Beastmaster helper import",
)
text = replace_once(
    text,
    '  morale: string;\n  skillBonus: string;',
    '  morale: string;\n  instinct: string;\n  skillBonus: string;',
    "companion instinct type",
)
text = replace_once(
    text,
    '  beastmasterBond: "bind-companion" as "bind-companion" | "chosen-friend",',
    '  beastmasterBond: "bind-companion" as "" | "bind-companion" | "chosen-friend",',
    "sheet bond type",
)
text = replace_once(
    text,
    '  classOne: "",\n  classTwo: "",\n  level: 0,',
    '  classOne: "",\n  classTwo: "",\n  beastmasterBond: "",\n  level: 0,',
    "blank sheet bond state",
)
text = replace_once(
    text,
    '    morale: familiar ? "Unwavering" : "7",\n    skillBonus: familiar ? "+0" : "+1",',
    '    morale: familiar ? "Unwavering" : "7",\n    instinct: familiar ? "—" : "5",\n    skillBonus: familiar ? "+0" : "+1",',
    "new companion instinct",
)
text = replace_once(
    text,
    '  const patchCompanion = <K extends keyof Companion>(id: string, key: K, value: Companion[K]) =>\n    canEdit && setSheet(current => ({\n        ...current,\n        companions: current.companions.map(companion => companion.id === id ? { ...companion, [key]: value } : companion),\n      }));',
    '  const patchCompanion = <K extends keyof Companion>(id: string, key: K, value: Companion[K]) =>\n    canEdit && setSheet(current => ({\n        ...current,\n        companions: current.companions.map(companion => companion.id === id ? { ...companion, [key]: value } : companion),\n      }));\n  const changeBeastmasterBond = (bond: Sheet["beastmasterBond"]) => {\n    if (!canEdit) return;\n    const redundant = chosenFriendBenefitArts as readonly string[];\n    setSheet(current => ({\n      ...current,\n      beastmasterBond: bond,\n      artPicks: bond === "chosen-friend"\n        ? current.artPicks.map(selection => redundant.includes(artSelectionName(selection)) ? "" : selection)\n        : current.artPicks,\n      artEffort: bond === "chosen-friend"\n        ? current.artEffort.map((committed, index) => redundant.includes(artSelectionName(current.artPicks[index] || "")) ? false : committed)\n        : current.artEffort,\n    }));\n  };',
    "sheet bond setter",
)
text = replace_once(
    text,
    '      .filter(a => !(chosenFriend && t === "Beastmaster" && ["Mind Call", "Shared Vitality"].includes(a.name)))',
    '      .filter(a => t !== "Beastmaster" || beastmasterArtAvailableForBond(a.name, sheet.beastmasterBond))',
    "sheet Chosen Friend Art filtering",
)

bond_start = text.index('{hasBeastmaster && <Section title="Beastmaster Companion Bond">')
bond_end = text.index('{castingTraditions.length > 0 && <Section title="Spellbook"', bond_start)
old_bond = text[bond_start:bond_end]
new_bond = '''{hasBeastmaster && <Section title="Beastmaster Companion Bond"><div className="vowed-controls"><label className="field"><span>Bond</span><select value={sheet.beastmasterBond} onChange={e=>changeBeastmasterBond(e.target.value as Sheet["beastmasterBond"])}><option value="">Choose a companion bond…</option><option value="bind-companion">Bind Companion · flexible bond</option><option value="chosen-friend">Chosen Friend · lifelong bond</option></select></label></div><p className="section-intro">Both modes use the required Bind Companion Art. Chosen Friend keeps one permanent companion and automatically grants that companion the benefits of Shared Vitality and Mind Call without spending Art picks.</p>{!sheet.beastmasterBond && <p className="creation-choice-note">Choose the Beastmaster’s companion bond before finishing character creation.</p>}</Section>}\n          '''
text = text[:bond_start] + new_bond + text[bond_end:]

companion_start = text.index('          if (companion.kind === "beastmaster") {')
companion_end = text.index('          const familiar = companion.kind === "familiar";', companion_start)
new_companion = '''          if (companion.kind === "beastmaster") {
            const chosenFriendCompanion = sheet.beastmasterBond === "chosen-friend";
            const hasSharedVitalityArt = sheet.artPicks.some(selection => artSelectionName(selection) === "Shared Vitality");
            const hasMindCallArt = sheet.artPicks.some(selection => artSelectionName(selection) === "Mind Call");
            const companionRules = beastmasterCompanionRules({
              level: effectiveLevel,
              bond: sheet.beastmasterBond,
              hasSharedVitalityArt,
              hasMindCallArt,
              hitDice: companion.hitDice,
              attackBonus: companion.attackBonus,
            });
            return <div className="companion-grid">
              <Section
                title={chosenFriendCompanion ? "Chosen Friend" : "Beastmaster Companion"}
                aside={<span className="caption">{chosenFriendCompanion ? "Lifelong bond · Shared Vitality + Mind Call" : "Bound animal companion"}</span>}
              >
                <div className="two-col">
                  <Field label="Name" value={companion.name} onChange={value => patchCompanion(companion.id, "name", value)} />
                  <Field label="Creature / Appearance" value={companion.description} onChange={value => patchCompanion(companion.id, "description", value)} />
                </div>
                {!companion.name.trim() && <p className="creation-choice-note">A Beastmaster companion must have a name before Beastmaster arts can control it.</p>}
                <div className="archetype-summary">
                  <div><strong>Companion limits</strong><p>Its base Hit Dice cannot exceed your level + 1 ({companionRules.maximumBaseHitDice} HD), it remains an independently acting allied creature, and it still checks Instinct and Morale normally.</p></div>
                  {companionRules.sharedVitality && <div><strong>Shared Vitality</strong><p>Effective Hit Dice cannot be lower than your level ({companionRules.beastmasterLevel} HD), and effective hit bonus cannot be lower than half its effective Hit Dice, rounded up.</p></div>}
                  {companionRules.mindCall && <div><strong>Mind Call</strong><p>{chosenFriendCompanion ? "The Chosen Friend automatically gains" : "This companion benefits from"} the telepathic companion bond.</p></div>}
                  {chosenFriendCompanion && <div><strong>Chosen Friend</strong><p>This is the only companion you can ever Bind. At 0 HP it disappears and manifests beside you the following dawn with full hit points.</p></div>}
                </div>
                {!companionRules.eligibleHitDice && <p className="creation-choice-note">This creature’s base Hit Dice exceed the Beastmaster limit of {companionRules.maximumBaseHitDice} HD at level {companionRules.beastmasterLevel}.</p>}
                <div className="companion-stats">
                  <Field label="Base Hit Dice" value={companion.hitDice} onChange={value => patchCompanion(companion.id, "hitDice", value)} />
                  <label className="field"><span>Effective Hit Dice</span><input readOnly value={formatBeastmasterHitDice(companionRules.effectiveHitDice)} /></label>
                  <label className="field"><span>Hit Points</span><span className="companion-hp"><input type="number" min={0} value={companion.hpCurrent || ""} onChange={e => patchCompanion(companion.id, "hpCurrent", Math.max(0, Number(e.target.value) || 0))} aria-label="Current hit points" /><i>/</i><input type="number" min={0} value={companion.hpMax || ""} onChange={e => patchCompanion(companion.id, "hpMax", Math.max(0, Number(e.target.value) || 0))} aria-label="Maximum hit points" /></span></label>
                  <label className="field"><span>Armor Class</span><input type="number" value={companion.ac || ""} onChange={e => patchCompanion(companion.id, "ac", Math.max(0, Number(e.target.value) || 0))} /></label>
                  <Field label="Movement" value={companion.move} onChange={value => patchCompanion(companion.id, "move", value)} />
                  <Field label="Base Attack Bonus" value={companion.attackBonus} onChange={value => patchCompanion(companion.id, "attackBonus", value)} />
                  <label className="field"><span>Effective Hit Bonus</span><input readOnly value={formatBeastmasterHitBonus(companionRules.effectiveHitBonus)} /></label>
                  <Field label="Damage / Attack" value={companion.damage} onChange={value => patchCompanion(companion.id, "damage", value)} />
                  <Field label="Skill Bonus" value={companion.skillBonus} onChange={value => patchCompanion(companion.id, "skillBonus", value)} />
                  <Field label="Morale" value={companion.morale} onChange={value => patchCompanion(companion.id, "morale", value)} />
                  <Field label="Instinct" value={companion.instinct} onChange={value => patchCompanion(companion.id, "instinct", value)} />
                  <label className="field"><span>Save</span><input type="number" min={1} value={companion.physicalSave || ""} onChange={e => patchCompanion(companion.id, "physicalSave", Math.max(1, Number(e.target.value) || 1))} /></label>
                  <label className="field"><span>Strength score</span><input type="number" min={0} max={30} value={companion.strength || ""} onChange={e => patchCompanion(companion.id, "strength", Math.max(0, Number(e.target.value) || 0))} /></label>
                </div>
                <p className="section-intro">Enter the creature’s ordinary stat block as its base statistics. Shared Vitality changes effective HD and hit bonus after those normal statistics are known; adjust maximum HP to match the creature’s resulting effective HD.</p>
                {chosenFriendCompanion && companion.hpCurrent <= 0 && companion.hpMax > 0 && <button type="button" className="text-button" onClick={() => patchCompanion(companion.id, "hpCurrent", companion.hpMax)}>Restore at next dawn</button>}
              </Section>
              <Section title="Companion Notes" className="companion-notes"><textarea className="tall" value={companion.notes} onChange={e => patchCompanion(companion.id, "notes", e.target.value)} /></Section>
            </div>;
          }
'''
text = text[:companion_start] + new_companion + text[companion_end:]
path.write_text(text)
