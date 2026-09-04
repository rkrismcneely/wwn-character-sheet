from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_n(text: str, old: str, new: str, expected: int, label: str) -> str:
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new)


path = Path("app/character-sheet.tsx")
text = path.read_text()

text = replace_once(
    text,
    'type CompanionKind = "henchman" | "familiar";\n',
    'type CompanionKind = "henchman" | "familiar" | "beastmaster";\n',
    "companion kind",
)

text = replace_once(
    text,
    '''  vowedEffortSkill: "Exert",\n  wiseConceptSkill: "",\n  autoClassRules: true,\n''',
    '''  vowedEffortSkill: "Exert",\n  wiseConceptSkill: "",\n  beastmasterBond: "bind-companion" as "bind-companion" | "chosen-friend",\n  autoClassRules: true,\n''',
    "initial bond",
)

old_new_companion = '''function newCompanion(kind: CompanionKind, index: number, level: number, focusSlot?: number): Companion {\n  const familiar = kind === "familiar";\n  return {\n    id: `${kind}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,\n    kind,\n    name: "",\n    archetype: familiar ? "" : "Student",\n    description: "",\n    hitDice: familiar ? `${Math.max(1, level)} HD` : "1 HD",\n    hpRolled: 0,\n    hpCurrent: familiar ? Math.max(1, level) : 0,\n    hpMax: familiar ? Math.max(1, level) : 0,\n    ac: familiar ? 14 : 10,\n    move: familiar ? "30′" : "30′",\n    attackBonus: familiar ? "No effective attack" : "+0",\n    damage: familiar ? "—" : "By weapon",\n    physicalSave: 15,\n    evasionSave: 15,\n    mentalSave: 15,\n    luckSave: 15,\n    morale: familiar ? "Unwavering" : "7",\n    skillBonus: familiar ? "+0" : "+1",\n    strength: familiar ? 10 : 8,\n    readied: [],\n    stowed: [],\n    familiarBenefits: [],\n    familiarBackground: "",\n    focusSlot,\n    summoned: true,\n    effortRefreshUsed: false,\n    notes: "",\n  };\n}\n'''
new_new_companion = '''function newCompanion(kind: CompanionKind, index: number, level: number, focusSlot?: number): Companion {\n  const familiar = kind === "familiar";\n  const beastmaster = kind === "beastmaster";\n  return {\n    id: `${kind}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,\n    kind,\n    name: "",\n    archetype: familiar || beastmaster ? "" : "Student",\n    description: "",\n    hitDice: familiar ? `${Math.max(1, level)} HD` : beastmaster ? "1 HD" : "1 HD",\n    hpRolled: 0,\n    hpCurrent: familiar ? Math.max(1, level) : 0,\n    hpMax: familiar ? Math.max(1, level) : 0,\n    ac: familiar ? 14 : 10,\n    move: "30′",\n    attackBonus: familiar ? "No effective attack" : beastmaster ? "+0" : "+0",\n    damage: familiar ? "—" : beastmaster ? "Natural weapon" : "By weapon",\n    physicalSave: 15,\n    evasionSave: 15,\n    mentalSave: 15,\n    luckSave: 15,\n    morale: familiar ? "Unwavering" : "7",\n    skillBonus: familiar ? "+0" : "+1",\n    strength: familiar || beastmaster ? 10 : 8,\n    readied: [],\n    stowed: [],\n    familiarBenefits: [],\n    familiarBackground: "",\n    focusSlot,\n    summoned: true,\n    effortRefreshUsed: false,\n    notes: "",\n  };\n}\n'''
text = replace_once(text, old_new_companion, new_new_companion, "new companion")

