import { writeFile } from "node:fs/promises";

const sources = {
  Accursed: 2,
  Bard: 3,
  Beastmaster: 4,
  "Blood Priest": 5,
  Duelist: 6,
  Mageslayer: 13,
  Skinshifter: 15,
  "Thought Noble": 16,
  Wise: 19,
};

const metadata = {
  Accursed: { kind: "mage", skill: "Magic", attribute: "INT/CHA", armor: "Accursed arts may be used in or out of armor.", progression: [2,3,3,4,5,6,6,7,7,8] },
  Bard: { kind: "expert", skill: "Perform", attribute: "CHA", armor: "Bard arts may be used in or out of armor and are not magical effects.", progression: [2,3,3,4,4,5,5,6,6,7] },
  Beastmaster: { kind: "mage", skill: "Survive", attribute: "WIS/CHA", armor: "Beastmaster arts may be used in or out of armor.", progression: [2,3,3,4,5,6,6,7,7,8] },
  "Blood Priest": { kind: "mage", skill: "Pray", attribute: "WIS/CHA", armor: "Blood Priest miracles are not hindered by armor and require no free hand.", progression: [2,3,3,4,5,6,6,7,7,8] },
  Duelist: { kind: "mage", skill: "Stab", attribute: "DEX/INT", armor: "Duelist arts do not function in medium or heavy armor or with a large shield.", progression: [2,3,3,4,5,6,6,7,7,8] },
  Mageslayer: { kind: "warrior", skill: "Magic", attribute: "INT/CON", armor: "Mageslayer arts may be used in or out of armor.", progression: [2,3,3,4,5,6,6,7,7,8] },
  Skinshifter: { kind: "mage", skill: "Survive", attribute: "CON/CHA", armor: "Skinshifter arts may be used in or out of armor.", progression: [2,3,3,4,5,6,6,7,7,8] },
  "Thought Noble": { kind: "mage", skill: "Notice", attribute: "INT/WIS", armor: "Thought Noble arts are invisible mental effects and may be used in armor.", progression: [2,3,3,4,5,6,6,7,7,8] },
  Wise: { kind: "expert", skill: "", attribute: "", armor: "Wise arts do not use Effort and may be used in armor.", progression: [2,3,3,4,4,5,5,6,6,7] },
};

const forcedArts = {
  Accursed: ["Accursed Blade", "Accursed Bolt"],
  Bard: ["A Thousand Tongues"],
  Beastmaster: ["Bind Companion"],
  Duelist: ["Favored Weapon"],
  Skinshifter: ["Change Form"],
  "Thought Noble": ["Open Mind"],
};

const decode = text => text
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/g, " ")
  .replace(/&rsquo;|&#39;/g, "’")
  .replace(/&ldquo;|&rdquo;/g, "\"")
  .replace(/&amp;/g, "&")
  .replace(/&mdash;/g, "—")
  .replace(/&ndash;/g, "–")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/\s+/g, " ")
  .trim();

const result = {};
for (const [name, number] of Object.entries(sources)) {
  const url = `https://wwn.quadrifons.com/1.0%20Character%20Creation/1.5.0%20Class%20List/1.5.${number}%20The%20${name.replaceAll(" ", "%20")}.html`;
  const html = await (await fetch(url)).text();
  const arts = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map(match => decode(match[1]))
    .filter(text => /^[^:]{2,80}:\s+/.test(text))
    .map(text => {
      const colon = text.indexOf(":");
      return { name: text.slice(0, colon).trim(), text: text.slice(colon + 1).trim() };
    })
    .filter(art => !["CWN SRD ↗"].includes(art.name));
  result[name] = { ...metadata[name], forcedArts: forcedArts[name] || [], arts };
}

const output = `// Generated from the CC0 Worlds Without Number SRD 1.0 class pages.\n` +
  `// Run npm run import:srd-classes to refresh from the declared source.\n` +
  `export const additionalClassData = ${JSON.stringify(result, null, 2)} as const;\n`;
await writeFile(new URL("../app/additional-class-data.ts", import.meta.url), output);
