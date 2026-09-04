"use client";

import { useEffect, useMemo, useState } from "react";
import { backgroundNames, backgrounds } from "./background-data";
import {
  blankBackgroundDevelopmentRoll,
  blankBackgroundDevelopmentRolls,
  blankBackgroundLearningPicks,
  blankBackgroundQuickSkillReplacements,
  backgroundDevelopmentRollFromDie,
  backgroundTableDieSides,
  rollBackgroundTable,
} from "./background-development";
import { fullClasses, partialClasses } from "./class-data";
import { rollDice } from "./dice";
import { focusTargetAvailable } from "./phase2-rules";
import { foci } from "./wwn-data";
import {
  creationEquipmentKindAlreadyPurchased,
  creationEquipmentRemainingCopper,
  purchaseCreationEquipment,
  removeCreationEquipmentPurchase,
  rollCreationStartingSilver,
  selectCreationEquipmentMethod,
  selectStartingEquipmentPackage,
  type CreationEquipmentResult,
} from "./creation-equipment";
import {
  formatEquipmentCost,
  purchasableEquipment,
  purchasableEquipmentById,
  startingEquipmentPackageById,
  startingEquipmentPackages,
} from "./equipment-data";
import {
  choiceOptionsForBackgroundResult,
  artSelectionName,
  artChoiceDefinition,
  artChoiceKey,
  artChoiceValues,
  chosenFriendBenefitArts,
  creationBackgroundSkillChoiceOptions,
  creationBackgroundSkillChoiceValue,
  creationAttributes,
  backgroundAttributeChoices,
  backgroundAttributePointCount,
  creationFocusChoiceLabel,
  creationFocusChoiceOptions,
  creationNoncombatSkills,
  creationPartialClassPairIsLegal,
  creationSkillRankCanBeSelected,
  creationSkillGrantResolutions,
  creationSkills,
  creationSteps,
  levelOneCreationStatus,
  manualBackgroundLearningOptions,
  standardCreationArray,
  type CreationAttribute,
  type LevelOneCreationCharacter,
} from "./character-creation";
import "./character-creation-wizard.css";

type Props = {
  sheet: LevelOneCreationCharacter;
  canEdit: boolean;
  persistenceKey: string;
  reviewStats: { ac: number; attack: number };
  onChange: (update: Partial<LevelOneCreationCharacter>) => void;
  onPortrait: (file: File | undefined) => void;
  onExit: () => void;
  onFinish: () => void;
};

const lastStepStorageKey = (key: string) =>
  `twe-guided-creation:last-step:${key}`;
const skillRankLabel = (rank: number) => (rank < 0 ? "Untrained" : `+${rank}`);
const focusCategories: Record<string, string> = {
  Armsmaster: "Combat",
  Assassin: "Combat",
  "Close Combatant": "Combat",
  Deadeye: "Combat",
  "Shocking Assault": "Combat",
  "Sniper’s Eye": "Combat",
  "Unarmed Combatant": "Combat",
  "Valiant Defender": "Combat",
  "Whirlwind Assault": "Combat",
  "Armored Magic": "Magic",
  "Traditional Education": "Magic",
  Nullifier: "Magic",
  "Special Origin": "Origin",
  Xenoblooded: "Origin",
};
const focusCategory = (name: string) => focusCategories[name] || "General";
function StepTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="creation-step-title">
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </header>
  );
}

function ReviewSection({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: (typeof creationSteps)[number]["id"];
  onEdit: (step: (typeof creationSteps)[number]["id"]) => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header>
        <h3>{title}</h3>
        <button
          type="button"
          className="text-button"
          onClick={() => onEdit(step)}
        >
          Edit
        </button>
      </header>
      {children}
    </section>
  );
}

function MiniSummary({ sheet }: { sheet: LevelOneCreationCharacter }) {
  const status = levelOneCreationStatus(sheet);
  const shownSkills = Object.entries(status.skillRanks)
    .filter(([, rank]) => rank >= 0)
    .slice(0, 6);
  return (
    <div className="creation-summary-content">
      <div>
        <span>Level</span>
        <b>1</b>
      </div>
      <div>
        <span>Class</span>
        <b>{status.classLabel || "Not chosen"}</b>
      </div>
      <div>
        <span>Background</span>
        <b>{sheet.background || "Not chosen"}</b>
      </div>
      <div className="creation-summary-attributes">
        <span>Attributes</span>
        <p>
          {creationAttributes
            .map(
              (attribute) =>
                `${attribute} ${status.attributeScore(attribute)} (${status.attributeModifier(attribute) >= 0 ? "+" : ""}${status.attributeModifier(attribute)})`,
            )
            .join(" · ")}
        </p>
      </div>
      <div>
        <span>Skills</span>
        <p>
          {shownSkills.length
            ? shownSkills
                .map(([name, rank]) => `${name} ${skillRankLabel(rank)}`)
                .join(" · ")
            : "No trained skills yet"}
        </p>
      </div>
      <div>
        <span>Foci</span>
        <p>
          {sheet.focusPicks
            .filter((pick) => pick.name)
            .map((pick) => pick.name)
            .join(" · ") || "Not chosen"}
        </p>
      </div>
      {status.magicalTraditions.length > 0 && (
        <div>
          <span>Magic</span>
          <p>
            {status.magicalTraditions.join(" + ")} ·{" "}
            {sheet.spellPicks.filter((pick) => pick.name).length}/
            {status.knownSpellAllowance} spells
          </p>
        </div>
      )}
    </div>
  );
}

