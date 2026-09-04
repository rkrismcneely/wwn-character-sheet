from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


path = Path("app/character-creation-wizard.tsx")
text = path.read_text()

text = replace_once(
    text,
    '''          {status.artAllowance > 0 && (\n            <section className="creation-magic-section">\n''',
    '''          {status.selectedClasses.includes("Beastmaster") && (\n            <section className="creation-magic-section creation-beastmaster-bond">\n              <h3>Companion bond</h3>\n              <label>\n                <span>Beastmaster companion</span>\n                <select\n                  value={sheet.beastmasterBond}\n                  onChange={(event) =>\n                    change({\n                      beastmasterBond: event.target.value as\n                        | "bind-companion"\n                        | "chosen-friend",\n                    })\n                  }\n                >\n                  <option value="bind-companion">\n                    Bind Companion · flexible bond\n                  </option>\n                  <option value="chosen-friend">\n                    Chosen Friend · lifelong bond\n                  </option>\n                </select>\n                <small>\n                  Both options use the required Bind Companion Art. Chosen\n                  Friend does not spend your additional Art pick; instead, that\n                  one permanent companion automatically gains the benefits of\n                  Shared Vitality and Mind Call.\n                </small>\n              </label>\n              {sheet.beastmasterBond === "chosen-friend" && (\n                <p className="creation-choice-note">\n                  A Chosen Friend is your only possible bound companion. If it\n                  reaches 0 HP it disappears and returns beside you at the next\n                  dawn with full hit points.\n                </p>\n              )}\n            </section>\n          )}\n          {status.artAllowance > 0 && (\n            <section className="creation-magic-section">\n''',
    "wizard bond control",
)

text = replace_once(
    text,
    '''            {sheet.artPicks.filter(Boolean).length > 0 && (\n              <p>Arts: {sheet.artPicks.filter(Boolean).join(" · ")}</p>\n            )}\n''',
    '''            {status.selectedClasses.includes("Beastmaster") && (\n              <p>\n                Companion bond:{" "}\n                {sheet.beastmasterBond === "chosen-friend"\n                  ? "Chosen Friend"\n                  : "Bind Companion"}\n              </p>\n            )}\n            {sheet.artPicks.filter(Boolean).length > 0 && (\n              <p>Arts: {sheet.artPicks.filter(Boolean).join(" · ")}</p>\n            )}\n''',
    "wizard review bond",
)

path.write_text(text)
print("patched character-creation-wizard.tsx")