text = replace_once(
    text,
    '''    artEffort: Array.isArray(incoming.artEffort)\n      ? (incoming.artPicks || initial.artPicks).map((_, index) =>\n          Boolean(incoming.artEffort?.[index]),\n        )\n      : (incoming.artPicks || initial.artPicks).map(() => false),\n    languages: normalizeLanguages(incoming.languages),\n''',
    '''    artEffort: Array.isArray(incoming.artEffort)\n      ? (incoming.artPicks || initial.artPicks).map((_, index) =>\n          Boolean(incoming.artEffort?.[index]),\n        )\n      : (incoming.artPicks || initial.artPicks).map(() => false),\n    beastmasterBond:\n      incoming.beastmasterBond === "chosen-friend"\n        ? "chosen-friend"\n        : "bind-companion",\n    languages: normalizeLanguages(incoming.languages),\n''',
    "normalize bond",
)

text = replace_n(
    text,
    '''            companion.kind === "familiar" ? "familiar" : "henchman",\n''',
    '''            companion.kind === "familiar"\n              ? "familiar"\n              : companion.kind === "beastmaster"\n                ? "beastmaster"\n                : "henchman",\n''',
    2,
    "normalize companion kind",
)

text = replace_n(
    text,
    '''            companion.kind === "familiar"\n              ? ""\n              : npcArchetypeNames.includes(\n''',
    '''            companion.kind === "familiar" || companion.kind === "beastmaster"\n              ? ""\n              : npcArchetypeNames.includes(\n''',
    2,
    "normalize companion archetype",
)

text = replace_once(
    text,
    '''  const hasHenchkeeper = Boolean(henchkeeper);\n  const hasSpiritFamiliar = spiritFamiliars.length > 0;\n  const henchmanCount = henchkeeper ? Math.ceil(Math.max(1, sheet.level) / 3) : 0;\n  const companionTabs = sheet.companions.filter(companion =>\n    companion.kind === "henchman" ? Boolean(henchkeeper) : hasSpiritFamiliar\n  );\n''',
    '''  const hasHenchkeeper = Boolean(henchkeeper);\n  const hasSpiritFamiliar = spiritFamiliars.length > 0;\n  const hasBeastmaster = selectedClasses.includes("Beastmaster");\n  const chosenFriend = hasBeastmaster && sheet.beastmasterBond === "chosen-friend";\n  const henchmanCount = henchkeeper ? Math.ceil(Math.max(1, sheet.level) / 3) : 0;\n  const companionTabs = sheet.companions.filter(companion =>\n    companion.kind === "henchman"\n      ? Boolean(henchkeeper)\n      : companion.kind === "familiar"\n        ? hasSpiritFamiliar\n        : hasBeastmaster\n  );\n''',
    "beastmaster derivation",
)

text = replace_once(
    text,
    '''  const availableArts = artTraditions.flatMap(t => {\n    const arts = t === "High Mage" ? highMageArts : traditionInfo[t].arts;\n    return arts.map(a => ({...a, minLevel: "minLevel" in a ? a.minLevel : undefined, tradition:t, value: artSelectionValue(t, a.name)}));\n  });\n''',
    '''  const availableArts = artTraditions.flatMap(t => {\n    const arts = t === "High Mage" ? highMageArts : traditionInfo[t].arts;\n    return arts\n      .filter(a => !(chosenFriend && t === "Beastmaster" && ["Mind Call", "Shared Vitality"].includes(a.name)))\n      .map(a => ({...a, minLevel: "minLevel" in a ? a.minLevel : undefined, tradition:t, value: artSelectionValue(t, a.name)}));\n  });\n''',
    "sheet chosen friend arts",
)

text = replace_once(
    text,
    '''  const companionInventoryLabel = (companion: Companion, index: number) =>\n    companion.name || (companion.kind === "familiar" ? "Familiar" : `Henchman ${index + 1}`);\n''',
    '''  const companionInventoryLabel = (companion: Companion, index: number) =>\n    companion.name || (\n      companion.kind === "familiar"\n        ? "Familiar"\n        : companion.kind === "beastmaster"\n          ? sheet.beastmasterBond === "chosen-friend" ? "Chosen Friend" : "Beastmaster Companion"\n          : `Henchman ${index + 1}`\n    );\n''',
    "inventory companion label",
)

