import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { CharacterRecoveryClient } from "./recovery-client";
import "../campaigns/campaign-ui.css";

export const metadata: Metadata = {
  title: "Character Recovery | Tales Without End",
  description: "Recover character changes that were preserved locally after an interrupted online save.",
  robots: { index: false, follow: false },
};

export default async function CharacterRecoveryPage({
  searchParams,
}: {
  searchParams?: Promise<{ character?: string | string[] }>;
}) {
  const actor = await getSessionActor({ headers: await headers() });
  if (!actor) redirect("/");
  const params = await searchParams;
  const characterId = typeof params?.character === "string" ? params.character : "";
  return <CharacterRecoveryClient characterId={characterId} ownerUserId={actor.userId} />;
}
