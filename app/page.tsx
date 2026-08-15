import { headers } from "next/headers";
import CharacterSheet from "./character-sheet";
import { DashboardPage } from "./dashboard-page";
import { LandingPage } from "./landing-page";
import { getSessionActor } from "@/lib/auth-session";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ new?: string | string[] }>;
}) {
  const requestHeaders = await headers();
  const actor = await getSessionActor({ headers: requestHeaders });
  const params = await searchParams;
  const startNew = params?.new === "1";

  if (!actor) return <LandingPage />;
  return startNew ? <CharacterSheet startNew /> : <DashboardPage />;
}
