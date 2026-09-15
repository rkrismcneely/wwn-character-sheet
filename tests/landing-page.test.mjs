import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("root selects the landing page only for signed-out visitors", async () => {
  const page = await source("app/page.tsx");
  assert.match(page, /getSessionActor/u);
  assert.match(page, /if \(!actor\) return <LandingPage \/>/u);
  assert.match(page, /<DashboardPage \/>/u);
  assert.match(page, /<CharacterSheet startNew \/>/u);
});

test("landing page exposes the signed-out product story, entry actions, and campaign tools", async () => {
  const landing = await source("app/landing-page.tsx");
  for (const copy of [
    "Your Adventures.",
    "Your Characters.",
    "Without End.",
    "Worlds Without Number",
    "Continue with Google",
    "Browse Public Characters",
    "Guided Creation",
    "FROM CREATION TO THE TABLE",
    "A WWN character sheet built for actual play",
    "Build a new WWN character step by step",
    "A sheet that does the bookkeeping",
    "Play without juggling extra tools",
    "Pick up where you left off",
    "GM Console",
    "Built-In Bestiary",
    "YOUR CHARACTER LIBRARY",
    "SRD Creatures",
    "Campaign NPCs",
    "Live Rolls",
  ]) assert.equal(landing.includes(copy), true, copy);
  assert.match(landing, /GoogleSignInButton/u);
  assert.match(landing, /href="\/public-characters"/u);
  assert.match(landing, /TalesBrandLink/u);
  assert.doesNotMatch(landing, /ownerUserId|owner_user_id|adminReadOnly|legacy-claim/u);
});

test("public browsing requests only the public character scope", async () => {
  const browser = await source("app/public-characters/public-character-browser.tsx");
  assert.match(browser, /scope: "public"/u);
  assert.match(browser, /character\.id/u);
  assert.doesNotMatch(browser, /scope: "mine"|scope: "all"|ownerUserId|owner_user_id/u);
});

test("direct character pages continue to use the existing character sheet", async () => {
  const characterPage = await source("app/character/[publicId]/page.tsx");
  assert.match(characterPage, /from "\.\.\/\.\.\/character-sheet"/u);
  assert.match(characterPage, /canReadRow\(actor, row\)/u);
  assert.match(characterPage, /<CharacterSheet initialCharacter=\{payload\} \/>/u);
});

test("all new Google calls use the shared Better Auth social sign-in", async () => {
  const landing = await source("app/landing-page.tsx");
  const publicPage = await source("app/public-characters/page.tsx");
  const button = await source("components/google-sign-in-button.tsx");
  assert.match(landing, /GoogleSignInButton/u);
  assert.match(publicPage, /GoogleSignInButton/u);
  assert.match(button, /authClient\.signIn\.social/u);
  assert.match(button, /provider: "google"/u);
  assert.match(button, /callbackURL: "\/"/u);
});

test("homepage provider controls use local official marks without changing auth presentation", async () => {
  const google = await source("components/google-sign-in-button.tsx");
  const discord = await source("components/discord-sign-in-button.tsx");
  const css = await source("app/landing-density.css");
  assert.match(google, /provider-google-button/u);
  assert.match(google, /<img[\s\S]*src="\/assets\/google-g-mark\.png"[\s\S]*width=\{18\}[\s\S]*height=\{18\}/u);
  assert.doesNotMatch(google, /from "next\/image"/u);
  assert.match(discord, /provider-discord-button/u);
  assert.match(discord, /\/assets\/discord-symbol\.svg/u);
  assert.match(css, /#747775/u);
  assert.match(css, /#5865f2/u);
  assert.match(google, /authClient\.signIn\.social/u);
  assert.match(discord, /authClient\.signIn\.social/u);
});
