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
    '''  const selectedClasses = classNames(state);\n  const chosenFriend =\n    selectedClasses.includes("Beastmaster") && state.beastmasterBond === "chosen-friend";\n''',
    '''  const selectedClasses = classNames(state);\n  const beastmasterBond: BeastmasterBond =\n    state.beastmasterBond === "chosen-friend" ? "chosen-friend" : "bind-companion";\n  const chosenFriend =\n    selectedClasses.includes("Beastmaster") && beastmasterBond === "chosen-friend";\n''',
    "legacy bond default",
)

text = replace_once(
    text,
    '''  if (\n    selectedClasses.includes("Beastmaster") &&\n    !beastmasterBondOptions.includes(state.beastmasterBond)\n  )\n''',
    '''  if (\n    selectedClasses.includes("Beastmaster") &&\n    state.beastmasterBond &&\n    !beastmasterBondOptions.includes(state.beastmasterBond)\n  )\n''',
    "legacy bond validation",
)

path.write_text(text)
print("patched character-creation.ts for legacy/default Beastmaster bond")
