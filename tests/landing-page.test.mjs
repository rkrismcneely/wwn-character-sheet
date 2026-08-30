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
    "Sign in with Google",
    "Browse Public Characters",
    "Guided character creation",
    "A sheet that does the bookkeeping",
    "Rules Assistant",
    "GM Console",
    "Built-In Bestiary",
    "Saved online",
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
