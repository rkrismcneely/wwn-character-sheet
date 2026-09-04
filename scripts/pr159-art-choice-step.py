from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1))


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    target = Path(path)
    text = target.read_text()
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"{path}: start marker not found: {start[:100]!r}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"{path}: end marker not found: {end[:100]!r}")
    target.write_text(text[:start_index] + replacement + text[end_index:])


# Shared parameter model and creation validation.
replace_once(
    "app/character-creation.ts",
    '''export const artSelectionName = (value: string) =>
  value.includes(artSelectionSeparator)
    ? value.slice(value.indexOf(artSelectionSeparator) + artSelectionSeparator.length)
    : value;

export function creationArtForSelection''',
    '''export const artSelectionName = (value: string) =>
  value.includes(artSelectionSeparator)
    ? value.slice(value.indexOf(artSelectionSeparator) + artSelectionSeparator.length)
    : value;

export type ArtChoiceDefinition = {
  count: number;
  label: string;
  itemLabel: string;
  help: string;
};

export const artChoiceKey = (selection: string) => artSelectionName(selection);

export function artChoiceDefinition(selection: string): ArtChoiceDefinition | null {
  switch (artSelectionName(selection)) {
    case "Favored Weapon":
      return {
        count: 1,
        label: "Favored weapon type",
        itemLabel: "Weapon type",
        help: "Choose one specific non-unarmed melee weapon type. Thrown weapons do not qualify.",
      };
    case "Style Weaponry":
      return {
        count: 3,
        label: "Style Weaponry classes",
        itemLabel: "Weapon class",
        help: "Choose three distinct general weapon classes, such as swords, bows, axes, or daggers.",
      };
    default:
      return null;
  }
}

const cleanArtChoiceArray = (value: unknown, maximum = 8) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 80))
        .slice(0, maximum)
    : [];

export function artChoiceValues(
  selection: string,
  choices: Record<string, string[]> | undefined,
): string[] {
  const definition = artChoiceDefinition(selection);
  if (!definition) return [];
  const existing = cleanArtChoiceArray(
    choices?.[artChoiceKey(selection)],
    definition.count,
  );
  return Array.from(
    { length: definition.count },
    (_, index) => existing[index] || "",
  );
}

export function artChoiceIsComplete(
  selection: string,
  choices: Record<string, string[]> | undefined,
) {
  const definition = artChoiceDefinition(selection);
  if (!definition) return true;
  const values = artChoiceValues(selection, choices);
  if (values.some((value) => !value)) return false;
  return (
    new Set(values.map((value) => value.toLocaleLowerCase())).size ===
    definition.count
  );
}

export function normalizeArtChoices(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: Record<string, string[]> = {};
  for (const [rawKey, rawValues] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const key = artChoiceKey(rawKey.trim().slice(0, 80));
    if (!key) continue;
    const definition = artChoiceDefinition(key);
    const values = cleanArtChoiceArray(rawValues, definition?.count || 8);
    if (!values.some(Boolean)) continue;
    normalized[key] = definition
      ? Array.from(
          { length: definition.count },
          (_, index) => values[index] || "",
        )
      : values;
  }
  return normalized;
}

export function creationArtForSelection''',
)
replace_once(
    "app/character-creation.ts",
    "  artPicks: string[];\n  spellPicks: CreationSpellPick[];",
    "  artPicks: string[];\n  artChoices: Record<string, string[]>;\n  spellPicks: CreationSpellPick[];",
)
replace_once(
    "app/character-creation.ts",
    '''  if (selectedArts.length !== artAllowance)
    issues.push({
      step: "magic",
      message: `Choose ${artAllowance} level-1 Art${artAllowance === 1 ? "" : "s"}.`,
    });
  forcedArts.forEach((name) => {''',
    '''  if (selectedArts.length !== artAllowance)
    issues.push({
      step: "magic",
      message: `Choose ${artAllowance} level-1 Art${artAllowance === 1 ? "" : "s"}.`,
    });
  selectedArts.forEach((selection) => {
    const definition = artChoiceDefinition(selection);
    if (definition && !artChoiceIsComplete(selection, state.artChoices))
      issues.push({
        step: "magic",
        message: `Complete ${artSelectionName(selection)}: ${definition.help}`,
      });
  });
  forcedArts.forEach((name) => {''',
)