export function GuidedCreationWizard({
  sheet,
  canEdit,
  persistenceKey,
  reviewStats,
  onChange,
  onPortrait,
  onExit,
  onFinish,
}: Props) {
  const initialStep = () => {
    if (typeof window === "undefined") return 0;
    const value = Number(
      window.localStorage.getItem(lastStepStorageKey(persistenceKey)),
    );
    return Number.isInteger(value) && value >= 0 && value < creationSteps.length
      ? value
      : 0;
  };
  const [stepIndex, setStepIndex] = useState(initialStep);
  const [focusQuery, setFocusQuery] = useState("");
  const [focusFilter, setFocusFilter] = useState("All Foci");
  const [notice, setNotice] = useState("");
  const [startingSilverInput, setStartingSilverInput] = useState("");
  const status = useMemo(() => levelOneCreationStatus(sheet), [sheet]);
  const effectiveStepIndex =
    !status.hasMagicStep && creationSteps[stepIndex]?.id === "magic"
      ? creationSteps.findIndex((item) => item.id === "equipment")
      : stepIndex;
  const step = creationSteps[effectiveStepIndex];
  const displayedSteps = creationSteps.filter(
    (item) => item.id !== "magic" || status.hasMagicStep,
  );
  const displayedIndex = displayedSteps.findIndex(
    (item) => item.id === step.id,
  );

  useEffect(() => {
    window.localStorage.setItem(
      lastStepStorageKey(persistenceKey),
      String(effectiveStepIndex),
    );
  }, [effectiveStepIndex, persistenceKey]);

  const change = (update: Partial<LevelOneCreationCharacter>) => {
    if (!canEdit) return;
    onChange(update);
  };
  const nextStep = () => {
    const problem = status.stepStatus[step.id].issues[0];
    if (problem && step.id !== "review") {
      setNotice(problem);
      return;
    }
    const next = creationSteps
      .slice(effectiveStepIndex + 1)
      .find((item) => item.id !== "magic" || status.hasMagicStep);
    if (next)
      setStepIndex(creationSteps.findIndex((item) => item.id === next.id));
  };
  const previousStep = () => {
    const previous = [...creationSteps.slice(0, effectiveStepIndex)]
      .reverse()
      .find((item) => item.id !== "magic" || status.hasMagicStep);
    if (previous)
      setStepIndex(creationSteps.findIndex((item) => item.id === previous.id));
  };
  const goToStep = (id: (typeof creationSteps)[number]["id"]) =>
    setStepIndex(creationSteps.findIndex((item) => item.id === id));
  const chooseBackground = (background: string) => {
    change({
      background,
      backgroundCombatSkill: "",
      backgroundQuickSkillReplacements:
        blankBackgroundQuickSkillReplacements(background),
      backgroundDevelopmentMethod:
        sheet.backgroundDevelopmentMethod === "review"
          ? "quick"
          : sheet.backgroundDevelopmentMethod,
      backgroundLearningPicks: blankBackgroundLearningPicks(),
      backgroundDevelopmentRolls: blankBackgroundDevelopmentRolls(),
    });
    setNotice(
      background
        ? "Background benefits have been reset. Class, Foci, and unrelated choices remain."
        : "",
    );
  };
  const setClass = (key: "classOne" | "classTwo", value: string) => {
    const earlierFoci = sheet.focusPicks
      .filter((pick) => pick.name)
      .map((pick) => pick.name)
      .join(", ");
    change({ [key]: value } as Partial<LevelOneCreationCharacter>);
    if (earlierFoci)
      setNotice(
        "Class changed. Legal later choices were kept; the normal character rules clear incompatible choices and the review marks anything that now needs attention.",
      );
  };
  const setFocus = (index: number, name: string) => {
    const eligibility = status.focusEligibility(name, index);
    if (!eligibility.eligible) {
      setNotice(eligibility.reason);
      return;
    }
    change({
      focusPicks: sheet.focusPicks.map((pick, row) =>
        row === index ? { ...pick, name, level: 1, choice: "" } : pick,
      ),
    });
  };
  const addFocusSlot = () =>
    change({ focusPicks: [...sheet.focusPicks, { name: "", level: 1 }] });
  const updateFocus = (
    index: number,
    update: Partial<LevelOneCreationCharacter["focusPicks"][number]>,
  ) =>
    change({
      focusPicks: sheet.focusPicks.map((pick, row) =>
        row === index ? { ...pick, ...update } : pick,
      ),
    });
  const removeFocus = (index: number) =>
    change({ focusPicks: sheet.focusPicks.filter((_, row) => row !== index) });
  const setSkill = (skill: string, rank: number) => {
    if (!creationSkillRankCanBeSelected(sheet, skill, rank)) {
      setNotice(
        "At level 1, the single free creation pick cannot create a skill above level 1 or fund extra skill ranks.",
      );
      return;
    }
    const sourceCount = status.sources[skill].length;
    const storedRank = Math.max(-1, Math.min(1, rank - sourceCount));
    const next = { ...sheet.skillPurchases, [skill]: storedRank };
    const candidate = levelOneCreationStatus({
      ...sheet,
      skillPurchases: next,
    });
    if (
      candidate.freeSkillPlan.spending > 0 ||
      candidate.skillRanks[skill] > 1
    ) {
      setNotice(
        "At level 1, the single free creation pick cannot create a skill above level 1 or fund extra skill ranks.",
      );
      return;
    }
    change({ skillPurchases: next });
  };
  const setArt = (index: number, name: string) =>
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
  const setBeastmasterBond = (bond: LevelOneCreationCharacter["beastmasterBond"]) => {
    const redundant = chosenFriendBenefitArts as readonly string[];
    change({
      beastmasterBond: bond,
      ...(bond === "chosen-friend"
        ? {
            artPicks: sheet.artPicks.map((selection) =>
              redundant.includes(artSelectionName(selection)) ? "" : selection,
            ),
          }
        : {}),
    });
  };
  const setSpell = (index: number, name: string) =>
    change({
      spellPicks: Array.from(
        { length: Math.max(sheet.spellPicks.length, index + 1) },
        (_, row) =>
          row === index
            ? {
                ...sheet.spellPicks[row],
                name,
                prepared: false,
                cast: false,
                casts: 0,
              }
            : sheet.spellPicks[row] || {
                name: "",
                prepared: false,
                cast: false,
                casts: 0,
              },
      ),
    });
  const applyEquipmentResult = (result: CreationEquipmentResult) => {
    if (!result.ok) {
      setNotice(result.reason);
      return;
    }
    setNotice("");
    change(result.update);
  };
  const backgroundGrants = creationSkillGrantResolutions(sheet);
  const updateBackgroundGrant = (
    id: string,
    field: "choice" | "replacement",
    value: string,
  ) => {
    if (id === "background-free") {
      change({ backgroundCombatSkill: value });
      return;
    }
    if (id.startsWith("quick-")) {
      const index = Number(id.slice("quick-".length));
      if (field === "choice") {
        change({ backgroundCombatSkill: value });
        return;
      }
      change({
        backgroundQuickSkillReplacements:
          blankBackgroundQuickSkillReplacements(sheet.background).map(
            (_, row) =>
              row === index
                ? value
                : sheet.backgroundQuickSkillReplacements[row] || "",
          ),
      });
      return;
    }
    if (id.startsWith("learning-")) {
      const index = Number(id.slice("learning-".length));
      change({
        backgroundLearningPicks: sheet.backgroundLearningPicks.map(
          (pick, row) => (row === index ? { ...pick, [field]: value } : pick),
        ),
      });
      return;
    }
    if (id.startsWith("roll-")) {
      const index = Number(id.slice("roll-".length));
      change({
        backgroundDevelopmentRolls: sheet.backgroundDevelopmentRolls.map(
          (roll, row) => (row === index ? { ...roll, [field]: value } : roll),
        ),
      });
    }
  };
  const focusOptions = foci.filter((focus) => {
    const matchesQuery = `${focus.name} ${focus.intro}`
      .toLowerCase()
      .includes(focusQuery.trim().toLowerCase());
    return (
      matchesQuery &&
      (focusFilter === "All Foci" || focusCategory(focus.name) === focusFilter)
    );
  });
  const focusChoiceAvailable = (
    pick: LevelOneCreationCharacter["focusPicks"][number],
    index: number,
    choice: string,
  ) =>
    (pick.name !== "Developed Attribute" && pick.name !== "Specialist") ||
    focusTargetAvailable(sheet.focusPicks, pick.name, choice, index);

  const content = (() => {
    if (step.id === "identity")
      return (
        <>
          <StepTitle
            eyebrow="Step 1 · Start with the person"
            title="Identity & Concept"
          >
            <p>
              What kind of adventurer are you creating? These details do not add
              new mechanics.
            </p>
          </StepTitle>
          <div className="creation-fields two-columns">
            <label>
              <span>Character name</span>
              <input
                value={sheet.name}
                onChange={(event) => change({ name: event.target.value })}
                autoComplete="off"
              />
            </label>
            <label>
              <span>Player</span>
              <input
                value={sheet.player}
                onChange={(event) => change({ player: event.target.value })}
                autoComplete="name"
              />
            </label>
            <label>
              <span>Species / race</span>
              <input
                value={sheet.species}
                onChange={(event) => change({ species: event.target.value })}
                placeholder="Human"
              />
            </label>
            <label>
              <span>Homeland</span>
              <input
                value={sheet.homeland}
                onChange={(event) => change({ homeland: event.target.value })}
              />
            </label>
            <label>
              <span>Profession</span>
              <input
                value={sheet.profession}
                onChange={(event) => change({ profession: event.target.value })}
              />
            </label>
            <label className="creation-wide">
              <span>Concept</span>
              <textarea
                value={sheet.description}
                onChange={(event) =>
                  change({ description: event.target.value })
                }
                placeholder="A brief idea for this adventurer."
              />
            </label>
          </div>
          <p className="creation-note">
            <label className="creation-portrait-upload">
              Optional portrait{" "}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => onPortrait(event.target.files?.[0])}
              />
            </label>
          </p>
        </>
      );
    if (step.id === "attributes")
      return (
        <>
          <StepTitle
            eyebrow="Step 2 · Choose your attributes"
            title="Attributes"
          >
            <p>
              Choose an existing legal method. Modifiers update from the same
              character values used on the sheet.
            </p>
          </StepTitle>
          <div
            className="creation-methods"
            role="group"
            aria-label="Attribute method"
          >
            <button
              type="button"
              className={sheet.attributeMethod === "rolled" ? "active" : ""}
              onClick={() =>
                change({ attributeMethod: "rolled", attributeSubstitution: "" })
              }
            >
              Use rolled scores
            </button>
            <button
              type="button"
              className={sheet.attributeMethod === "array" ? "active" : ""}
              onClick={() =>
                change({
                  attributeMethod: "array",
                  attributeSubstitution: "",
                  attrs: Object.fromEntries(
                    creationAttributes.map((attribute, index) => [
                      attribute,
                      standardCreationArray[index],
                    ]),
                  ) as LevelOneCreationCharacter["attrs"],
                })
              }
            >
              Use the standard array
            </button>
          </div>
          {sheet.attributeMethod === "rolled" && (
            <div className="creation-fields two-columns">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const rolls = Object.fromEntries(
                    creationAttributes.map((attribute) => [
                      attribute,
                      rollDice(3, 6).total,
                    ]),
                  ) as LevelOneCreationCharacter["attributeRolls"];
                  change({
                    attributeRolls: rolls,
                    attributeSubstitution: "",
                    attrs: rolls,
                  });
                }}
              >
                Roll 3d6 in order
              </button>
              <label className="creation-select">
                <span>Optional 14 substitution</span>
                <select
                  value={sheet.attributeSubstitution}
                  onChange={(event) => {
                    const attribute = event.target.value as
                      "" | CreationAttribute;
                    const attrs = Object.fromEntries(
                      creationAttributes.map((name) => [
                        name,
                        sheet.attributeRolls[name]
                          ? name === attribute
                            ? 14
                            : sheet.attributeRolls[name]
                          : 0,
                      ]),
                    ) as LevelOneCreationCharacter["attrs"];
                    change({ attributeSubstitution: attribute, attrs });
                  }}
                >
                  <option value="">Do not substitute</option>
                  {creationAttributes.map((attribute) => (
                    <option
                      key={attribute}
                      value={attribute}
                      disabled={!sheet.attributeRolls[attribute]}
                    >
                      {attribute} becomes 14
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="creation-attributes">
            {creationAttributes.map((attribute) => (
              <label key={attribute}>
                <span>{attribute}</span>
                {sheet.attributeMethod === "rolled" ? (
                  <input
                    type="number"
                    min={3}
                    max={18}
                    step={1}
                    value={sheet.attributeRolls[attribute] || ""}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      const value = Number.isInteger(parsed) && parsed >= 3 && parsed <= 18 ? parsed : 0;
                      change({
                        attributeRolls: {
                          ...sheet.attributeRolls,
                          [attribute]: value,
                        },
                        attrs: {
                          ...sheet.attrs,
                          [attribute]: value
                            ? sheet.attributeSubstitution === attribute
                              ? 14
                              : value
                            : 0,
                        },
                      });
                    }}
                  />
                ) : (
                  <select
                    value={sheet.attrs[attribute]}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      const other = creationAttributes.find(
                        (name) =>
                          name !== attribute && sheet.attrs[name] === value,
                      );
                      const attrs = { ...sheet.attrs, [attribute]: value };
                      if (other) attrs[other] = sheet.attrs[attribute];
                      change({ attrs });
                    }}
                  >
                    {standardCreationArray.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                )}
                <b>
                  {status.attributeModifier(attribute) >= 0 ? "+" : ""}
                  {status.attributeModifier(attribute)}
                </b>
              </label>
            ))}
          </div>
          {!status.stepStatus.attributes.complete && (
            <p className="creation-warning">
              {status.stepStatus.attributes.issues.join(" ")}
            </p>
          )}
        </>
      );
    if (step.id === "background")
      return (
        <>
          <StepTitle eyebrow="Step 3 · Establish your past" title="Background">
            <p>
              Pick an identity now. Its optional Growth and Learning decisions
              wait until the wizard can account for your class and Foci.
            </p>
          </StepTitle>
          <div className="creation-choice-grid">
            {backgroundNames.map((name) => (
              <button
                type="button"
                key={name}
                className={sheet.background === name ? "selected" : ""}
                onClick={() => chooseBackground(name)}
              >
                <b>{name}</b>
                <span>Free skill: {backgrounds[name].freeSkill}</span>
                <small>Quick: {backgrounds[name].quickSkills.join(", ")}</small>
              </button>
            ))}
          </div>
          {sheet.background && (
            <aside className="creation-rule-callout">
              <b>{sheet.background} later provides:</b> its free skill, Quick
              Skills or either Growth/Learning development, and any required
              choices. Nothing else is reset when you continue.
            </aside>
          )}
        </>
      );
    if (step.id === "class")
      return (
        <>
          <StepTitle
            eyebrow="Step 4 · Choose your adventuring path"
            title="Class & Tradition"
          >
            <p>
              Class choices use the existing full and partial Class options and
              their automatic effects.
            </p>
          </StepTitle>
          <div
            className="creation-methods"
            role="group"
            aria-label="Class structure"
          >
            <button
              type="button"
              className={sheet.classMode === "full" ? "active" : ""}
              onClick={() =>
                change({
                  classMode: "full",
                  classOne: fullClasses.includes(
                    sheet.classOne as (typeof fullClasses)[number],
                  )
                    ? sheet.classOne
                    : "",
                  classTwo: "",
                })
              }
            >
              One full class
            </button>
            <button
              type="button"
              className={sheet.classMode === "adventurer" ? "active" : ""}
              onClick={() =>
                change({
                  classMode: "adventurer",
                  classOne: partialClasses.includes(
                    sheet.classOne as (typeof partialClasses)[number],
                  )
                    ? sheet.classOne
                    : "",
                  classTwo: "",
                })
              }
            >
              Adventurer · two partial classes
            </button>
          </div>
          <div className="creation-fields two-columns">
            <label>
              <span>
                {sheet.classMode === "full" ? "Class" : "First partial class"}
              </span>
              <select
                value={sheet.classOne}
                onChange={(event) => setClass("classOne", event.target.value)}
              >
                <option value="">Choose…</option>
                {(sheet.classMode === "full"
                  ? fullClasses
                  : partialClasses
                ).map((name) => (
                  <option
                    key={name}
                    value={name}
                    disabled={
                      sheet.classMode === "adventurer" &&
                      !creationPartialClassPairIsLegal(name, sheet.classTwo)
                    }
                  >
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {sheet.classMode === "adventurer" && (
              <label>
                <span>Second partial class</span>
                <select
                  value={sheet.classTwo}
                  onChange={(event) => setClass("classTwo", event.target.value)}
                >
                  <option value="">Choose…</option>
                  {partialClasses.map((name) => (
                    <option
                      key={name}
                      value={name}
                      disabled={!creationPartialClassPairIsLegal(sheet.classOne, name)}
                    >
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {status.selectedClasses.includes("Vowed") && (
              <label>
                <span>Vowed order skill</span>
                <select
                  value={sheet.vowedEffortSkill}
                  onChange={(event) =>
                    change({ vowedEffortSkill: event.target.value })
                  }
                >
                  {creationNoncombatSkills.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            )}
            {status.selectedClasses.includes("Wise") && (
              <label>
                <span>Wise concept skill</span>
                <select
                  value={sheet.wiseConceptSkill}
                  onChange={(event) =>
                    change({ wiseConceptSkill: event.target.value })
                  }
                >
                  <option value="">Choose…</option>
                  {creationSkills.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {status.classLabel && (
            <aside className="creation-rule-callout">
              <b>{status.classLabel}</b>
              <span>{status.rules.summary}</span>
              <span>
                Base attack {status.rules.attack >= 0 ? "+" : ""}
                {status.rules.attack} · {status.rules.focusPicks} starting Focus
                pick{status.rules.focusPicks === 1 ? "" : "s"}
              </span>
            </aside>
          )}
        </>
      );
    if (step.id === "foci")
      return (
        <>
          <StepTitle
            eyebrow="Step 5 · Talents and Origin"
            title="Foci / Origin"
          >
            <p>
              Categories and search are browsing aids only. Every legal Focus
              remains available.
            </p>
          </StepTitle>
          <div className="focus-browser-tools">
            <label>
              <span>Search Foci</span>
              <input
                value={focusQuery}
                onChange={(event) => setFocusQuery(event.target.value)}
                placeholder="Search name or description"
              />
            </label>
            <div role="group" aria-label="Focus filter">
              {["All Foci", "Combat", "Magic", "Origin", "General"].map(
                (filter) => (
                  <button
                    type="button"
                    key={filter}
                    className={focusFilter === filter ? "active" : ""}
                    onClick={() => setFocusFilter(filter)}
                  >
                    {filter}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="focus-browser-list">
            {focusOptions.map((focus) => {
              const empty = sheet.focusPicks.findIndex((pick) => !pick.name);
              const slotIndex = empty >= 0 ? empty : sheet.focusPicks.length;
              const eligibility = status.focusEligibility(
                focus.name,
                slotIndex,
              );
              return (
                <article key={focus.name}>
                  <div>
                    <span>{focusCategory(focus.name)}</span>
                    <h3>{focus.name}</h3>
                    <p>{focus.intro}</p>
                    <small>{focus.level1}</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!eligibility.eligible) {
                        setNotice(eligibility.reason);
                        return;
                      }
                      if (empty >= 0) setFocus(empty, focus.name);
                      else if (status.focusPicksUsed < status.allowedFocusPicks)
                        change({
                          focusPicks: [
                            ...sheet.focusPicks,
                            { name: focus.name, level: 1, choice: "" },
                          ],
                        });
                      else
                        setNotice("All starting Focus picks are already used.");
                    }}
                    disabled={
                      !eligibility.eligible ||
                      (status.focusPicksUsed >= status.allowedFocusPicks &&
                        !sheet.focusPicks.some((pick) => !pick.name))
                    }
                  >
                    Choose
                  </button>
                </article>
              );
            })}
          </div>
          <section className="creation-selections">
            <header>
              <b>Your Foci</b>
              <span>
                {status.focusPicksUsed}/{status.allowedFocusPicks} picks used
              </span>
            </header>
            {sheet.focusPicks.map((pick, index) => (
              <div className="creation-focus-row" key={`${index}-${pick.name}`}>
                <select
                  value={pick.name}
                  onChange={(event) => setFocus(index, event.target.value)}
                >
                  <option value="">Choose a Focus…</option>
                  {foci.map((focus) => {
                    const eligible = status.focusEligibility(focus.name, index);
                    return (
                      <option
                        key={focus.name}
                        value={focus.name}
                        disabled={!eligible.eligible}
                      >
                        {focus.name}
                        {eligible.eligible ? "" : ` — ${eligible.reason}`}
                      </option>
                    );
                  })}
                </select>
                {pick.name && (
                  <>
                    <select
                      value={pick.level}
                      onChange={(event) =>
                        updateFocus(index, {
                          level: Number(event.target.value),
                        })
                      }
                    >
                      <option value={1}>Level 1</option>
                      <option
                        value={2}
                        disabled={
                          sheet.level !== 1 ||
                          !foci.find((focus) => focus.name === pick.name)
                            ?.level2 ||
                          (pick.level !== 2 &&
                            status.focusPicksUsed >= status.allowedFocusPicks)
                        }
                      >
                        Level 2 · costs two picks
                      </option>
                    </select>
                    {creationFocusChoiceLabel(pick.name) && (
                      <select
                        value={pick.choice || ""}
                        onChange={(event) =>
                          updateFocus(index, { choice: event.target.value })
                        }
                      >
                        <option value="">
                          Choose{" "}
                          {creationFocusChoiceLabel(pick.name).toLowerCase()}…
                        </option>
                        {creationFocusChoiceOptions(pick.name).map((choice) => (
                          <option
                            key={choice}
                            value={choice}
                            disabled={
                              !focusChoiceAvailable(pick, index, choice)
                            }
                          >
                            {choice === "Other"
                              ? "Other non-stat benefit"
                              : choice}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => removeFocus(index)}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            ))}
            {sheet.focusPicks.length < status.allowedFocusPicks && (
              <button
                type="button"
                className="secondary-button"
                onClick={addFocusSlot}
              >
                Add Focus slot
              </button>
            )}
          </section>
          <p className="creation-note">
            <b>Origin / species:</b> Species is descriptive unless your campaign
            provides a mechanical Origin Focus. Existing Origin Foci, including
            Xenoblooded, use the normal Focus pick and are shown here without
            duplicate species mechanics.
          </p>
        </>
      );
    if (step.id === "skills")
      return (
        <>
          <StepTitle
            eyebrow="Step 6 · Resolve remaining creation benefits"
            title="Background Benefits & Skills"
          >
            <p>
              The ledger shows every automatic source before you make optional
              Background and free-skill selections.
            </p>
          </StepTitle>
          {backgrounds[sheet.background] && (
            <section className="creation-background-benefits">
              <h3>{sheet.background} development</h3>
              <div className="creation-methods">
                <button
                  type="button"
                  className={
                    sheet.backgroundDevelopmentMethod === "quick"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    change({ backgroundDevelopmentMethod: "quick" })
                  }
                >
                  Quick Skills
                </button>
                <button
                  type="button"
                  className={
                    sheet.backgroundDevelopmentMethod === "choose-learning"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    change({ backgroundDevelopmentMethod: "choose-learning" })
                  }
                >
                  Choose Learning
                </button>
                <button
                  type="button"
                  className={
                    sheet.backgroundDevelopmentMethod === "roll-growth-learning"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    change({
                      backgroundDevelopmentMethod: "roll-growth-learning",
                    })
                  }
                >
                  Roll Growth / Learning
                </button>
              </div>
              {sheet.backgroundDevelopmentMethod === "quick" && (
                <p>
                  Quick Skills:{" "}
                  {backgrounds[sheet.background].quickSkills.join(" · ")}
                </p>
              )}
              {sheet.backgroundDevelopmentMethod === "choose-learning" && (
                <div className="two-columns">
                  {sheet.backgroundLearningPicks.map((pick, index) => (
                    <label key={index}>
                      <span>Learning result {index + 1}</span>
                      <select
                        value={pick.result}
                        onChange={(event) =>
                          change({
                            backgroundLearningPicks:
                              sheet.backgroundLearningPicks.map((value, row) =>
                                row === index
                                  ? {
                                      ...value,
                                      result: event.target.value,
                                      choice: "",
                                      replacement: "",
                                    }
                                  : value,
                              ),
                          })
                        }
                      >
                        <option value="">Choose…</option>
                        {manualBackgroundLearningOptions(sheet.background)
                          .map((result) => (
                            <option key={result}>{result}</option>
                          ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              {sheet.backgroundDevelopmentMethod === "roll-growth-learning" && (
                <div className="creation-rolls">
                  {sheet.backgroundDevelopmentRolls.map((roll, index) => {
                    const attributeOptions = backgroundAttributeChoices(
                      roll.result,
                    );
                    const pointCount = backgroundAttributePointCount(
                      roll.result,
                    );
                    return (
                      <article key={index}>
                        <select
                          value={roll.table}
                          onChange={(event) =>
                            change({
                              backgroundDevelopmentRolls:
                                sheet.backgroundDevelopmentRolls.map(
                                  (value, row) =>
                                    row === index
                                      ? blankBackgroundDevelopmentRoll(
                                          event.target.value as
                                            "growth" | "learning",
                                        )
                                      : value,
                                ),
                            })
                          }
                        >
                          <option value="growth">Growth d6</option>
                          <option value="learning">Learning d8</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            change({
                              backgroundDevelopmentRolls:
                                sheet.backgroundDevelopmentRolls.map(
                                  (value, row) =>
                                    row === index
                                      ? rollBackgroundTable(
                                          sheet.background,
                                          value.table,
                                        )
                                      : value,
                                ),
                            })
                          }
                        >
                          Roll
                        </button>
                        <label>
                          <span>Physical result</span>
                          <input
                            type="number"
                            min={1}
                            max={backgroundTableDieSides(sheet.background, roll.table)}
                            step={1}
                            value={roll.die || ""}
                            onChange={(event) => {
                              const die = Number(event.target.value);
                              change({
                                backgroundDevelopmentRolls:
                                  sheet.backgroundDevelopmentRolls.map(
                                    (value, row) =>
                                      row === index
                                        ? backgroundDevelopmentRollFromDie(
                                            sheet.background,
                                            value.table,
                                            die,
                                          )
                                        : value,
                                  ),
                              });
                            }}
                          />
                        </label>
                        <b>{roll.result || "Not rolled"}</b>
                        {pointCount > 0 && (
                          <div className="creation-growth-choices">
                            {Array.from(
                              { length: pointCount },
                              (_, pointIndex) => (
                                <label key={pointIndex}>
                                  <span>Growth point {pointIndex + 1}</span>
                                  <select
                                    value={
                                      roll.attributeChoices[pointIndex] || ""
                                    }
                                    onChange={(event) =>
                                      change({
                                        backgroundDevelopmentRolls:
                                          sheet.backgroundDevelopmentRolls.map(
                                            (value, row) =>
                                              row === index
                                                ? {
                                                    ...value,
                                                    attributeChoices:
                                                      Array.from(
                                                        { length: pointCount },
                                                        (_, choiceIndex) =>
                                                          choiceIndex ===
                                                          pointIndex
                                                            ? (event.target
                                                                .value as CreationAttribute)
                                                            : value
                                                                .attributeChoices[
                                                                choiceIndex
                                                              ] || "",
                                                      ) as CreationAttribute[],
                                                  }
                                                : value,
                                          ),
                                      })
                                    }
                                  >
                                    <option value="">Choose attribute…</option>
                                    {attributeOptions.map((attribute) => (
                                      <option key={attribute} value={attribute}>
                                        {attribute}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ),
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {backgroundGrants.some(
            (grant) => choiceOptionsForBackgroundResult(grant.result).length > 0 || grant.needsReplacement,
          ) && (
            <section className="creation-choice-resolutions">
              <h3>Resolve Background choices</h3>
              <p>
                These are the remaining choices from your selected Background
                method. The ledger updates immediately.
              </p>
              {backgroundGrants
                .filter((grant) => choiceOptionsForBackgroundResult(grant.result).length > 0 || grant.needsReplacement)
                .map((grant) => {
                  const usesSharedCombatChoice =
                    grant.id === "background-free" ||
                    grant.id.startsWith("quick-");
                  const canStoreReplacement =
                    grant.id.startsWith("quick-") ||
                    grant.id.startsWith("learning-") ||
                    grant.id.startsWith("roll-");
                  const constrainedChoice = choiceOptionsForBackgroundResult(grant.result).length > 0;
                  const options = constrainedChoice
                    ? creationBackgroundSkillChoiceOptions(sheet, grant.id)
                    : grant.replacementOptions;
                  const value = constrainedChoice
                    ? creationBackgroundSkillChoiceValue(sheet, grant.id)
                    : grant.replacementOptions.includes(grant.replacement || "")
                      ? grant.replacement || ""
                      : "";
                  const field = constrainedChoice || !canStoreReplacement
                    ? ("choice" as const)
                    : ("replacement" as const);
                  const label = grant.needsReplacement
                    ? usesSharedCombatChoice || grant.result.startsWith("Any Combat")
                      ? "choose a different combat skill"
                      : "choose another skill"
                    : grant.result;
                  return (
                    <label key={grant.id}>
                      <span>
                        {grant.source}: {label}
                        {grant.needsReplacement && (
                          <small>
                            {grant.rawSkill} is already at the level-1 starting
                            maximum. Choose a different skill.
                          </small>
                        )}
                      </span>
                      <select
                        value={value}
                        onChange={(event) =>
                          updateBackgroundGrant(
                            grant.id,
                            field,
                            event.target.value,
                          )
                        }
                      >
                        <option value="">Choose…</option>
                        {options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
            </section>
          )}
          <section className="skill-ledger">
            <header>
              <div>
                <p>SKILL LEDGER</p>
                <h3>Sources before choices</h3>
              </div>
              <span>
                Free pick: {status.freeSkillPlan.freeSkill || "not chosen"}
              </span>
            </header>
            <div className="skill-ledger-list">
              {creationSkills.map((skill) => (
                <article key={skill}>
                  <div>
                    <b>
                      {skill} {skillRankLabel(status.skillRanks[skill])}
                    </b>
                    {status.sources[skill].length ? (
                      <ul>
                        {status.sources[skill].map((source, index) => (
                          <li key={`${source}-${index}`}>{source}</li>
                        ))}
                      </ul>
                    ) : (
                      <small>No automatic grant</small>
                    )}
                  </div>
                  <select
                    aria-label={`${skill} starting rank`}
                    value={status.skillRanks[skill]}
                    onChange={(event) =>
                      setSkill(skill, Number(event.target.value))
                    }
                  >
                    {[-1, 0, 1].map((rank) => (
                      <option
                        key={rank}
                        value={rank}
                        disabled={
                          !creationSkillRankCanBeSelected(sheet, skill, rank)
                        }
                      >
                        {skillRankLabel(rank)}
                      </option>
                    ))}
                  </select>
                </article>
              ))}
            </div>
          </section>
          {!status.stepStatus.skills.complete && (
            <p className="creation-warning">
              {status.stepStatus.skills.issues.join(" ")}
            </p>
          )}
        </>
      );
    if (step.id === "magic")
      return (
        <>
          <StepTitle
            eyebrow="Step 7 · Only choices your tradition permits"
            title="Magic"
          >
            <p>
              Existing tradition lists, level limits, and preparation rules
              determine every option below.
            </p>
          </StepTitle>
          {status.selectedClasses.includes("Vowed") && (
            <label className="creation-select">
              <span>Vowed order skill</span>
              <select
                value={sheet.vowedEffortSkill}
                onChange={(event) =>
                  change({ vowedEffortSkill: event.target.value })
                }
              >
                {creationNoncombatSkills.map((skill) => (
                  <option key={skill}>{skill}</option>
                ))}
              </select>
            </label>
          )}
          {status.selectedClasses.includes("Beastmaster") && (
            <section className="creation-magic-section creation-beastmaster-bond">
              <h3>Companion bond</h3>
              <label>
                <span>Beastmaster companion</span>
                <select
                  value={sheet.beastmasterBond}
                  onChange={(event) =>
                    setBeastmasterBond(
                      event.target.value as LevelOneCreationCharacter["beastmasterBond"],
                    )
                  }
                >
                  <option value="">Choose a companion bond…</option>
                  <option value="bind-companion">
                    Bind Companion · flexible bond
                  </option>
                  <option value="chosen-friend">
                    Chosen Friend · lifelong bond
                  </option>
                </select>
                <small>
                  Choose this bond once for the Beastmaster. Both options use
                  the required Bind Companion Art. Chosen Friend does not spend
                  your additional Art pick; instead, that one permanent companion
                  automatically gains the benefits of Shared Vitality and Mind Call.
                </small>
              </label>
              {sheet.beastmasterBond === "chosen-friend" && (
                <p className="creation-choice-note">
                  A Chosen Friend is your only possible bound companion. If it
                  reaches 0 HP it disappears and returns beside you at the next
                  dawn with full hit points.
                </p>
              )}
            </section>
          )}
          {status.artAllowance > 0 && (
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
          {status.knownSpellAllowance > 0 && (
            <section className="creation-magic-section">
              <h3>
                Starting spells ·{" "}
                {sheet.spellPicks.filter((pick) => pick.name).length}/
                {status.knownSpellAllowance}
              </h3>
              {Array.from(
                { length: status.knownSpellAllowance },
                (_, index) => (
                  <label key={index}>
                    <span>Spell {index + 1}</span>
                    <select
                      value={sheet.spellPicks[index]?.name || ""}
                      onChange={(event) => setSpell(index, event.target.value)}
                    >
                      <option value="">Choose a spell…</option>
                      {status.availableSpells
                        .filter((spell) => spell.level <= status.limits.max)
                        .map((spell) => {
                          const duplicate = sheet.spellPicks.some(
                            (pick, row) =>
                              row !== index && pick.name === spell.name,
                          );
                          return (
                            <option
                              key={`${spell.tradition}-${spell.name}`}
                              value={spell.name}
                              disabled={duplicate}
                            >
                              Level {spell.level} · {spell.tradition} ·{" "}
                              {spell.name}
                              {duplicate ? " — already selected" : ""}
                            </option>
                          );
                        })}
                    </select>
                  </label>
                ),
              )}
            </section>
          )}
          {!status.stepStatus.magic.complete && (
            <p className="creation-warning">
              {status.stepStatus.magic.issues.join(" ")}
            </p>
          )}
        </>
      );
    if (step.id === "equipment")
      return (() => {
        const selectedPackage = startingEquipmentPackageById.get(
          sheet.creationEquipmentPackage,
        );
        const remainingCopper = creationEquipmentRemainingCopper(sheet);
        const purchasedArmor = creationEquipmentKindAlreadyPurchased(
          sheet,
          "armor",
        );
        const purchasedShield = creationEquipmentKindAlreadyPurchased(
          sheet,
          "shield",
        );
        return (
        <>
          <StepTitle
            eyebrow="Step 8 · Choose starting gear"
            title="Starting Equipment"
          >
            <p>
              Take one of the six premade packages, or roll 3d6 × 10 silver
              pieces once and buy from the canonical equipment lists.
            </p>
          </StepTitle>
          <div className="creation-methods creation-equipment-methods" role="group" aria-label="Starting equipment method">
            <button
              type="button"
              className={sheet.creationEquipmentMethod === "package" ? "active" : ""}
              aria-pressed={sheet.creationEquipmentMethod === "package"}
              onClick={() => change(selectCreationEquipmentMethod(sheet, "package"))}
            >
              Premade Package
            </button>
            <button
              type="button"
              className={sheet.creationEquipmentMethod === "buy" ? "active" : ""}
              aria-pressed={sheet.creationEquipmentMethod === "buy"}
              onClick={() => change(selectCreationEquipmentMethod(sheet, "buy"))}
            >
              Buy Equipment
            </button>
          </div>

          {sheet.creationEquipmentMethod === "package" && (
            <section className="creation-equipment-panel">
              <label className="creation-select">
                <span>Starting package</span>
                <select
                  value={sheet.creationEquipmentPackage}
                  onChange={(event) =>
                    applyEquipmentResult(
                      selectStartingEquipmentPackage(sheet, event.target.value),
                    )
                  }
                >
                  <option value="">Choose a package…</option>
                  {startingEquipmentPackages.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedPackage && (
                <div className="creation-package-summary">
                  <h3>{selectedPackage.name}</h3>
                  <p>
                    {[
                      selectedPackage.armor,
                      selectedPackage.shield,
                      ...selectedPackage.weapons,
                      ...selectedPackage.stowed,
                      selectedPackage.silver
                        ? `${selectedPackage.silver} sp`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              )}
            </section>
          )}

          {sheet.creationEquipmentMethod === "buy" && (
            <section className="creation-equipment-panel">
              <div className="creation-equipment-budget">
                <div>
                  <span>Starting silver</span>
                  <b>
                    {sheet.creationStartingSilver === null
                      ? "Not rolled"
                      : `${sheet.creationStartingSilver} sp`}
                  </b>
                </div>
                <div>
                  <span>Remaining</span>
                  <b>
                    {formatEquipmentCost(remainingCopper)}
                  </b>
                </div>
                <button
                  type="button"
                  disabled={sheet.creationStartingSilver !== null}
                  onClick={() =>
                    applyEquipmentResult(
                      rollCreationStartingSilver(sheet, rollDice(3, 6).total),
                    )
                  }
                >
                  {sheet.creationStartingSilver === null
                    ? "Roll Starting Silver"
                    : "Starting Silver Rolled"}
                </button>
                <label className="creation-select">
                  <span>Physical 3d6 total</span>
                  <input
                    type="number"
                    min={3}
                    max={18}
                    step={1}
                    disabled={sheet.creationStartingSilver !== null}
                    value={sheet.creationStartingSilver === null ? startingSilverInput : sheet.creationStartingSilver / 10}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setStartingSilverInput(raw);
                      if (!raw) {
                        setNotice("");
                        return;
                      }
                      applyEquipmentResult(
                        rollCreationStartingSilver(sheet, Number(raw)),
                      );
                    }}
                  />
                </label>
              </div>
              {sheet.creationStartingSilver !== null && (
                <label className="creation-select creation-purchase-select">
                  <span>Buy equipment</span>
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value)
                        applyEquipmentResult(
                          purchaseCreationEquipment(sheet, event.target.value),
                        );
                    }}
                  >
                    <option value="">Choose an item…</option>
                    {(["weapon", "armor", "shield", "gear", "bundle"] as const).map(
                      (kind) => (
                        <optgroup
                          key={kind}
                          label={
                            {
                              weapon: "Weapons",
                              armor: "Armor",
                              shield: "Shields",
                              gear: "Adventuring Gear",
                              bundle: "Gear Bundles",
                            }[kind]
                          }
                        >
                          {purchasableEquipment
                            .filter((item) => item.kind === kind)
                            .map((item) => {
                              const unavailableKind =
                                (kind === "armor" && purchasedArmor) ||
                                (kind === "shield" && purchasedShield);
                              const unaffordable = item.costCopper > remainingCopper;
                              return (
                                <option
                                  key={item.id}
                                  value={item.id}
                                  disabled={unavailableKind || unaffordable}
                                >
                                  {item.name} — {formatEquipmentCost(item.costCopper)}
                                  {unavailableKind
                                    ? ` — remove current ${kind} first`
                                    : unaffordable
                                      ? " — too expensive"
                                      : ""}
                                </option>
                              );
                            })}
                        </optgroup>
                      ),
                    )}
                  </select>
                </label>
              )}
              {sheet.creationEquipmentPurchases.length > 0 && (
                <ul className="creation-purchases">
                  {sheet.creationEquipmentPurchases.map((id, index) => {
                    const item = purchasableEquipmentById.get(id);
                    if (!item) return null;
                    return (
                      <li key={`${id}-${index}`}>
                        <span>
                          <b>{item.name}</b>
                          <small>{formatEquipmentCost(item.costCopper)}</small>
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          onClick={() =>
                            applyEquipmentResult(
                              removeCreationEquipmentPurchase(sheet, index),
                            )
                          }
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {sheet.creationEquipmentMethod && (
            <div className="creation-equipment-result">
              <div>
                <span>Worn armor</span>
                <b>{sheet.armor || "No armor"}</b>
              </div>
              <div>
                <span>Shield</span>
                <b>{sheet.shield || "No shield"}</b>
              </div>
              <div>
                <span>Coin purse</span>
                <b>{sheet.sp} sp{sheet.cp ? ` ${sheet.cp} cp` : ""}</b>
              </div>
            </div>
          )}
          {sheet.creationEquipmentMethod && (
          <div className="creation-equipment-columns">
            <section>
              <h3>Readied</h3>
              <ul>
                {sheet.readied.filter((item) => item.trim()).map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
              {!sheet.readied.some((item) => item.trim()) && <p>None</p>}
            </section>
            <section>
              <h3>Stowed</h3>
              <ul>
                {sheet.stowed.filter((item) => item.trim()).map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
              {!sheet.stowed.some((item) => item.trim()) && <p>None</p>}
            </section>
          </div>
          )}
          <p className="creation-note">
            Weapons are added as canonical Readied items, armor and shields use
            their normal equipped fields, and other gear is Stowed. Everything
            carries directly into the finished character sheet.
          </p>
        </>
        );
      })();
    return (
      <>
        <StepTitle
          eyebrow="Step 9 · Check the finished folio"
          title="Review & Finish"
        >
          <p>
            Finish only opens the ordinary character sheet; it does not create a
            special wizard character.
          </p>
        </StepTitle>
        <div className="creation-review-grid">
          <ReviewSection title="Identity" step="identity" onEdit={goToStep}>
            <p>
              {sheet.name || "Needs a name"} ·{" "}
              {sheet.species || "Species not recorded"}
            </p>
          </ReviewSection>
          <ReviewSection title="Attributes" step="attributes" onEdit={goToStep}>
            <p>
              {creationAttributes
                .map(
                  (attribute) =>
                    `${attribute} ${status.attributeScore(attribute)} (${status.attributeModifier(attribute) >= 0 ? "+" : ""}${status.attributeModifier(attribute)})`,
                )
                .join(" · ")}
            </p>
          </ReviewSection>
          <ReviewSection title="Background" step="background" onEdit={goToStep}>
            <p>{sheet.background || "Needs a Background"}</p>
          </ReviewSection>
          <ReviewSection title="Class" step="class" onEdit={goToStep}>
            <p>{status.classLabel || "Needs a class"}</p>
          </ReviewSection>
          <ReviewSection title="Combat" step="class" onEdit={goToStep}>
            <p>
              HP {status.startingHp || "—"} · AC {reviewStats.ac} · Base attack{" "}
              {reviewStats.attack >= 0 ? "+" : ""}
              {reviewStats.attack} · Saves P {status.saves.Physical}+ / E{" "}
              {status.saves.Evasion}+ / M {status.saves.Mental}+ / L{" "}
              {status.saves.Luck}+
            </p>
            <label>
              <span>Level 1 hit-die roll</span>
              <input
                type="number"
                min={1}
                max={6}
                value={sheet.hpRolls[0] || ""}
                onChange={(event) => {
                  const roll = Number(event.target.value);
                  change({
                    hpRolls:
                      Number.isInteger(roll) && roll >= 1 && roll <= 6
                        ? [roll, ...sheet.hpRolls.slice(1)]
                        : sheet.hpRolls.slice(1),
                  });
                }}
              />
            </label>
            <button
              type="button"
              disabled={Number.isInteger(sheet.hpRolls[0]) && sheet.hpRolls[0] >= 1 && sheet.hpRolls[0] <= 6}
              onClick={() => change({ hpRolls: [rollDice(1, 6).total, ...sheet.hpRolls.slice(1)] })}
            >
              Roll 1d6 for HP
            </button>
          </ReviewSection>
          <ReviewSection title="Skills" step="skills" onEdit={goToStep}>
            <p>
              {creationSkills
                .filter((skill) => status.skillRanks[skill] >= 0)
                .map(
                  (skill) =>
                    `${skill} ${skillRankLabel(status.skillRanks[skill])}`,
                )
                .join(" · ") || "Needs starting skills"}
            </p>
          </ReviewSection>
          <ReviewSection title="Foci" step="foci" onEdit={goToStep}>
            <p>
              {sheet.focusPicks
                .filter((pick) => pick.name)
                .map((pick) => pick.name)
                .join(" · ") || "Needs Foci"}
            </p>
          </ReviewSection>
          <ReviewSection
            title="Magic"
            step={status.hasMagicStep ? "magic" : "class"}
            onEdit={goToStep}
          >
            <p>
              {sheet.spellPicks
                .filter((pick) => pick.name)
                .map((pick) => pick.name)
                .join(" · ") ||
                (status.hasMagicStep
                  ? "Needs magic choices"
                  : "No magical choices")}
            </p>
            {status.selectedClasses.includes("Beastmaster") && (
              <p>
                Companion bond:{" "}
                {sheet.beastmasterBond === "chosen-friend"
                  ? "Chosen Friend"
                  : sheet.beastmasterBond === "bind-companion"
                    ? "Bind Companion"
                    : "Not chosen"}
              </p>
            )}
            {sheet.artPicks.filter(Boolean).length > 0 && (
              <p>Arts: {sheet.artPicks.filter(Boolean).join(" · ")}</p>
            )}
          </ReviewSection>
          <ReviewSection title="Equipment" step="equipment" onEdit={goToStep}>
            <p>
              {sheet.armor || "No armor"}
              {sheet.shield ? ` · ${sheet.shield}` : ""} · {sheet.sp || 0} SP
              {sheet.cp ? ` ${sheet.cp} CP` : ""}
            </p>
            <p>
              Readied:{" "}
              {sheet.readied.filter((item) => item.trim()).join(" · ") ||
                "none"}
            </p>
          </ReviewSection>
        </div>
        {!status.canFinish && (
          <section className="creation-needs-attention">
            <h3>Needs attention</h3>
            <ul>
              {status.issues.map((issue, index) => (
                <li key={`${issue.step}-${index}`}>
                  <button
                    type="button"
                    onClick={() =>
                      setStepIndex(
                        creationSteps.findIndex(
                          (item) => item.id === issue.step,
                        ),
                      )
                    }
                  >
                    {
                      creationSteps.find((item) => item.id === issue.step)
                        ?.label
                    }
                  </button>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {status.canFinish && (
          <p className="creation-success">
            All required level-1 choices are complete. This character is ready
            for the normal sheet.
          </p>
        )}
      </>
    );
  })();

  return (
    <section className="guided-creation" aria-label="Guided character creation">
      <header className="guided-creation-header">
        <div>
          <p>GUIDED CREATION · LEVEL 1</p>
          <h1>Create a Worlds Without Number character</h1>
          <span>
            Choices save to the normal character as you go. You may exit to the
            sheet at any time.
          </span>
        </div>
        <button type="button" className="secondary-button" onClick={onExit}>
          Edit on Character Sheet
        </button>
      </header>
      <details className="creation-mobile-summary">
        <summary>Character so far</summary>
        <MiniSummary sheet={sheet} />
      </details>
      <div className="guided-creation-layout">
        <nav className="creation-progress" aria-label="Creation steps">
          {displayedSteps.map((item, index) => {
            const originalIndex = creationSteps.findIndex(
              (candidate) => candidate.id === item.id,
            );
            const itemStatus = status.stepStatus[item.id];
            return (
              <button
                type="button"
                key={item.id}
                className={[
                  originalIndex === effectiveStepIndex ? "active" : "",
                  !itemStatus.complete && originalIndex < effectiveStepIndex
                    ? "needs-attention"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setStepIndex(originalIndex)}
              >
                <span>{index + 1}</span>
                <b>{item.label}</b>
                {!itemStatus.complete && originalIndex < effectiveStepIndex && (
                  <small>Needs attention</small>
                )}
              </button>
            );
          })}
        </nav>
        <main className="creation-workspace">
          {notice && (
            <div className="creation-notice" role="status">
              {notice}
              <button
                type="button"
                aria-label="Dismiss notice"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {content}
        </main>
        <aside className="creation-summary-rail" aria-label="Character so far">
          <h2>Character so far</h2>
          <MiniSummary sheet={sheet} />
        </aside>
      </div>
      <footer className="creation-navigation">
        <button
          type="button"
          onClick={previousStep}
          disabled={displayedIndex <= 0}
        >
          Back
        </button>
        {step.id === "review" ? (
          <button
            type="button"
            className="primary-button"
            disabled={!status.canFinish}
            onClick={() => {
              if (!status.canFinish) {
                setNotice(
                  "Complete the items marked Needs attention before finishing.",
                );
                return;
              }
              onFinish();
            }}
          >
            Finish creation
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={nextStep}>
            Continue
          </button>
        )}
      </footer>
    </section>
  );
}