old_effect = '''      const existingHenchmen = current.companions.filter(companion => companion.kind === "henchman");\n      const existingFamiliars = current.companions.filter(companion => companion.kind === "familiar");\n      const archivedHenchmen = current.archivedCompanions.filter(companion => companion.kind === "henchman");\n      const archivedFamiliars = current.archivedCompanions.filter(companion => companion.kind === "familiar");\n      const availableHenchmen = [...existingHenchmen, ...archivedHenchmen];\n      const nextHenchmen = hasHenchkeeper\n        ? [\n            ...availableHenchmen.slice(0, henchmanCount),\n            ...Array.from({ length: Math.max(0, henchmanCount - availableHenchmen.length) }, (_, index) =>\n              newCompanion("henchman", availableHenchmen.length + index, sheet.level)\n            ),\n          ]\n        : [];\n      const nextFamiliars = reconcileFamiliarSlots(\n        existingFamiliars,\n        archivedFamiliars,\n        spiritFamiliars.map(({ index }) => index),\n        (focusSlot, familiarIndex) => newCompanion("familiar", familiarIndex, sheet.level, focusSlot),\n      );\n      const next = [...nextHenchmen, ...nextFamiliars];\n'''
new_effect = '''      const existingHenchmen = current.companions.filter(companion => companion.kind === "henchman");\n      const existingFamiliars = current.companions.filter(companion => companion.kind === "familiar");\n      const existingBeastmasters = current.companions.filter(companion => companion.kind === "beastmaster");\n      const archivedHenchmen = current.archivedCompanions.filter(companion => companion.kind === "henchman");\n      const archivedFamiliars = current.archivedCompanions.filter(companion => companion.kind === "familiar");\n      const archivedBeastmasters = current.archivedCompanions.filter(companion => companion.kind === "beastmaster");\n      const availableHenchmen = [...existingHenchmen, ...archivedHenchmen];\n      const availableBeastmasters = [...existingBeastmasters, ...archivedBeastmasters];\n      const nextHenchmen = hasHenchkeeper\n        ? [\n            ...availableHenchmen.slice(0, henchmanCount),\n            ...Array.from({ length: Math.max(0, henchmanCount - availableHenchmen.length) }, (_, index) =>\n              newCompanion("henchman", availableHenchmen.length + index, sheet.level)\n            ),\n          ]\n        : [];\n      const nextFamiliars = reconcileFamiliarSlots(\n        existingFamiliars,\n        archivedFamiliars,\n        spiritFamiliars.map(({ index }) => index),\n        (focusSlot, familiarIndex) => newCompanion("familiar", familiarIndex, sheet.level, focusSlot),\n      );\n      const nextBeastmasters = hasBeastmaster\n        ? [availableBeastmasters[0] || newCompanion("beastmaster", 0, sheet.level)]\n        : [];\n      const next = [...nextHenchmen, ...nextFamiliars, ...nextBeastmasters];\n'''
text = replace_once(text, old_effect, new_effect, "companion reconciliation")

text = replace_once(
    text,
    '''  }, [hydrated, hasHenchkeeper, hasSpiritFamiliar, henchmanCount, sheet.level, spiritFamiliars]);\n''',
    '''  }, [hydrated, hasHenchkeeper, hasSpiritFamiliar, hasBeastmaster, henchmanCount, sheet.level, spiritFamiliars]);\n''',
    "companion effect deps",
)