# Canonical sheet storage/migration, Wise correction, and persistent Art-choice UI.
replace_once(
    "app/character-sheet.tsx",
    '''  artSelectionName,
  artSelectionValue,
  creationArtForSelection,''',
    '''  artSelectionName,
  artSelectionValue,
  artChoiceDefinition,
  artChoiceKey,
  artChoiceValues,
  normalizeArtChoices,
  creationArtForSelection,''',
)
replace_once(
    "app/character-sheet.tsx",
    '  artPicks: ["Arcane Lexicon", "Sense Magic", "Retain Sorcery", "Wizard’s Grandeur"] as string[],\n  artEffort:',
    '  artPicks: ["Arcane Lexicon", "Sense Magic", "Retain Sorcery", "Wizard’s Grandeur"] as string[],\n  artChoices: {} as Record<string, string[]>,\n  artEffort:',
)
replace_once(
    "app/character-sheet.tsx",
    "  artPicks: [],\n  artEffort: [],",
    "  artPicks: [],\n  artChoices: {},\n  artEffort: [],",
)
replace_once(
    "app/character-sheet.tsx",
    '''    ...migratedAttributeState(incoming),
    ...rulesState,
    ...normalizeCreationEquipmentFields(incoming),''',
    '''    ...migratedAttributeState(incoming),
    ...rulesState,
    artChoices: normalizeArtChoices(incoming.artChoices),
    ...normalizeCreationEquipmentFields(incoming),''',
)
replace_once(
    "app/character-sheet.tsx",
    'Choose a concept-appropriate skill…</option>{noncombatSkills.map(s=><option key={s}>{s}</option>)}</select></label></div><p className="section-intro">Choose the noncombat skill most appropriate to the Wise’s concept.',
    'Choose a concept-appropriate skill…</option>{skills.map(s=><option key={s}>{s}</option>)}</select></label></div><p className="section-intro">Choose the skill most appropriate to the Wise’s concept.',
)

