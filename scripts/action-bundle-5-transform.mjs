import { access, readFile, rm, writeFile } from "node:fs/promises";

const replaceOnce = (source, search, replacement, label) => {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`Missing transform target: ${label}`);
  if (source.indexOf(search, index + search.length) >= 0) throw new Error(`Ambiguous transform target: ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + search.length);
};

const replaceRegexOnce = (source, pattern, replacement, label) => {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`Expected one ${label} match, found ${matches.length}`);
  return source.replace(pattern, replacement);
};

const exists = async path => access(path).then(() => true, () => false);

let sheet = await readFile("app/character-sheet.tsx", "utf8");

sheet = replaceOnce(
  sheet,
  "type Sheet = typeof initial;\n",
  `type Sheet = typeof initial;\n\nconst CHARACTER_BUILD_KEYS = [\n  "name",\n  "player",\n  "className",\n  "classMode",\n  "classOne",\n  "classTwo",\n  "vowedEffortSkill",\n  "wiseConceptSkill",\n  "beastmasterBond",\n  "autoClassRules",\n  "level",\n  "homeland",\n  "employer",\n  "profession",\n  "species",\n  "description",\n  "background",\n  "backgroundDevelopmentMethod",\n  "backgroundCombatSkill",\n  "backgroundQuickSkillReplacements",\n  "backgroundLearningPicks",\n  "backgroundDevelopmentRolls",\n  "backgroundDevelopmentLegacy",\n  "benefits",\n  "attributeMethod",\n  "attributeRolls",\n  "attributeSubstitution",\n  "attributeBoosts",\n  "attrs",\n  "skills",\n  "skillPurchases",\n  "focusPicks",\n  "artPicks",\n  "artChoices",\n  "languages",\n] as const satisfies readonly (keyof Sheet)[];\n\nconst CHARACTER_BUILD_KEY_SET = new Set<keyof Sheet>(CHARACTER_BUILD_KEYS);\n\nfunction restoreCharacterBuildFields(current: Sheet, snapshot: Sheet): Sheet {\n  const next = { ...current } as Sheet;\n  for (const key of CHARACTER_BUILD_KEYS) {\n    (next as unknown as Record<string, unknown>)[key] = structuredClone(\n      (snapshot as unknown as Record<string, unknown>)[key],\n    );\n  }\n  return next;\n}\n`,
  "character build key model",
);

sheet = replaceOnce(
  sheet,
  `function Section({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {\n  return <section className={\`sheet-section \${className}\`}><header><h2>{title}</h2></header>{aside && <div className="section-aside">{aside}</div>}<div className="section-body">{children}</div></section>;\n}`,
  `function Section({ title, aside, children, className = "", buildControlled = false }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; buildControlled?: boolean }) {\n  return <section className={\`sheet-section \${className}\`} data-character-build-section={buildControlled ? "true" : undefined}><header><h2>{title}</h2></header>{aside && <div className="section-aside">{aside}</div>}<div className="section-body">{children}</div></section>;\n}`,
  "Section build-controlled prop",
);

sheet = replaceOnce(
  sheet,
  `  const [wizardOpen, setWizardOpen] = useState(false);\n  const [levelUpOpen, setLevelUpOpen] = useState(false);\n  const [sheet, setSheet] = useState<Sheet>(() =>`,
  `  const [wizardOpen, setWizardOpen] = useState(false);\n  const [levelUpOpen, setLevelUpOpen] = useState(false);\n  const [characterEditMode, setCharacterEditMode] = useState(false);\n  const characterEditSnapshot = useRef<Sheet | null>(null);\n  const [sheet, setSheet] = useState<Sheet>(() =>`,
  "character edit state",
);

sheet = sheet.replace(`  const [claimToken, setClaimToken] = useState("");\n  const [claimBusy, setClaimBusy] = useState(false);\n`, "");

sheet = replaceOnce(
  sheet,
  `  const canEdit = signedIn && (!cloudId || cloudCanEdit);\n  const updateJoinedLiveSessionCampaign = useCallback((campaignId: string | null) => setJoinedLiveSessionCampaignId(campaignId), []);`,
  `  const canEdit = signedIn && (!cloudId || cloudCanEdit);\n  const buildFieldsEditable = canEdit && (!cloudId || characterEditMode);\n  const updateJoinedLiveSessionCampaign = useCallback((campaignId: string | null) => setJoinedLiveSessionCampaignId(campaignId), []);`,
  "build fields editable state",
);

sheet = replaceOnce(
  sheet,
  `  useEffect(() => {\n    if (!hydrated || !canEdit || !cloudId || cloudVersion === null) return;`,
  `  useEffect(() => {\n    if (!hydrated || !canEdit || !cloudId || cloudVersion === null || characterEditMode) return;`,
  "suspend autosave during character edits",
);

sheet = replaceOnce(
  sheet,
  `  }, [sheet, hydrated, cloudId, canEdit]);\n\n  useEffect(() => {\n    const surface = editableSurface.current;`,
  `  }, [sheet, hydrated, cloudId, canEdit, characterEditMode]);\n\n  useEffect(() => {\n    const surface = editableSurface.current;`,
  "autosave dependency",
);

const oldDisableEffect = `    controls.forEach(control => {\n      const staysInteractive = Boolean(\n        control.closest('[data-readonly-interactive="true"]'),\n      );\n      if (!canEdit && !staysInteractive && !control.disabled) {\n        control.dataset.phase4bDisabled = "true";\n        control.disabled = true;\n      } else if (canEdit && control.dataset.phase4bDisabled === "true") {\n        control.disabled = false;\n        delete control.dataset.phase4bDisabled;\n      }\n    });\n  }, [canEdit, sheet, tab]);`;
const newDisableEffect = `    controls.forEach(control => {\n      const readonlyInteractive = Boolean(\n        control.closest('[data-readonly-interactive="true"]'),\n      );\n      const buildControlled = Boolean(\n        control.closest('[data-character-build-section="true"], [data-character-build-control="true"]'),\n      );\n      const playStateControl = Boolean(\n        control.closest('[data-character-play-state="true"]'),\n      );\n      const disabledForPermission = !canEdit && !readonlyInteractive;\n      const disabledForBuildLock = canEdit && !buildFieldsEditable && buildControlled && !readonlyInteractive && !playStateControl;\n      const shouldDisable = disabledForPermission || disabledForBuildLock;\n      if (shouldDisable && !control.disabled) {\n        control.dataset.sheetModeDisabled = "true";\n        if (disabledForBuildLock) control.dataset.characterBuildDisabled = "true";\n        control.disabled = true;\n      } else if (!shouldDisable && control.dataset.sheetModeDisabled === "true") {\n        control.disabled = false;\n        delete control.dataset.sheetModeDisabled;\n        delete control.dataset.characterBuildDisabled;\n      }\n    });\n  }, [canEdit, buildFieldsEditable, sheet, tab]);`;
sheet = replaceOnce(sheet, oldDisableEffect, newDisableEffect, "read-only/build-lock control effect");

sheet = replaceOnce(
  sheet,
  `  const patch = <K extends keyof Sheet>(key: K, value: Sheet[K]) => {\n    if (!canEdit) return;\n    setSheet(s => ({ ...s, [key]: value }));\n  };`,
  `  const patch = <K extends keyof Sheet>(key: K, value: Sheet[K]) => {\n    if (!canEdit || (!buildFieldsEditable && CHARACTER_BUILD_KEY_SET.has(key))) return;\n    setSheet(s => ({ ...s, [key]: value }));\n  };`,
  "patch foundational guard",
);

sheet = replaceOnce(
  sheet,
  `  const changeBeastmasterBond = (bond: Sheet["beastmasterBond"]) => {\n    if (!canEdit) return;`,
  `  const changeBeastmasterBond = (bond: Sheet["beastmasterBond"]) => {\n    if (!buildFieldsEditable) return;`,
  "beastmaster foundational guard",
);

sheet = replaceOnce(
  sheet,
  `      setSaved(payload.permissions?.canEdit ? "Saved online" : "Read-only");\n      setLibraryOpen(false);`,
  `      setSaved(payload.permissions?.canEdit ? "Saved online" : "Read-only");\n      setCharacterEditMode(false);\n      characterEditSnapshot.current = null;\n      setLibraryOpen(false);`,
  "lock opened cloud characters",
);

sheet = replaceOnce(
  sheet,
  `  async function addCurrentToLibrary(character = sheet) {`,
  `  async function addCurrentToLibrary(\n    character = sheet,\n    options: { keepBuildEditing?: boolean } = {},\n  ) {`,
  "addCurrentToLibrary options",
);

sheet = replaceOnce(
  sheet,
  `      lastCloudData.current = JSON.stringify(nextCharacter);\n      setSaved("Saved online");\n      window.history.pushState(`,
  `      lastCloudData.current = JSON.stringify(nextCharacter);\n      setSaved("Saved online");\n      if (options.keepBuildEditing) {\n        characterEditSnapshot.current = structuredClone(nextCharacter);\n        setCharacterEditMode(true);\n      } else {\n        characterEditSnapshot.current = null;\n        setCharacterEditMode(false);\n      }\n      window.history.pushState(`,
  "post-create build mode",
);

sheet = replaceOnce(
  sheet,
  `  async function saveToCloud() {\n    if (!signedIn || !canEdit || !cloudId || cloudVersion === null) return;`,
  `  async function saveToCloud(): Promise<boolean> {\n    if (!signedIn || !canEdit || !cloudId || cloudVersion === null) return false;`,
  "saveToCloud boolean return",
);

sheet = replaceOnce(
  sheet,
  `        setTransferMessage("Someone else saved this character while you were editing. Your changes are still on this screen. Open the shared library and choose whether to reload the online copy or duplicate this one.");\n        return;`,
  `        setTransferMessage("Someone else saved this character while you were editing. Your changes are still on this screen. Open the shared library and choose whether to reload the online copy or duplicate this one.");\n        return false;`,
  "save conflict return",
);

sheet = replaceOnce(
  sheet,
  `      setSaved(\`Saved online at \${new Date(String(payload.updatedAt)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}\`);\n      void refreshLibrary("mine");\n    } catch (error) {\n      setSaved("Not saved online");\n      setTransferMessage(error instanceof Error ? error.message : "The character could not be saved.");\n    }\n  }`,
  `      setSaved(\`Saved online at \${new Date(String(payload.updatedAt)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}\`);\n      void refreshLibrary("mine");\n      return true;\n    } catch (error) {\n      setSaved("Not saved online");\n      setTransferMessage(error instanceof Error ? error.message : "The character could not be saved.");\n      return false;\n    }\n  }\n\n  function beginCharacterEdit() {\n    if (!cloudId || !canEdit || cloudArchivedAt) return;\n    characterEditSnapshot.current = structuredClone(sheet);\n    setCharacterEditMode(true);\n    setTransferMessage("Foundational character fields are unlocked. Save or cancel when you are finished.");\n  }\n\n  async function saveCharacterEdits() {\n    if (!characterEditMode) return;\n    const succeeded = await saveToCloud();\n    if (!succeeded) return;\n    characterEditSnapshot.current = null;\n    setCharacterEditMode(false);\n    setCreationEntry("none");\n    setTransferMessage("Character-building changes saved. Foundational fields are locked again.");\n  }\n\n  function cancelCharacterEdits() {\n    const snapshot = characterEditSnapshot.current;\n    if (snapshot) setSheet(current => restoreCharacterBuildFields(current, snapshot));\n    characterEditSnapshot.current = null;\n    setCharacterEditMode(false);\n    setCreationEntry("none");\n    setTransferMessage("Character-building changes discarded. Play-state changes were kept.");\n  }`,
  "character edit commands",
);

sheet = replaceRegexOnce(
  sheet,
  /\n  async function claimLegacyCharacters\(\) \{[\s\S]*?\n  \}\n\n  function beginNewCharacter/,
  `\n  function beginNewCharacter`,
  "legacy claim handler",
);

sheet = replaceOnce(
  sheet,
  `    lastCloudData.current = "";\n    void addCurrentToLibrary(fresh);`,
  `    lastCloudData.current = "";\n    characterEditSnapshot.current = mode === "blank" ? structuredClone(fresh) : null;\n    setCharacterEditMode(mode === "blank");\n    void addCurrentToLibrary(fresh, { keepBuildEditing: mode === "blank" });`,
  "blank creation remains editable",
);

sheet = replaceOnce(
  sheet,
  `      setTransferMessage("Guided creation is complete. This is now an ordinary editable character sheet.");`,
  `      setCharacterEditMode(false);\n      characterEditSnapshot.current = null;\n      setTransferMessage("Guided creation is complete. Foundational choices are locked; use Edit Character at the bottom if they need correction.");`,
  "guided creation completion lock",
);

sheet = replaceOnce(
  sheet,
  `<textarea ref={characterNameInput} className="character-name" rows={1} value={sheet.name} onChange={e => patch("name", e.target.value)} aria-label="Character name" />`,
  `<textarea ref={characterNameInput} className="character-name" data-character-build-control="true" rows={1} value={sheet.name} onChange={e => patch("name", e.target.value)} aria-label="Character name" />`,
  "hero name build control",
);

for (const [oldText, newText, label] of [
  [`<Section title="Identity">`, `<Section title="Identity" buildControlled>`, "Identity section"],
  [`<Section title="Base Attributes"`, `<Section title="Base Attributes" buildControlled`, "attributes section"],
  [`<Section title="Foci"`, `<Section title="Foci" buildControlled`, "Foci section"],
  [`<Section title="Skills"`, `<Section title="Skills" buildControlled`, "Skills section"],
  [`<Section title="Languages"`, `<Section title="Languages" buildControlled`, "Languages section"],
  [`<Section title="Vowed Discipline">`, `<Section title="Vowed Discipline" buildControlled>`, "Vowed section"],
  [`<Section title="Wise Concept">`, `<Section title="Wise Concept" buildControlled>`, "Wise section"],
  [`<Section title="Beastmaster Companion Bond">`, `<Section title="Beastmaster Companion Bond" buildControlled>`, "Beastmaster bond section"],
  [`<Section title="Arts"`, `<Section title="Arts" buildControlled`, "Arts section"],
]) {
  sheet = replaceOnce(sheet, oldText, newText, label);
}

sheet = replaceOnce(
  sheet,
  `<button type="button" className="level-up-inline-button" onClick={() => setLevelUpMode(true)}>Level Up</button>`,
  `<button type="button" className="level-up-inline-button" data-readonly-interactive="true" onClick={() => setLevelUpMode(true)}>Level Up</button>`,
  "level-up build-lock exemption",
);

sheet = replaceOnce(
  sheet,
  `<label className="check"><input type="checkbox" checked={Boolean(sheet.artEffort[i])}`,
  `<label className="check" data-character-play-state="true"><input type="checkbox" checked={Boolean(sheet.artEffort[i])}`,
  "Art Effort play-state exemption",
);

sheet = replaceRegexOnce(
  sheet,
  /\n\s*\{signedIn && libraryScope === "mine" && <form className="legacy-claim"[\s\S]*?<\/form>\}/,
  "",
  "legacy claim form",
);
sheet = sheet.replace("Create a character or use a legacy claim token.", "Create a character to begin your roster.");

sheet = replaceOnce(
  sheet,
  `        {cloudId && canEdit && campaignLinks.length > 0 && <section className="character-campaign-links" data-readonly-interactive="true" aria-labelledby="character-campaign-links-title">\n          <div>\n            <strong id="character-campaign-links-title">Campaigns</strong>\n            <small>{campaignLinks.length === 1 ? "This character is linked to one private campaign." : \`This character is linked to \${campaignLinks.length} private campaigns.\`}</small>\n          </div>\n          <nav aria-label="Campaigns linked to this character">\n            {campaignLinks.map(campaign => <a key={campaign.id} href={\`/campaigns/\${campaign.id}\`}>\n              <span>{campaign.name}</span>\n              <span aria-hidden="true">→</span>\n            </a>)}\n          </nav>\n        </section>}\n        {cloudId && canEdit && <section className="character-sharing character-sharing-footer" data-readonly-interactive="true" aria-labelledby="character-sharing-title">\n          <div className="character-sharing-heading">\n            <strong id="character-sharing-title">Privacy & Sharing</strong>\n            <small>Choose who can view this character.</small>\n          </div>\n          <label><span>Visibility</span><select value={cloudVisibility} onChange={event => void changeVisibility(event.target.value as CharacterVisibility)}>\n            <option value="private">Private · only you</option>\n            <option value="unlisted">Unlisted · anyone with link</option>\n            <option value="public">Public · discoverable</option>\n          </select></label>\n          {cloudVisibility !== "private" && <button type="button" onClick={() => void copyShareLink()}>Copy Share Link</button>}\n          <small className="character-sharing-status">{cloudVisibility === "private" ? "Not available to other visitors." : cloudVisibility === "unlisted" ? "Viewable at its stable link, but absent from Public Characters." : "Viewable at its stable link and listed in Public Characters."}</small>\n        </section>}`,
  `        {cloudId && canEdit && <section className="character-bottom-utilities" data-readonly-interactive="true" aria-label="Character utilities">\n          <div className="character-edit-utility">\n            <span className="character-utility-label">Character</span>\n            {characterEditMode ? <div className="character-edit-actions">\n              <button type="button" className="character-utility-primary" onClick={() => void saveCharacterEdits()}>Save Character</button>\n              <button type="button" onClick={cancelCharacterEdits}>Cancel</button>\n            </div> : <button type="button" onClick={beginCharacterEdit} disabled={Boolean(cloudArchivedAt)}>Edit Character</button>}\n          </div>\n          {campaignLinks.length > 0 && <details className="character-campaign-utility">\n            <summary>Campaigns ({campaignLinks.length})</summary>\n            <nav aria-label="Campaigns linked to this character">\n              {campaignLinks.map(campaign => <a key={campaign.id} href={\`/campaigns/\${campaign.id}\`}>{campaign.name}<span aria-hidden="true">→</span></a>)}\n            </nav>\n          </details>}\n          <label className="character-visibility-utility"><span>Visibility</span><select value={cloudVisibility} onChange={event => void changeVisibility(event.target.value as CharacterVisibility)}>\n            <option value="private">Private · only you</option>\n            <option value="unlisted">Unlisted · anyone with link</option>\n            <option value="public">Public · discoverable</option>\n          </select></label>\n          {cloudVisibility !== "private" && <button type="button" className="character-share-utility" onClick={() => void copyShareLink()}>Copy Share Link</button>}\n          <small className="character-utility-status">{characterEditMode ? "Foundational fields unlocked until saved or cancelled." : "Foundational fields locked. Play-state fields remain editable."}</small>\n        </section>}`,
  "single-row bottom utilities",
);

sheet = replaceOnce(
  sheet,
  `          ? <button type="button" onClick={() => void saveToCloud()}>Save Now</button>`,
  `          ? <button type="button" onClick={() => void (characterEditMode ? saveCharacterEdits() : saveToCloud())}>{characterEditMode ? "Save Character" : "Save Now"}</button>`,
  "header save respects character edit mode",
);

await writeFile("app/character-sheet.tsx", sheet);

let dashboard = await readFile("app/dashboard-page.tsx", "utf8");
dashboard = dashboard.replace(`  const [claimBusy, setClaimBusy] = useState(false);\n`, "");
dashboard = dashboard.replace(`  const [claimToken, setClaimToken] = useState("");\n`, "");
dashboard = replaceRegexOnce(
  dashboard,
  /\n  async function claimLegacyCharacter\(event: React\.FormEvent<HTMLFormElement>\) \{[\s\S]*?\n  \}\n\n/,
  "\n",
  "dashboard legacy claim handler",
);
dashboard = dashboard.replace("Create a new folio or use a legacy claim token to bring an adventurer here.", "Create a new folio to begin your roster.");
dashboard = dashboard.replace(`aria-label="Character recovery tools"`, `aria-label="Character browsing tools"`);
dashboard = replaceRegexOnce(
  dashboard,
  /\n\s*<section className="dashboard-tool">\n\s*<p className="dashboard-kicker">RECOVER A RECORD<\/p>[\s\S]*?<\/section>/,
  "",
  "dashboard legacy claim card",
);
await writeFile("app/dashboard-page.tsx", dashboard);

let identifiers = await readFile("lib/characters/identifiers.ts", "utf8");
identifiers = identifiers.replace(`import { hashOpaqueToken, randomBase64URL } from "../security/opaque-tokens.ts";`, `import { randomBase64URL } from "../security/opaque-tokens.ts";`);
identifiers = identifiers.replace(`const CLAIM_TOKEN_BYTES = 32;\n`, "");
identifiers = replaceRegexOnce(
  identifiers,
  /\nexport function generateLegacyClaimToken\(\): string \{[\s\S]*?\nexport function hashLegacyClaimToken\(token: string\): Promise<string> \{\n  return hashOpaqueToken\(token\);\n\}\n/,
  "\n",
  "legacy claim identifier helpers",
);
await writeFile("lib/characters/identifiers.ts", identifiers);

let schema = await readFile("db/schema.ts", "utf8");
schema = replaceRegexOnce(
  schema,
  /\nexport const legacyCharacterClaims = sqliteTable\([\s\S]*?\nexport const campaigns = sqliteTable\(/,
  `\nexport const campaigns = sqliteTable(`,
  "legacy claim schema exports",
);
await writeFile("db/schema.ts", schema);

const packagePath = "package.json";
const pkg = JSON.parse(await readFile(packagePath, "utf8"));
delete pkg.scripts["legacy-claim:create"];
delete pkg.scripts["legacy-claim:revoke"];
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

for (const path of [
  "app/api/legacy-claims/route.ts",
  "lib/characters/claims.ts",
  "scripts/create-legacy-claim.mjs",
  "scripts/revoke-legacy-claim.mjs",
]) {
  if (await exists(path)) await rm(path);
}

let css = await readFile("app/globals.css", "utf8");
css += `\n\n/* Character sheet build/edit boundary and consolidated bottom utilities. */\n[data-character-build-disabled="true"]{cursor:not-allowed!important;color:color-mix(in srgb,var(--ink) 58%,transparent);background:color-mix(in srgb,var(--paper2) 72%,#c8b995 28%)!important}\n.character-name[data-character-build-control="true"]:disabled{cursor:not-allowed;color:var(--ink);background:transparent!important;-webkit-text-fill-color:var(--ink);opacity:.78}\n.character-bottom-utilities{margin:18px 28px 28px;padding:10px 12px;border:1px solid var(--line);background:rgba(161,126,66,.07);display:flex;align-items:center;gap:10px 12px;min-width:0;font:11px/1.35 var(--font-ui)}\n.character-bottom-utilities button,.character-bottom-utilities summary{border:1px solid #9b7a49;background:#fff9ec;color:#65451d;border-radius:3px;padding:7px 10px;cursor:pointer;font-weight:700}\n.character-bottom-utilities button:disabled{cursor:not-allowed;opacity:.5}\n.character-edit-utility{display:flex;align-items:center;gap:8px;flex:0 0 auto}\n.character-edit-actions{display:flex;gap:6px}.character-utility-primary{background:#6f4b1d!important;color:#fff5df!important;border-color:#5d3d15!important}\n.character-utility-label,.character-visibility-utility>span{font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}\n.character-campaign-utility{position:relative;flex:0 0 auto}.character-campaign-utility summary{list-style:none}.character-campaign-utility summary::-webkit-details-marker{display:none}.character-campaign-utility nav{position:absolute;left:0;bottom:calc(100% + 6px);z-index:30;min-width:240px;max-width:min(360px,80vw);padding:7px;background:var(--paper2);border:1px solid var(--line);box-shadow:0 10px 28px #0003;display:grid;gap:4px}.character-campaign-utility a{display:flex;justify-content:space-between;gap:16px;padding:7px 8px;color:var(--ink);text-decoration:none}.character-campaign-utility a:hover,.character-campaign-utility a:focus-visible{background:#efe0c3}\n.character-visibility-utility{display:flex;align-items:center;gap:7px;min-width:0}.character-visibility-utility select{min-width:190px;padding:6px}\n.character-share-utility{flex:0 0 auto}.character-utility-status{margin-left:auto;color:var(--muted);font:12px/1.3 var(--font-body);text-align:right;max-width:300px}\n@media(max-width:720px){.character-bottom-utilities{margin:14px 16px 20px;flex-wrap:wrap;align-items:stretch}.character-edit-utility,.character-visibility-utility{flex:1 1 100%;justify-content:space-between}.character-edit-actions{flex:1}.character-edit-actions button{flex:1}.character-visibility-utility select{min-width:0;flex:1}.character-campaign-utility,.character-share-utility{flex:1 1 auto}.character-campaign-utility summary,.character-share-utility{width:100%}.character-utility-status{flex:1 1 100%;max-width:none;text-align:left;margin-left:0}}\n`;
css = css.replace(/\.legacy-claim\{[^}]*\}/g, "").replace(/\.legacy-claim [^{]+\{[^}]*\}/g, "");
await writeFile("app/globals.css", css);

const sharingTest = `import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nimport test from "node:test";\n\nconst source = async path => readFile(new URL(\`../\${path}\`, import.meta.url), "utf8");\n\ntest("character management is consolidated into one owner-only bottom utility bar", async () => {\n  const sheet = await source("app/character-sheet.tsx");\n  const css = await source("app/globals.css");\n  const marker = 'className="character-bottom-utilities"';\n  const utilityIndex = sheet.indexOf(marker);\n  const heroIndex = sheet.indexOf('<div className="hero">');\n\n  assert.notEqual(utilityIndex, -1);\n  assert.ok(utilityIndex > heroIndex, "character utilities should follow the character sheet content");\n  assert.equal((sheet.match(/className="character-bottom-utilities"/g) || []).length, 1);\n  assert.match(sheet, /cloudId && canEdit && <section className="character-bottom-utilities"/u);\n  assert.match(sheet, />Edit Character<\\/button>/u);\n  assert.match(sheet, />Save Character<\\/button>/u);\n  assert.match(sheet, />Cancel<\\/button>/u);\n  assert.match(sheet, /Campaigns \(\{campaignLinks\.length\}\)/u);\n  assert.match(sheet, /value=\{cloudVisibility\}/u);\n  assert.match(sheet, /changeVisibility/u);\n  assert.match(sheet, /copyShareLink/u);\n  for (const value of ["private", "unlisted", "public"]) assert.match(sheet, new RegExp(\`value="\${value}"\`, "u"));\n  assert.doesNotMatch(sheet, /character-sharing-footer/u);\n  assert.match(css, /\\.character-bottom-utilities\\{/u);\n  assert.match(css, /@media\\(max-width:720px\\).*\\.character-bottom-utilities\\{[^}]*flex-wrap:wrap/su);\n});\n`;
await writeFile("tests/character-sharing-ui.test.mjs", sharingTest);

const editModeTest = `import assert from "node:assert/strict";\nimport { access, readFile } from "node:fs/promises";\nimport test from "node:test";\n\nconst source = async path => readFile(new URL(\`../\${path}\`, import.meta.url), "utf8");\nconst missing = async path => access(new URL(\`../\${path}\`, import.meta.url)).then(() => false, () => true);\n\ntest("saved characters lock foundational fields behind Edit Character", async () => {\n  const sheet = await source("app/character-sheet.tsx");\n  assert.match(sheet, /const buildFieldsEditable = canEdit && \\(!cloudId \\|\\| characterEditMode\\)/u);\n  for (const key of ["attrs", "skills", "background", "classOne", "classTwo", "focusPicks", "artPicks", "languages"]) assert.match(sheet, new RegExp(\`"\${key}"\`, "u"));\n  for (const title of ["Identity", "Base Attributes", "Foci", "Skills", "Languages", "Arts"]) assert.match(sheet, new RegExp(\`<Section title="\${title}"[^>]*buildControlled\`, "u"));\n  assert.match(sheet, /data-character-build-control="true"[^>]*aria-label="Character name"/u);\n  assert.match(sheet, /data-character-play-state="true"><input type="checkbox" checked=\{Boolean\(sheet\.artEffort\[i\]\)\}/u);\n  assert.match(sheet, /disabledForBuildLock = canEdit && !buildFieldsEditable/u);\n  assert.match(sheet, /CHARACTER_BUILD_KEY_SET\.has\(key\)/u);\n});\n\ntest("play state stays outside character-build locking", async () => {\n  const sheet = await source("app/character-sheet.tsx");\n  assert.match(sheet, /<Section title="Health & Defenses">/u);\n  assert.match(sheet, /patch\("hpCurrent"/u);\n  assert.match(sheet, /patch\("strainCurrent"/u);\n  assert.match(sheet, /<Section title="Spellbook"/u);\n  assert.doesNotMatch(sheet, /<Section title="Spellbook"[^>]*buildControlled/u);\n  assert.match(sheet, /<Section title="Notes">/u);\n  assert.match(sheet, /patch\("notes"/u);\n  assert.match(sheet, /tab === "inventory"/u);\n});\n\ntest("blank creation remains editable until its explicit first save and edit cancel is transactional", async () => {\n  const sheet = await source("app/character-sheet.tsx");\n  assert.match(sheet, /setCharacterEditMode\(mode === "blank"\)/u);\n  assert.match(sheet, /addCurrentToLibrary\(fresh, \{ keepBuildEditing: mode === "blank" \}\)/u);\n  assert.match(sheet, /characterEditSnapshot\.current = structuredClone\(sheet\)/u);\n  assert.match(sheet, /restoreCharacterBuildFields\(current, snapshot\)/u);\n  assert.match(sheet, /cloudVersion === null \\|\\| characterEditMode\) return/u);\n  assert.match(sheet, /setCharacterEditMode\(false\);[\\s\\S]*Foundational fields are locked again/u);\n});\n\ntest("legacy character claiming is removed from active application code", async () => {\n  const [sheet, dashboard, identifiers, schema, pkg] = await Promise.all([\n    source("app/character-sheet.tsx"), source("app/dashboard-page.tsx"), source("lib/characters/identifiers.ts"), source("db/schema.ts"), source("package.json"),\n  ]);\n  for (const text of [sheet, dashboard]) {\n    assert.doesNotMatch(text, /Claim a legacy character|legacy claim token|\\/api\\/legacy-claims/iu);\n  }\n  assert.doesNotMatch(identifiers, /LegacyClaim|legacy claim|claim_/iu);\n  assert.doesNotMatch(schema, /legacyCharacterClaim|legacy_character_claim/iu);\n  assert.doesNotMatch(pkg, /legacy-claim:/u);\n  for (const path of ["app/api/legacy-claims/route.ts", "lib/characters/claims.ts", "scripts/create-legacy-claim.mjs", "scripts/revoke-legacy-claim.mjs"]) assert.equal(await missing(path), true, \`\${path} should be removed\`);\n});\n`;
await writeFile("tests/character-edit-mode.test.mjs", editModeTest);

const dashboardSource = await readFile("app/dashboard-page.tsx", "utf8");
if (/legacy claim|legacy-claims|claimLegacy/iu.test(dashboardSource)) throw new Error("Legacy claim reference remains in dashboard");
const sheetSource = await readFile("app/character-sheet.tsx", "utf8");
if (/legacy-claim|claimLegacyCharacters|\/api\/legacy-claims/iu.test(sheetSource)) throw new Error("Legacy claim path remains in character sheet");

console.log("Action Bundle 5 transformation complete.");
