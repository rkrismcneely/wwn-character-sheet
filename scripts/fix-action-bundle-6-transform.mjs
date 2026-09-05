import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/action-bundle-6-transform.mjs";
let source = await readFile(path, "utf8");
for (const token of [
  "${table.kind}",
  "${table.visibilityMode}",
  "${{ github.event_name }}",
  "${GITHUB_SHA}",
  "${GITHUB_OUTPUT}",
]) {
  source = source.replaceAll(token, `\\${token}`);
}
await writeFile(path, source);