sheet_arts = '''          <Section title="Arts" aside={<span className="caption">{artTraditions.join(" + ")} · {sheet.artPicks.filter(Boolean).length}/{artAllowance} available by level {sheet.level}</span>}>
            <div className="arts-grid">{sheet.artPicks.map((name, i) => {
              const art = creationArtForSelection(availableArts, name);
              const requiredArt = forcedArts[i];
              const choiceDefinition = artChoiceDefinition(name);
              const choiceKey = artChoiceKey(name);
              const choiceValues = artChoiceValues(name, sheet.artChoices);
              return <div className={`art-card ${dragging?.kind === "art" && dragging.index === i ? "dragging" : ""}`} key={i} data-drag-kind="art" data-drag-index={i}
                onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const from = Number(e.dataTransfer.getData("text/plain")); if (Number.isInteger(from)) moveItem("art", from, i); setDragging(null); }}>
                <button className="drag-handle" aria-label={`Reorder ${name || `art row ${i + 1}`}`} title="Drag to reorder"
                  draggable onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); setDragging({ kind: "art", index: i }); }} onDragEnd={() => setDragging(null)}
                  onPointerDown={e => beginPointerDrag("art", i, e)} onPointerMove={e => continuePointerDrag("art", e)} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>⠿</button>
                <select title={art?.text || "Choose an art"} value={name} onChange={e => {
                  const next = e.target.value;
                  if (next && !artEligibility(next, i).eligible) { setTransferMessage(artEligibility(next, i).reason); return; }
                  patch("artPicks", sheet.artPicks.map((x, j) => j === i ? next : x));
                }}><option value="">{requiredArt ? `Choose ${artSelectionName(requiredArt)}…` : "Choose an art…"}</option>{artTraditions.filter(t => t !== "Invoker").map(t => <optgroup key={t} label={t}>{availableArts.filter(a => (!requiredArt || a.value === requiredArt) && a.tradition === t).map(a => {
                  const eligibility = artEligibility(a.value, i);
                  return <option value={a.value} disabled={!eligibility.eligible} key={`${t}-${a.name}`}>{a.name}{eligibility.eligible ? "" : ` — ${eligibility.reason}`}</option>;
                })}</optgroup>)}</select>
                {choiceDefinition && <div className="art-choice-fields" aria-label={choiceDefinition.label}>
                  {choiceValues.map((value, choiceIndex) => <label className="field" key={`${choiceKey}-${choiceIndex}`}>
                    <span>{choiceDefinition.itemLabel}{choiceDefinition.count > 1 ? ` ${choiceIndex + 1}` : ""}</span>
                    <input value={value} maxLength={80} onChange={e => patch("artChoices", {
                      ...sheet.artChoices,
                      [choiceKey]: choiceValues.map((current, index) => index === choiceIndex ? e.target.value : current),
                    })} />
                  </label>)}
                  <small>{choiceDefinition.help}</small>
                </div>}
                {requiredArt && <small>Required starting Art</small>}
                {art ? <Tip title="?"><RulesTooltip name={art.name} text={art.text} extra={art.minLevel ? `Minimum level ${art.minLevel}.` : undefined}/></Tip> :
                  <span className="slot-number" aria-label={`Art selection ${i + 1}`}>{i + 1}</span>}
                <label className="check"><input type="checkbox" checked={Boolean(sheet.artEffort[i])} disabled={!name || (Boolean(art && armorRestrictedTraditions.includes(art.tradition)) && castingBlocked) || (!sheet.artEffort[i] && (effortPools.find(p => p.tradition === art?.tradition)?.used ?? 0) >= (effortPools.find(p => p.tradition === art?.tradition)?.max ?? 0))} onChange={e => patch("artEffort", sheet.artPicks.map((_, j) => j === i ? e.target.checked : Boolean(sheet.artEffort[j])))} /><span>Effort</span></label>
              </div>;
            })}</div>
            {!sheet.artPicks.length && <p className="empty-slots">This class has no Art selections at the current level.</p>}
          </Section>
'''
replace_between(
    "app/character-sheet.tsx",
    '          <Section title="Arts" aside=',
    '        </div>}\n\n        {tab === "inventory"',
    sheet_arts,
)

# Guided creation parameter fields.
replace_once(
    "app/character-creation-wizard.tsx",
    '''  choiceOptionsForBackgroundResult,
  artSelectionName,
  creationBackgroundSkillChoiceOptions,''',
    '''  choiceOptionsForBackgroundResult,
  artSelectionName,
  artChoiceDefinition,
  artChoiceKey,
  artChoiceValues,
  creationBackgroundSkillChoiceOptions,''',
)
replace_once(
    "app/character-creation-wizard.tsx",
    '''  const setArt = (index: number, name: string) =>
    change({
      artPicks: Array.from(
        { length: Math.max(sheet.artPicks.length, index + 1) },
        (_, row) => (row === index ? name : sheet.artPicks[row] || ""),
      ),
    });
  const setSpell''',
    '''  const setArt = (index: number, name: string) =>
    change({
      artPicks: Array.from(
        { length: Math.max(sheet.artPicks.length, index + 1) },
        (_, row) => (row === index ? name : sheet.artPicks[row] || ""),
      ),
    });
  const setArtChoice = (selection: string, choiceIndex: number, value: string) => {
    const key = artChoiceKey(selection);
    const values = artChoiceValues(selection, sheet.artChoices);
    if (!key || !values.length) return;
    change({
      artChoices: {
        ...sheet.artChoices,
        [key]: values.map((current, index) =>
          index === choiceIndex ? value : current,
        ),
      },
    });
  };
  const setSpell''',
)

