import { headers } from "next/headers";
import CharacterSheet from "./character-sheet";
import { LandingPage } from "./landing-page";
import { getSessionActor } from "@/lib/auth-session";

export default async function Home() {
  const requestHeaders = await headers();
  const actor = await getSessionActor({ headers: requestHeaders });

  return actor ? <CharacterSheet /> : <LandingPage />;
}
