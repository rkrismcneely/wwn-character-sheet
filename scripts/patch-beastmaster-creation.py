from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


path = Path("app/character-creation.ts")
text = path.read_text()

text = replace_once(
    text,
    '''export type CreationSpellPick = {\n  name: string;\n  prepared: boolean;\n  cast: boolean;\n  casts?: number;\n};\n''',
    '''export type CreationSpellPick = {\n  name: string;\n  prepared: boolean;\n  cast: boolean;\n  casts?: number;\n};\n\nexport type BeastmasterBond = "bind-companion" | "chosen-friend";\nexport const beastmasterBondOptions = ["bind-companion", "chosen-friend"] as const;\nexport const chosenFriendBenefitArts = ["Mind Call", "Shared Vitality"] as const;\n''',
    "bond types",
)

text = replace_once(
    text,
    '''  vowedEffortSkill: string;\n  wiseConceptSkill: string;\n  focusPicks: CreationFocusPick[];\n''',
    '''  vowedEffortSkill: string;\n  wiseConceptSkill: string;\n  beastmasterBond: BeastmasterBond;\n  focusPicks: CreationFocusPick[];\n''',
    "bond field",
)

text = replace_once(
    text,
    '''export function levelOneCreationStatus(state: LevelOneCreationCharacter) {\n  const selectedClasses = classNames(state);\n''',
    '''export function levelOneCreationStatus(state: LevelOneCreationCharacter) {\n  const selectedClasses = classNames(state);\n  const chosenFriend =\n    selectedClasses.includes("Beastmaster") && state.beastmasterBond === "chosen-friend";\n''',
    "chosen friend state",
)

text = replace_once(
    text,
    '''  const availableArts = artTraditions.flatMap((tradition) =>\n    (tradition === "High Mage"\n      ? highMageArts\n      : traditionInfo[tradition].arts\n    ).map((art) => ({\n      ...art,\n      minLevel: "minLevel" in art ? art.minLevel : undefined,\n      tradition,\n      value: artSelectionValue(tradition, art.name),\n    })),\n  );\n''',
    '''  const availableArts = artTraditions.flatMap((tradition) =>\n    (tradition === "High Mage"\n      ? highMageArts\n      : traditionInfo[tradition].arts\n    )\n      .filter(\n        (art) =>\n          !(\n            chosenFriend &&\n            tradition === "Beastmaster" &&\n            (chosenFriendBenefitArts as readonly string[]).includes(art.name)\n          ),\n      )\n      .map((art) => ({\n        ...art,\n        minLevel: "minLevel" in art ? art.minLevel : undefined,\n        tradition,\n        value: artSelectionValue(tradition, art.name),\n      })),\n  );\n''',
    "chosen friend art filtering",
)

text = replace_once(
    text,
    '''  if (\n    selectedClasses.includes("Wise") &&\n    !hasNoncombatSkill(state.wiseConceptSkill)\n  )\n    issues.push({ step: "class", message: "Choose the Wise concept skill." });\n''',
    '''  if (\n    selectedClasses.includes("Wise") &&\n    !hasNoncombatSkill(state.wiseConceptSkill)\n  )\n    issues.push({ step: "class", message: "Choose the Wise concept skill." });\n  if (\n    selectedClasses.includes("Beastmaster") &&\n    !beastmasterBondOptions.includes(state.beastmasterBond)\n  )\n    issues.push({\n      step: "magic",\n      message: "Choose whether this Beastmaster uses normal Bind Companion or a Chosen Friend bond.",\n    });\n''',
    "bond validation",
)

path.write_text(text)
print("patched character-creation.ts")
