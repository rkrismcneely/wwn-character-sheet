export type CharacterSaveDisposition = "safe" | "pending" | "failed";

export function characterSaveDisposition(state: string | null | undefined): CharacterSaveDisposition {
  const normalized = state?.trim() ?? "";
  if (!normalized) return "safe";
  if (
    normalized === "Unsaved changes" ||
    normalized === "Saving online…" ||
    normalized === "Applying level-up…"
  ) {
    return "pending";
  }
  if (
    normalized === "Not saved online" ||
    normalized === "Newer online copy found"
  ) {
    return "failed";
  }
  return "safe";
}