creation_arts = '''          {status.artAllowance > 0 && (
            <section className="creation-magic-section">
              <h3>
                Arts · {sheet.artPicks.filter(Boolean).length}/
                {status.artAllowance}
              </h3>
              {Array.from({ length: status.artAllowance }, (_, index) => {
                const selection = sheet.artPicks[index] || "";
                const choiceDefinition = artChoiceDefinition(selection);
                const choiceValues = artChoiceValues(selection, sheet.artChoices);
                return (
                  <div className="creation-art-row" key={index}>
                    <label>
                      <span>
                        {status.forcedArts[index]
                          ? `Required Art · ${artSelectionName(status.forcedArts[index])}`
                          : `Art ${index + 1}`}
                      </span>
                      <select
                        value={selection}
                        onChange={(event) => setArt(index, event.target.value)}
                      >
                        <option value="">
                          {status.forcedArts[index]
                            ? `Choose ${artSelectionName(status.forcedArts[index])}…`
                            : "Choose an Art…"}
                        </option>
                        {status.availableArts
                          .filter((art) => (art.minLevel || 1) <= 1)
                          .filter(
                            (art) =>
                              !status.forcedArts[index] ||
                              art.value === status.forcedArts[index],
                          )
                          .map((art) => {
                            const prerequisiteMissing =
                              art.name === "Deep Apprehension" &&
                              !sheet.artPicks.some(
                                (choice) =>
                                  artSelectionName(choice) ===
                                  "Surface Apprehension",
                              );
                            const duplicate =
                              art.name !== "Skilled" &&
                              sheet.artPicks.some(
                                (choice, row) =>
                                  row !== index && choice === art.value,
                              );
                            const available = !prerequisiteMissing && !duplicate;
                            return (
                              <option
                                key={`${art.tradition}-${art.name}`}
                                value={art.value}
                                disabled={!available}
                              >
                                {art.tradition} · {art.name}
                                {prerequisiteMissing
                                  ? " — requires Surface Apprehension"
                                  : duplicate
                                    ? " — already selected"
                                    : ""}
                              </option>
                            );
                          })}
                      </select>
                    </label>
                    {choiceDefinition && (
                      <div className="art-choice-fields" aria-label={choiceDefinition.label}>
                        {choiceValues.map((value, choiceIndex) => (
                          <label key={`${artChoiceKey(selection)}-${choiceIndex}`}>
                            <span>
                              {choiceDefinition.itemLabel}
                              {choiceDefinition.count > 1 ? ` ${choiceIndex + 1}` : ""}
                            </span>
                            <input
                              value={value}
                              maxLength={80}
                              onChange={(event) =>
                                setArtChoice(selection, choiceIndex, event.target.value)
                              }
                            />
                          </label>
                        ))}
                        <small>{choiceDefinition.help}</small>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}
'''
replace_between(
    "app/character-creation-wizard.tsx",
    "          {status.artAllowance > 0 && (",
    "          {status.knownSpellAllowance > 0 && (",
    creation_arts,
)

# Level-up support for parameterized Arts selected after level 1.
replace_once(
    "app/level-up-wizard.tsx",
    '''  artSelectionName,
  artSelectionValue,
  creationFocusBonusSkill,''',
    '''  artSelectionName,
  artSelectionValue,
  artChoiceDefinition,
  artChoiceIsComplete,
  artChoiceKey,
  artChoiceValues,
  creationFocusBonusSkill,''',
)
replace_once(
    "app/level-up-wizard.tsx",
    '''  const artsComplete = newArts === requiredArtPicks && educationForcedArts.every((required) =>
    state.draft.artPicks.slice(sheet.artPicks.length).includes(required),
  );''',
    '''  const newArtSelections = state.draft.artPicks.slice(sheet.artPicks.length);
  const artsComplete = newArts === requiredArtPicks && educationForcedArts.every((required) =>
    newArtSelections.includes(required),
  ) && newArtSelections.every((selection) =>
    artChoiceIsComplete(selection, state.draft.artChoices),
  );''',
)
level_up = Path("app/level-up-wizard.tsx")
level_up_text = level_up.read_text()
reset_pattern = "artPicks: clone(sheet.artPicks), spellPicks: clone(sheet.spellPicks)"
reset_count = level_up_text.count(reset_pattern)
if reset_count != 4:
    raise SystemExit(
        f"app/level-up-wizard.tsx: expected 4 Art reset matches, found {reset_count}"
    )
