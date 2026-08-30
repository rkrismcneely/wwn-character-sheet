/** UI-only route state: character choices always remain in the normal sheet. */
export const guidedCreationModeFromUrl = (href: string) =>
  new URL(href, "https://taleswithoutend.invalid").searchParams.get("guided") === "1";

export const levelUpModeFromUrl = (href: string) =>
  new URL(href, "https://taleswithoutend.invalid").searchParams.get("levelup") === "1";

export const withGuidedCreationMode = (href: string, enabled: boolean) => {
  const url = new URL(href, "https://taleswithoutend.invalid");
  if (enabled) url.searchParams.set("guided", "1");
  else url.searchParams.delete("guided");
  return `${url.pathname}${url.search}${url.hash}`;
};

export const withLevelUpMode = (href: string, enabled: boolean) => {
  const url = new URL(href, "https://taleswithoutend.invalid");
  if (enabled) url.searchParams.set("levelup", "1");
  else url.searchParams.delete("levelup");
  return `${url.pathname}${url.search}${url.hash}`;
};
