import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  E2E_AUTH_SECRET,
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

async function authenticatedContext(browser, token, options = {}) {
  const context = await browser.newContext(options);
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

test("signed-out front door shows the landing actions", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /Your Adventures.*Your Characters.*Without End/s }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse Public Characters" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "My Characters" })).toHaveCount(0);
});

test("signed-out public archive opens a public read-only character", async ({ page }) => {
  await page.goto("/public-characters");

  const publicCard = page.getByRole("article").filter({ hasText: "Public Wayfarer" });
  await expect(publicCard).toBeVisible();
  await expect(page.getByText("User B Scholar")).toHaveCount(0);
  await publicCard.getByRole("link", { name: /View read-only folio/ }).click();

  await expect(page).toHaveURL(
    new RegExp(`/character/${E2E_CHARACTER_IDS.public}$`),
  );
  await expect(page.getByRole("status")).toContainText("Read-only character");
  await expect(page.getByLabel("Character name")).toHaveValue("Public Wayfarer");
});

test("private characters stay hidden from signed-out and cross-user visitors", async ({ browser, page }) => {
  const signedOut = await page.goto(
    `/character/${E2E_CHARACTER_IDS.userBPrivate}`,
  );
  expect(signedOut?.status()).toBe(404);

  const userAContext = await authenticatedContext(browser, E2E_SESSION_TOKENS.userA);
  const userAPage = await userAContext.newPage();
  const crossUser = await userAPage.goto(
    `/character/${E2E_CHARACTER_IDS.userBPrivate}`,
  );
  expect(crossUser?.status()).toBe(404);
  await userAContext.close();
});

test("User A sees the dashboard and can open an editable owned character", async ({ browser }) => {
  const context = await authenticatedContext(browser, E2E_SESSION_TOKENS.userA);
  const page = await context.newPage();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "My Characters" })).toBeVisible();
  await expect(page.getByText("User A Sentinel")).toBeVisible();
  await expect(page.getByText("User B Scholar")).toHaveCount(0);

  await page.getByRole("link", { name: /Open character/ }).click();
  await expect(page.getByLabel("Character name")).toHaveValue("User A Sentinel");
  await expect(page.getByLabel("Character name")).toBeEditable();
  await expect(page.getByLabel("Visibility")).toBeVisible();

  await context.close();
});

test("cross-user mutation attempts are rejected and leave the original untouched", async ({ browser }) => {
  const context = await authenticatedContext(browser, E2E_SESSION_TOKENS.userA);
  const page = await context.newPage();
  await page.goto("/");

  const update = await page.request.put(
    `/api/characters/${E2E_CHARACTER_IDS.userBPrivate}`,
    {
      data: {
        character: { name: "Unauthorized change" },
        version: 1,
      },
    },
  );
  expect(update.status()).toBe(404);

  const deletion = await page.request.delete(
    `/api/characters/${E2E_CHARACTER_IDS.userBPrivate}`,
  );
  expect(deletion.status()).toBe(404);

  const stillHidden = await page.request.get(
    `/api/characters/${E2E_CHARACTER_IDS.userBPrivate}`,
  );
  expect(stillHidden.status()).toBe(404);

  await context.close();
});

test("administrator can browse all characters but other owners remain read-only", async ({ browser }) => {
  const context = await authenticatedContext(browser, E2E_SESSION_TOKENS.admin);
  const page = await context.newPage();

  await page.goto(`/character/${E2E_CHARACTER_IDS.userBPrivate}`);
  await expect(page.getByRole("status")).toContainText(
    "Viewing as administrator · Read only",
  );
  await expect(page.getByLabel("Character name")).toHaveValue("User B Scholar");
  await expect(page.getByLabel("Character name")).toBeDisabled();

  const deniedUpdate = await page.request.put(
    `/api/characters/${E2E_CHARACTER_IDS.userBPrivate}`,
    {
      data: {
        character: { name: "Administrator overwrite" },
        version: 1,
      },
    },
  );
  expect(deniedUpdate.status()).toBe(404);

  const deniedDelete = await page.request.delete(
    `/api/characters/${E2E_CHARACTER_IDS.userBPrivate}`,
  );
  expect([403, 404]).toContain(deniedDelete.status());

  await page.goto(`/character/${E2E_CHARACTER_IDS.adminPrivate}`);
  await expect(page.getByLabel("Character name")).toHaveValue("Admin Archivist");
  await expect(page.getByLabel("Character name")).toBeEditable();

  await page.getByRole("button", { name: "My Characters" }).click();
  const library = page.getByRole("dialog", { name: "Character Library" });
  await expect(library.getByRole("tab", { name: "All Characters" })).toBeVisible();
  await library.getByRole("tab", { name: "All Characters" }).click();
  await expect(library.getByText("User B Scholar")).toBeVisible();

  await context.close();
});

test("narrow landing page keeps primary navigation accessible without horizontal overflow", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse Public Characters" }).first()).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await context.close();
});
