import { readFile, writeFile } from "node:fs/promises";

async function edit(path, transform) {
  const source = await readFile(path, "utf8");
  const next = transform(source);
  if (next === source) throw new Error(`${path}: polish transform made no changes`);
  await writeFile(path, next);
}

await edit("app/character-sheet.tsx", source => {
  const before = ">{stowedItem}</option>";
  const matches = source.split(before).length - 1;
  if (matches < 2) throw new Error(`Expected at least two stowed item option labels, found ${matches}`);
  return source.replaceAll(before, ">{inventoryItemDisplayName(stowedItem)}</option>");
});

await edit("lib/campaigns/items.ts", source => {
  let next = source;
  const oldText = `function text(value: unknown, label: string, maximum: number, required = true): string {\n  if ((value === undefined || value === null || value === "") && !required) return "";\n  if (typeof value !== "string") throw new CampaignServiceError(\`${'${label}'} is required.\`, 422);\n  const result = value.trim();\n  if ((!result && required) || result.length > maximum || /[\\u0000-\\u001f\\u007f]/u.test(result)) {\n    throw new CampaignServiceError(\`${'${label}'} is invalid.\`, 422);\n  }\n  return result;\n}`;
  const newText = `function text(\n  value: unknown,\n  label: string,\n  maximum: number,\n  required = true,\n  allowLineBreaks = false,\n): string {\n  if ((value === undefined || value === null || value === "") && !required) return "";\n  if (typeof value !== "string") throw new CampaignServiceError(\`${'${label}'} is required.\`, 422);\n  const result = value.trim();\n  const invalidControl = allowLineBreaks\n    ? /[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]/u\n    : /[\\u0000-\\u001f\\u007f]/u;\n  if ((!result && required) || result.length > maximum || invalidControl.test(result)) {\n    throw new CampaignServiceError(\`${'${label}'} is invalid.\`, 422);\n  }\n  return result;\n}`;
  if (!next.includes(oldText)) throw new Error("Campaign item text validator anchor changed");
  next = next.replace(oldText, newText);
  const oldDescription = `description: text(draft.description, "Item description", 2000, false),`;
  if (!next.includes(oldDescription)) throw new Error("Campaign description normalization anchor changed");
  next = next.replace(oldDescription, `description: text(draft.description, "Item description", 2000, false, true),`);
  const oldTargetJoin = `INNER JOIN characters ch ON ch.id = cic.character_id\n     WHERE ci.campaign_id = ? AND ch.public_id IS NOT NULL`;
  if (!next.includes(oldTargetJoin)) throw new Error("Campaign item target query anchor changed");
  next = next.replace(
    oldTargetJoin,
    `INNER JOIN characters ch ON ch.id = cic.character_id\n     INNER JOIN campaign_characters cc\n       ON cc.campaign_id = ci.campaign_id AND cc.character_id = ch.id\n     WHERE ci.campaign_id = ? AND ch.public_id IS NOT NULL`,
  );
  return next;
});