text = replace_once(
    text,
    '''  }, [hydrated, focusSlotCount, artAllowance, knownSpellAllowance, limits.prepared, limits.max, selectedClasses.join("|"), sheet.attrs.STR, sheet.attrs.DEX, sheet.attrs.CON, sheet.attrs.INT, sheet.attrs.WIS, sheet.attrs.CHA, sheet.backgroundDevelopmentMethod, JSON.stringify(sheet.backgroundDevelopmentRolls), JSON.stringify(sheet.backgroundLearningPicks)]);\n''',
    '''  }, [hydrated, focusSlotCount, artAllowance, knownSpellAllowance, limits.prepared, limits.max, selectedClasses.join("|"), sheet.beastmasterBond, sheet.attrs.STR, sheet.attrs.DEX, sheet.attrs.CON, sheet.attrs.INT, sheet.attrs.WIS, sheet.attrs.CHA, sheet.backgroundDevelopmentMethod, JSON.stringify(sheet.backgroundDevelopmentRolls), JSON.stringify(sheet.backgroundLearningPicks)]);\n''',
    "art reconciliation bond dep",
)

text = replace_once(
    text,
    '''          {selectedClasses.includes("Wise") && <Section title="Wise Concept"><div className="vowed-controls"><label className="field"><span>Concept bonus skill</span><select value={sheet.wiseConceptSkill} onChange={e=>patch("wiseConceptSkill",e.target.value)}><option value="">Choose a concept-appropriate skill…</option>{noncombatSkills.map(s=><option key={s}>{s}</option>)}</select></label></div><p className="section-intro">Choose the noncombat skill most appropriate to the Wise’s concept. It is granted as the Wise class bonus skill and shown with its source on the Skills panel.</p></Section>}\n          {castingTraditions.length > 0 && <Section title="Spellbook"''',
    '''          {selectedClasses.includes("Wise") && <Section title="Wise Concept"><div className="vowed-controls"><label className="field"><span>Concept bonus skill</span><select value={sheet.wiseConceptSkill} onChange={e=>patch("wiseConceptSkill",e.target.value)}><option value="">Choose a concept-appropriate skill…</option>{noncombatSkills.map(s=><option key={s}>{s}</option>)}</select></label></div><p className="section-intro">Choose the noncombat skill most appropriate to the Wise’s concept. It is granted as the Wise class bonus skill and shown with its source on the Skills panel.</p></Section>}\n          {hasBeastmaster && <Section title="Beastmaster Companion Bond"><div className="vowed-controls"><label className="field"><span>Bond</span><select value={sheet.beastmasterBond} onChange={e=>patch("beastmasterBond", e.target.value as Sheet["beastmasterBond"])}><option value="bind-companion">Bind Companion · flexible bond</option><option value="chosen-friend">Chosen Friend · lifelong bond</option></select></label></div><p className="section-intro">Both modes use the required Bind Companion Art. Chosen Friend keeps one permanent companion and automatically grants that companion the benefits of Shared Vitality and Mind Call without spending Art picks.</p></Section>}\n          {castingTraditions.length > 0 && <Section title="Spellbook"''',
    "sheet bond control",
)

text = replace_once(
    text,
    '''            const fallback = companion.kind === "familiar" ? "Familiar" : `Henchman ${index + 1}`;\n''',
    '''            const fallback = companion.kind === "familiar"\n              ? "Familiar"\n              : companion.kind === "beastmaster"\n                ? chosenFriend ? "Chosen Friend" : "Beastmaster Companion"\n                : `Henchman ${index + 1}`;\n''',
    "companion tab fallback",
)

