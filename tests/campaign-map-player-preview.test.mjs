import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("GM-only view switch previews the active player map and restores the GM selection", async () => {
  const source = await read("../app/campaigns/campaign-map-launcher.tsx");
  assert.match(source, /const \[playerPreview, setPlayerPreview\] = useState\(false\)/u);
  assert.match(source, /const gmMapBeforePreviewRef = useRef<string \| null>\(null\)/u);
  assert.match(source, /async function togglePlayerPreview\(\)/u);
  assert.match(source, /const active = maps\.find\(candidate => candidate\.isActive\)/u);
  assert.match(source, /if \(active && active\.id !== map\?\.id && !\(await loadMap\(false, active\.id\)\)\) return;/u);
  assert.match(source, /gmMapBeforePreviewRef\.current = previous;/u);
  assert.match(source, /if \(previous && previous !== map\?\.id\) await loadMap\(false, previous\);/u);
  assert.match(source, /playerPreviewRef\.current \? null : canManageRef\.current/u);
  assert.match(source, /const previewHasNoSharedMap = playerPreview && !map\?\.isActive/u);
  assert.match(source, /No map shared with players/u);
  assert.match(source, /aria-label=\{playerPreview \? "Return to GM View" : "Preview Player View"\}/u);
  assert.match(source, /aria-pressed=\{playerPreview\}/u);
  assert.match(source, /disabled=\{busy \|\| loading\} onClick=\{\(\) => void togglePlayerPreview\(\)\}/u);
  assert.match(source, /\{playerPreview \? "GM View" : "Player View"\}/u);
  assert.doesNotMatch(source.slice(source.indexOf("async function togglePlayerPreview"), source.indexOf("async function selectMap")), /action: "activate"/u);
});

test("player preview renders visible drawings underneath fog and hides GM-only annotations", async () => {
  const [launcher, annotations] = await Promise.all([
    read("../app/campaigns/campaign-map-launcher.tsx"),
    read("../app/campaigns/campaign-map-annotations.tsx"),
  ]);
  const playerLayer = launcher.indexOf('{(!canManage || playerPreview) && <CampaignMapAnnotationLayer');
  const fogLayer = launcher.indexOf('<CampaignMapFogLayer');
  const gmLayer = launcher.indexOf('{canManage && !playerPreview && <CampaignMapAnnotationLayer');
  assert.ok(playerLayer > 0 && playerLayer < fogLayer && fogLayer < gmLayer);
  assert.match(annotations, /filter\(annotation => !playerPreview \|\| annotation\.visibility === "players"\)/u);
  assert.match(annotations, /const selecting = !playerPreview && interactionEnabled/u);
  assert.match(annotations, /const erasing = !playerPreview && controller\.tool === "erase"/u);
  assert.match(annotations, /!playerPreview && controller\.draft/u);
  assert.match(annotations, /!playerPreview && controller\.selectedId === annotation\.id/u);
});

test("player preview is read-only for tokens, spell areas, tools, editing and keyboard actions", async () => {
  const [launcher, areas, css] = await Promise.all([
    read("../app/campaigns/campaign-map-launcher.tsx"),
    read("../app/campaigns/campaign-map-area-templates.tsx"),
    read("../app/campaigns/campaign-map.css"),
  ]);
  assert.match(launcher, /\{!playerPreview && <>[\s\S]*?\+ Add/u);
  assert.match(launcher, /\{!playerPreview && map\?\.backgroundUrl && <CampaignMapDrawingPalette/u);
  assert.match(launcher, /\{!playerPreview && map\?\.backgroundUrl && <CampaignMapAreaTemplatePalette/u);
  assert.match(launcher, /previewOnly=\{playerPreview\} interactionEnabled=\{!playerPreview/u);
  assert.match(areas, /const selecting = !previewOnly && interactionEnabled/u);
  assert.match(areas, /selected=\{!previewOnly && controller\.selectedId === template\.id\}/u);
  assert.match(launcher, /onPointerDown=\{playerPreview \? undefined : event => handleTokenPointerDown/u);
  assert.match(launcher, /onPointerMove=\{playerPreview \? undefined : handleTokenPointerMove\}/u);
  assert.match(launcher, /\{!playerPreview && map && !annotations\.tool/u);
  assert.match(launcher, /\{settingsOpen && canManage && !playerPreview && <aside/u);
  assert.match(launcher, /if \(!open \|\| playerPreview\) return;\s*const keyWindow/u);
  assert.match(css, /\.campaign-map-preview-label \{/u);
});