level_up.write_text(
    level_up_text.replace(
        reset_pattern,
        "artPicks: clone(sheet.artPicks), artChoices: clone(sheet.artChoices), spellPicks: clone(sheet.spellPicks)",
    )
)

levelup_arts = '''      {requiredArtPicks > 0 && <div className="creation-magic-section">
        <h3>Arts ({newArts}/{requiredArtPicks})</h3>
        {Array.from({ length: requiredArtPicks }, (_, index) => {
          const requiredArt = educationForcedArts[index] || "";
          const artIndex = sheet.artPicks.length + index;
          const selection = state.draft.artPicks[artIndex] || "";
          const choiceDefinition = artChoiceDefinition(selection);
          const choiceValues = artChoiceValues(selection, state.draft.artChoices);
          return <div className="creation-art-row" key={index}>
            <label>
              <span>{requiredArt ? `Required Art · ${artSelectionName(requiredArt)}` : `New Art ${index + 1}`}</span>
              <select value={selection} onChange={(event) => update((draft) => ({
                ...draft,
                artPicks: [...draft.artPicks.slice(0, artIndex), event.target.value, ...draft.artPicks.slice(artIndex + 1)],
              }))}>
                <option value="">{requiredArt ? `Choose ${artSelectionName(requiredArt)}…` : "Choose an Art…"}</option>
                {artOptions.filter((art) => {
                  if (requiredArt && art.value !== requiredArt) return false;
                  const duplicate = art.name !== "Skilled" && state.draft.artPicks.some((picked, selectedIndex) => selectedIndex !== artIndex && picked === art.value);
                  const needsSurface = art.name === "Deep Apprehension" && !state.draft.artPicks.some((picked) => artSelectionName(picked) === "Surface Apprehension");
                  return !duplicate && !needsSurface;
                }).map((art) => <option key={art.value} value={art.value}>{art.name} · {art.tradition}</option>)}
              </select>
            </label>
            {choiceDefinition && <div className="art-choice-fields" aria-label={choiceDefinition.label}>
              {choiceValues.map((value, choiceIndex) => <label key={`${artChoiceKey(selection)}-${choiceIndex}`}>
                <span>{choiceDefinition.itemLabel}{choiceDefinition.count > 1 ? ` ${choiceIndex + 1}` : ""}</span>
                <input value={value} maxLength={80} onChange={(event) => update((draft) => ({
                  ...draft,
                  artChoices: {
                    ...draft.artChoices,
                    [artChoiceKey(selection)]: choiceValues.map((current, valueIndex) => valueIndex === choiceIndex ? event.target.value : current),
                  },
                }))}/>
              </label>)}
              <small>{choiceDefinition.help}</small>
            </div>}
          </div>;
        })}
      </div>}
'''
replace_between(
    "app/level-up-wizard.tsx",
    '      {requiredArtPicks > 0 && <div className="creation-magic-section">',
    "      {plan.spellPicks > 0 &&",
    levelup_arts,
)

# Audit fixtures and regression coverage.
replace_once(
    "tests/level-one-creation-audit.test.mjs",
    '''  creationBackgroundSkillChoiceOptions,
  artSelectionValue,
  creationFocusClassCategory,''',
    '''  creationBackgroundSkillChoiceOptions,
  artSelectionName,
  artSelectionValue,
  creationFocusClassCategory,''',
)
replace_once(
    "tests/level-one-creation-audit.test.mjs",
    "    artPicks: [],\n    spellPicks: [],",
    "    artPicks: [],\n    artChoices: {},\n    spellPicks: [],",
)
replace_once(
    "tests/level-one-creation-audit.test.mjs",
    '''  assert.equal(arts.length, status.artAllowance, "enough level-1 Arts exist for the active traditions");
  const spells =''',
    '''  assert.equal(arts.length, status.artAllowance, "enough level-1 Arts exist for the active traditions");
  const artChoices = { ...(initial.artChoices || {}) };
  for (const selection of arts) {
    const name = artSelectionName(selection);
    if (name === "Favored Weapon") artChoices[name] = ["Long sword"];
    if (name === "Style Weaponry") artChoices[name] = ["Swords", "Bows", "Axes"];
  }
  const spells =''',
)
replace_once(
    "tests/level-one-creation-audit.test.mjs",
    "  return { ...initial, artPicks: arts, spellPicks: spells };",
    "  return { ...initial, artPicks: arts, artChoices, spellPicks: spells };",
)