beastmaster_panel = '''          if (companion.kind === "beastmaster") {\n            const chosenFriendCompanion = sheet.beastmasterBond === "chosen-friend";\n            const effectiveHitDiceMinimum = chosenFriendCompanion ? effectiveLevel : 0;\n            return <div className="companion-grid">\n              <Section\n                title={chosenFriendCompanion ? "Chosen Friend" : "Beastmaster Companion"}\n                aside={<span className="caption">{chosenFriendCompanion ? "Lifelong bond · Shared Vitality + Mind Call" : "Bound animal companion"}</span>}\n              >\n                <div className="two-col">\n                  <Field label="Name" value={companion.name} onChange={value => patchCompanion(companion.id, "name", value)} />\n                  <Field label="Creature / Appearance" value={companion.description} onChange={value => patchCompanion(companion.id, "description", value)} />\n                </div>\n                {chosenFriendCompanion\n                  ? <div className="archetype-summary">\n                      <div><strong>Shared Vitality</strong><p>Effective Hit Dice cannot be lower than your level ({effectiveHitDiceMinimum} HD), and its hit bonus cannot be lower than half its Hit Dice, rounded up.</p></div>\n                      <div><strong>Mind Call</strong><p>You automatically have the telepathic companion-bond benefit; it does not consume another Beastmaster Art pick.</p></div>\n                      <div><strong>Chosen Friend</strong><p>This is the only companion you can ever Bind. At 0 HP it disappears and returns beside you at the next dawn with full hit points.</p></div>\n                    </div>\n                  : <p className="section-intro">You can normally have one bound animal companion at a time. You may release it as a Main Action and later Bind another suitable creature.</p>}\n                <div className="companion-stats">\n                  <Field label="Hit Dice" value={companion.hitDice} onChange={value => patchCompanion(companion.id, "hitDice", value)} />\n                  <label className="field"><span>Hit Points</span><span className="companion-hp"><input type="number" min={0} value={companion.hpCurrent || ""} onChange={e => patchCompanion(companion.id, "hpCurrent", Math.max(0, Number(e.target.value) || 0))} aria-label="Current hit points" /><i>/</i><input type="number" min={0} value={companion.hpMax || ""} onChange={e => patchCompanion(companion.id, "hpMax", Math.max(0, Number(e.target.value) || 0))} aria-label="Maximum hit points" /></span></label>\n                  <label className="field"><span>Armor Class</span><input type="number" value={companion.ac || ""} onChange={e => patchCompanion(companion.id, "ac", Math.max(0, Number(e.target.value) || 0))} /></label>\n                  <Field label="Movement" value={companion.move} onChange={value => patchCompanion(companion.id, "move", value)} />\n                  <Field label="Attack Bonus" value={companion.attackBonus} onChange={value => patchCompanion(companion.id, "attackBonus", value)} />\n                  <Field label="Damage / Attack" value={companion.damage} onChange={value => patchCompanion(companion.id, "damage", value)} />\n                  <Field label="Skill Bonus" value={companion.skillBonus} onChange={value => patchCompanion(companion.id, "skillBonus", value)} />\n                  <Field label="Morale" value={companion.morale} onChange={value => patchCompanion(companion.id, "morale", value)} />\n                  <label className="field"><span>Save</span><input type="number" min={1} value={companion.physicalSave || ""} onChange={e => patchCompanion(companion.id, "physicalSave", Math.max(1, Number(e.target.value) || 1))} /></label>\n                  <label className="field"><span>Strength score</span><input type="number" min={0} max={30} value={companion.strength || ""} onChange={e => patchCompanion(companion.id, "strength", Math.max(0, Number(e.target.value) || 0))} /></label>\n                </div>\n                <p className="section-intro">Enter the creature’s own stat block here. Beastmaster changes such as Shared Vitality modify the creature after its ordinary statistics are known.</p>\n              </Section>\n              <Section title="Companion Notes" className="companion-notes"><textarea className="tall" value={companion.notes} onChange={e => patchCompanion(companion.id, "notes", e.target.value)} /></Section>\n            </div>;\n          }\n'''
text = replace_once(
    text,
    '''          const companion = sheet.companions.find(item => `companion:${item.id}` === tab);\n          if (!companion) return null;\n          const familiar = companion.kind === "familiar";\n''',
    '''          const companion = sheet.companions.find(item => `companion:${item.id}` === tab);\n          if (!companion) return null;\n''' + beastmaster_panel + '''          const familiar = companion.kind === "familiar";\n''',
    "beastmaster companion panel",
)

path.write_text(text)
print("patched character-sheet.tsx")
