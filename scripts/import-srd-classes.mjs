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
  Mageslayer: { kind: "warrior", skill: "Magic", attribute: "INT/CON", armor: "Mageslayer arts may be used in or out of armor.", progression: [2,4,5,6,7,8,9,10,11,12] },
  Skinshifter: { kind: "mage", skill: "Survive", attribute: "CON/CHA", armor: "Skinshifter arts may be used in or out of armor.", progression: [2,3,3,4,5,6,6,7,7,8] },
  "Thought Noble": { kind: "mage", skill: "Notice", attribute: "INT/WIS", armor: "Thought Noble arts may be used in armor. They are invisible to non-magical senses and do not reveal their user; a target that succeeds on a save against a Thought Noble art is immune to that art for the rest of the scene.", progression: [2,3,4,5,6,7,8,9,10,11] },
  // The generic Wise implementation follows the SRD's Esoteric example path.
  Wise: { kind: "expert", skill: "", attribute: "", armor: "Wise arts do not use Effort and may be used in armor.", progression: [1,1,2,2,3,3,4,4,5,5] },
};

const forcedArts = {
  Bard: ["A Thousand Tongues"],
  Beastmaster: ["Bind Companion"],
  Duelist: ["Favored Weapon"],
  Mageslayer: ["Antimage", "Magebane"],
  Skinshifter: ["Change Form"],
  "Thought Noble": ["Open Mind"],
};

const mageslayerArtLevels = {
  Antimage: 1,
  Magebane: 1,
  Witchfinder: 2,
  Spellshield: 2,
  "Disrupt Sorcery": 3,
  "Know Your Prey": 4,
  "Share the Pain": 5,
  "Dispel Enchantment": 6,
  "Ward Ally": 7,
  "Immaculate Body": 8,
  "Immaculate Mind": 9,
  "Absolute Negation": 10,
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

const normalizeImportedArtText = (className, artName, text) => {
  if (className !== "Thought Noble") return text;
  if (artName === "Block Memory") return text
    .replace(
      "Target a Visible Living Creature And Commit Effort For The Day As a Main Action While Specifying a Particular Event Or Situation That Didn’t Extend Longer Than a Scene. The Target Gets a Mental Saving Throw; On a Failure, They Simply Cannot Remember The Event And Will Construct a Plausible False Memory To Paper Over The Gap. The Memory Can Be Restored By Use Of This Power Once More Or a Magical Dispelling Ability, But Detecting The Alteration Is Difficult;",
      "Target a visible living creature and Commit Effort for the day as a Main Action while specifying a particular event or situation that didn’t extend longer than a scene. The target gets a Mental saving throw; on a failure, they simply cannot remember the event and will construct a plausible false memory to paper over the gap. The memory can be restored by use of this power once more or a magical dispelling ability, but detecting the alteration is difficult;",
    );
  return text
    .replace("tar get", "target")
    .replace("over whelming", "overwhelming")
    .replace("process es", "processes");
};

const result = {};
for (const [name, number] of Object.entries(sources)) {
  const url = `https://wwn.quadrifons.com/1.0%20Character%20Creation/1.5.0%20Class%20List/1.5.${number}%20The%20${name.replaceAll(" ", "%20")}.html`;
  const html = await (await fetch(url)).text();
  const arts = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map(match => decode(match[1]))
    .filter(text => /^[^:]{2,80}:\s+/.test(text))
    .map(text => {
      const colon = text.indexOf(":");
      const artName = text.slice(0, colon).trim();
      const art = {
        name: artName,
        text: normalizeImportedArtText(
          name,
          artName,
          text.slice(colon + 1).trim(),
        ),
      };
      return name === "Mageslayer"
        ? { ...art, minLevel: mageslayerArtLevels[art.name] || 1 }
        : art;
    })
    .filter(art => !["CWN SRD ↗"].includes(art.name));
  result[name] = { ...metadata[name], forcedArts: forcedArts[name] || [], arts };
}

const output = `// Generated from the CC0 Worlds Without Number SRD 1.0 class pages.\n` +
  `// Run npm run import:srd-classes to refresh from the declared source.\n` +
  `export const additionalClassData = ${JSON.stringify(result, null, 2)} as const;\n`;
await writeFile(new URL("../app/additional-class-data.ts", import.meta.url), output);