replace_once(
    "tests/character-creation.test.mjs",
    '''  creationBackgroundSkillChoiceOptions,
  creationBackgroundSkillChoiceValue,
  creationSkillGrantResolutions,''',
    '''  artChoiceDefinition,
  artChoiceIsComplete,
  artChoiceValues,
  creationBackgroundSkillChoiceOptions,
  creationBackgroundSkillChoiceValue,
  creationSkillGrantResolutions,''',
)
replace_once(
    "tests/character-creation.test.mjs",
    "  artPicks: [],\n  spellPicks: [],",
    "  artPicks: [],\n  artChoices: {},\n  spellPicks: [],",
)
test_file = Path("tests/character-creation.test.mjs")
test_text = test_file.read_text()
marker = 'test("level-one guided creation requires an explicit starting-equipment path", () => {'
if test_text.count(marker) != 1:
    raise SystemExit("tests/character-creation.test.mjs: regression insertion marker mismatch")
regression = '''test("parameterized Arts require their SRD weapon choices", () => {
  assert.equal(artChoiceDefinition("Favored Weapon")?.count, 1);
  assert.equal(artChoiceDefinition("Style Weaponry")?.count, 3);
  assert.deepEqual(artChoiceValues("Style Weaponry", {}), ["", "", ""]);
  assert.equal(artChoiceIsComplete("Favored Weapon", {}), false);
  assert.equal(
    artChoiceIsComplete("Favored Weapon", { "Favored Weapon": ["Long sword"] }),
    true,
  );
  assert.equal(
    artChoiceIsComplete("Style Weaponry", {
      "Style Weaponry": ["Swords", "Bows", "Axes"],
    }),
    true,
  );
  assert.equal(
    artChoiceIsComplete("Style Weaponry", {
      "Style Weaponry": ["Swords", "swords", "Axes"],
    }),
    false,
    "the three Vowed weapon classes must be distinct",
  );
});

'''
test_file.write_text(test_text.replace(marker, regression + marker, 1))

# Layout support for parameter fields.
replace_once(
    "app/globals.css",
    ".art-card{display:grid;grid-template-columns:1fr 72px 65px;gap:7px;align-items:center}.quiet",
    ".art-card{display:grid;grid-template-columns:1fr 72px 65px;gap:7px;align-items:center}.art-choice-fields{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:8px;border:1px solid #d2c2a0;background:#fff9ec}.art-choice-fields label{margin:0}.art-choice-fields small{grid-column:1/-1;color:var(--muted);font:10px/1.35 var(--font-ui)}.quiet",
)
replace_once(
    "app/character-creation-wizard.css",
    ".creation-magic-section select,\n",
    ".creation-magic-section select,\n.creation-magic-section input,\n",
)
wizard_css = Path("app/character-creation-wizard.css")
wizard_css_text = wizard_css.read_text()
if ".creation-art-row {" in wizard_css_text:
    raise SystemExit("app/character-creation-wizard.css: creation-art-row CSS already exists")
wizard_css.write_text(
    wizard_css_text
    + '''
.creation-art-row {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.creation-art-row .art-choice-fields {
  margin-top: 0;
}
@media (max-width: 760px) {
  .art-choice-fields {
    grid-template-columns: 1fr;
  }
  .art-choice-fields small {
    grid-column: 1;
  }
}
'''
)
