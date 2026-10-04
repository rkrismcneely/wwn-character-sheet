import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  E2E_AUTH_SECRET,
  E2E_CAMPAIGN_ID,
  E2E_CHARACTER_IDS,
  E2E_ORIGIN,
  E2E_SESSION_TOKENS,
} from "./fixtures.mjs";

function signedSessionCookie(token) {
  const signature = createHmac("sha256", E2E_AUTH_SECRET)
    .update(token)
    .digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

async function authenticatedContext(browser, token) {
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: signedSessionCookie(token),
      url: E2E_ORIGIN,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return context;
}

function currentHpInput(page) {
  return page.locator("label.stepper-field").filter({ hasText: "HP current" }).locator("input");
}

test.describe.configure({ mode: "serial" });

test("signed-out front door exposes the expected authentication boundary", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /Your Adventures.*Your Characters.*Without End/s })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse Public Characters" }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Signed-in navigation" })).toHaveCount(0);
});

test("character autosave finishes before same-site navigation unmounts the sheet", async ({ browser }) => {
  const context = await authenticatedContext(browser, E2E_SESSION_TOKENS.userA);
  const page = await context.newPage();

  await page.goto(`/character/${E2E_CHARACTER_IDS.userA}`);
  const hp = currentHpInput(page);
  await expect(hp).toHaveValue("5");
  await expect(hp).toBeEditable();

  await hp.fill("4");
  await expect(page.locator(".save-state")).toContainText("Unsaved changes", { timeout: 500 });

  await page.getByRole("link", { name: "My Campaigns" }).click();
  await expect(page).toHaveURL(/\/campaigns$/u);

  await page.goto(`/character/${E2E_CHARACTER_IDS.userA}`);
  await expect(currentHpInput(page)).toHaveValue("4");

  await context.close();
});

test("failed online save preserves and safely restores the local recovery draft", async ({ browser }) => {
  const context = await authenticatedContext(browser, E2E_SESSION_TOKENS.userA);
  const page = await context.newPage();
  const characterId = E2E_CHARACTER_IDS.userA;
  const recoveryKey = `twe:character-recovery:${characterId}`;

  await page.route(`**/api/characters/${characterId}`, async route => {
    if (route.request().method() === "PUT") {
      await route.abort("internetdisconnected");
      return;
    }
    await route.continue();
  });

  await page.goto(`/character/${characterId}`);
  const hp = currentHpInput(page);
  await expect(hp).toHaveValue("4");
  await expect(hp).toBeEditable();

  await hp.fill("3");
  await expect(page.locator(".save-state")).toContainText("Not saved online", { timeout: 5_000 });
  const recoveryLink = page.getByRole("link", { name: "Open recovery copy" });
  await expect(recoveryLink).toBeVisible();

  await expect.poll(async () => page.evaluate(key => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.character?.hpCurrent ?? null;
    } catch {
      return null;
    }
  }, recoveryKey)).toBe(3);

  const href = await recoveryLink.getAttribute("href");
  expect(href).toBeTruthy();
  const recoveryPage = await context.newPage();
  await recoveryPage.goto(href);
  await expect(recoveryPage.getByRole("heading", { name: "Recover Character Changes" })).toBeVisible();
  await expect(recoveryPage.getByRole("heading", { name: "User A Sentinel" })).toBeVisible();

  const restore = recoveryPage.getByRole("button", { name: "Restore to Original" });
  await expect(restore).toBeEnabled();
  await restore.click();
  await expect(recoveryPage).toHaveURL(new RegExp(`/character/${characterId}$`, "u"));
  await expect(currentHpInput(recoveryPage)).toHaveValue("3");
  await expect.poll(async () => recoveryPage.evaluate(key => window.localStorage.getItem(key), recoveryKey)).toBeNull();

  await context.close();
});

test("campaign owner can invite and a second account can redeem the invitation", async ({ browser }) => {
  const ownerContext = await authenticatedContext(browser, E2E_SESSION_TOKENS.userA);
  const ownerPage = await ownerContext.newPage();

  await ownerPage.goto(`/campaigns/${E2E_CAMPAIGN_ID}`);
  await expect(ownerPage.getByRole("heading", { name: "E2E Test Campaign" })).toBeVisible();
  await ownerPage.getByRole("button", { name: "Invite Player" }).click();

  const invitation = ownerPage.getByRole("dialog", { name: "Campaign Invitation" });
  await expect(invitation).toBeVisible();
  const token = await invitation.getByLabel("Single-use invite code").inputValue();
  expect(token).toMatch(/^cminv_[A-Za-z0-9_-]{43}$/u);

  const playerContext = await authenticatedContext(browser, E2E_SESSION_TOKENS.userB);
  const playerPage = await playerContext.newPage();
  await playerPage.goto(`/campaigns/join#${token}`);

  await expect(playerPage.getByRole("heading", { name: "Choose Your Character" })).toBeVisible();
  await playerPage.getByRole("radio", { name: /User B Scholar/u }).check();
  await playerPage.getByRole("button", { name: "Join E2E Test Campaign as User B Scholar" }).click();

  await expect(playerPage).toHaveURL(new RegExp(`/campaigns/${E2E_CAMPAIGN_ID}$`, "u"));
  await expect(playerPage.getByRole("heading", { name: "E2E Test Campaign" })).toBeVisible();
  await expect(playerPage.getByText("User B", { exact: true })).toBeVisible();

  await playerContext.close();
  await ownerContext.close();
});

test("linked character opens the active campaign map drawer", async ({ browser }) => {
  const context = await authenticatedContext(browser, E2E_SESSION_TOKENS.userA);
  const page = await context.newPage();

  await page.goto(`/character/${E2E_CHARACTER_IDS.userA}`);
  const openMap = page.getByRole("button", { name: /Open.*map/iu }).first();
  await expect(openMap).toBeVisible();

  const mapRequest = page.waitForResponse(response =>
    response.request().method() === "GET"
      && response.url().includes(`/api/campaigns/${E2E_CAMPAIGN_ID}/map`),
  );
  await openMap.click();
  const response = await mapRequest;
  expect(response.status()).toBe(200);
  await expect(page.getByRole("button", { name: /Close.*map/iu }).first()).toBeVisible();

  await context.close();
});
