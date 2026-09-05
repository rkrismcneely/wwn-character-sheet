import { readFile, writeFile } from "node:fs/promises";

const replaceOnce = (source, oldText, newText, label) => {
  if (source.includes(newText)) return source;
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Expected one ${label} target, found ${count}`);
  return source.replace(oldText, newText);
};

let css = await readFile("app/globals.css", "utf8");

css = replaceOnce(
  css,
  `.library-search,\n\n.library-search>label,\n.legacy-claim>label{\n  display:block;\n  margin-bottom:7px;\n  color:var(--muted);\n  font:700 10px/1 var(--font-ui);\n  letter-spacing:.09em;\n  text-transform:uppercase;\n}\n.library-search>div,\n.legacy-claim>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}\n.library-search input,\n\n.library-search button,\n\n\n\n`,
  `.library-search{\n  margin:16px 28px 0;\n  padding:12px 14px;\n  border:1px solid var(--line);\n  background:rgba(255,251,238,.58);\n}\n.library-search>label{\n  display:block;\n  margin-bottom:7px;\n  color:var(--muted);\n  font:700 10px/1 var(--font-ui);\n  letter-spacing:.09em;\n  text-transform:uppercase;\n}\n.library-search>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}\n.library-search input{width:100%}\n.library-search button,\n.library-signin button,\n.character-sharing button,\n.read-only-banner button{\n  border:1px solid #8e6b35;\n  background:linear-gradient(#fff8e8,#ead7b2);\n  color:#5d3d15;\n  padding:8px 13px;\n  cursor:pointer;\n  font:700 11px/1.2 var(--font-ui);\n}\n`,
  "library/shared controls CSS",
);

css = replaceOnce(
  css,
  `html[data-theme="dark"] .library-scopes button.active,\nhtml[data-theme="dark"] .library-search,\nhtml[data-theme="dark"] .legacy-claim,\nhtml[data-theme="dark"] .read-only-banner{\n  background:#242119;\n  color:#f0dbb2;\n}\nhtml[data-theme="dark"] .library-signin,\nhtml[data-theme="dark"] .character-sharing{background:rgba(207,155,68,.07)}\nhtml[data-theme="dark"] .character-campaign-links{background:rgba(207,155,68,.07)}\nhtml[data-theme="dark"] .campaign-character-context{background:#242119;color:#f0dbb2}\nhtml[data-theme="dark"] .campaign-character-context a{color:#e7bc74}\nhtml[data-theme="dark"] .library-search button,\nhtml[data-theme="dark"] \n`,
  `html[data-theme="dark"] .library-scopes button.active,\nhtml[data-theme="dark"] .library-search,\nhtml[data-theme="dark"] .read-only-banner{\n  background:#242119;\n  color:#f0dbb2;\n}\nhtml[data-theme="dark"] .library-signin,\nhtml[data-theme="dark"] .character-sharing{background:rgba(207,155,68,.07)}\nhtml[data-theme="dark"] .character-campaign-links{background:rgba(207,155,68,.07)}\nhtml[data-theme="dark"] .campaign-character-context{background:#242119;color:#f0dbb2}\nhtml[data-theme="dark"] .campaign-character-context a{color:#e7bc74}\nhtml[data-theme="dark"] .library-search button,\nhtml[data-theme="dark"] .library-signin button,\nhtml[data-theme="dark"] .character-sharing button,\nhtml[data-theme="dark"] .read-only-banner button{\n  background:#28241c;\n  border-color:#755f3b;\n  color:#ecd8af;\n}\n`,
  "dark shared controls CSS",
);

css = replaceOnce(
  css,
  `   .library-scopes,\n  .library-search,\n  .legacy-claim,\n  .library-signin{margin-left:16px;margin-right:16px}`,
  `   .library-scopes,\n  .library-search,\n  .library-signin{margin-left:16px;margin-right:16px}`,
  "mobile legacy selector cleanup",
);

if (css.includes("legacy-claim")) throw new Error("Legacy claim CSS remains after cleanup");
await writeFile("app/globals.css", css);

let sharingTest = await readFile("tests/character-sharing-ui.test.mjs", "utf8");
const assertionAnchor = `  assert.doesNotMatch(sheet, /character-sharing-footer/u);\n`;
const extraAssertions = `  assert.doesNotMatch(sheet, /character-sharing-footer/u);\n  assert.doesNotMatch(css, /legacy-claim/u);\n  assert.ok(css.includes('.library-search button,\\n.library-signin button,\\n.character-sharing button,\\n.read-only-banner button{'));\n`;
if (!sharingTest.includes(extraAssertions)) {
  if (!sharingTest.includes(assertionAnchor)) throw new Error("Sharing CSS assertion anchor not found");
  sharingTest = sharingTest.replace(assertionAnchor, extraAssertions);
}
await writeFile("tests/character-sharing-ui.test.mjs", sharingTest);

console.log("Action Bundle 5 CSS cleanup complete.");
