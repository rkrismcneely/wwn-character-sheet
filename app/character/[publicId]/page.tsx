import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import CharacterSheet, { type InitialCharacterPayload } from "../../page";
import { getSessionActor } from "@/lib/auth-session";
import { isPlausiblePublicCharacterId } from "@/lib/characters/identifiers";
import {
  canReadRow,
  characterApiPayload,
  characterSummary,
  findCharacterByPublicId,
  getD1,
} from "@/app/api/characters/db";
import { CANONICAL_ORIGIN } from "@/lib/auth-constants";

type RouteContext = { params: Promise<{ publicId: string }> };

async function loadCharacter(publicId: string): Promise<InitialCharacterPayload | null> {
  if (!isPlausiblePublicCharacterId(publicId)) return null;
  const requestHeaders = await headers();
  const actor = await getSessionActor({ headers: requestHeaders });
  const row = await findCharacterByPublicId(await getD1(), publicId);
  if (!row || !canReadRow(actor, row)) return null;
  return characterApiPayload(row, actor) as InitialCharacterPayload;
}

export async function generateMetadata(
  context: RouteContext,
): Promise<Metadata> {
  const { publicId } = await context.params;
  const payload = await loadCharacter(publicId);
  if (!payload) {
    return {
      title: "Character not found | Tales Without End",
      robots: { index: false, follow: false },
    };
  }

  const summary = characterSummary(payload.character);
  const canonical = `${CANONICAL_ORIGIN}/character/${publicId}`;
  const indexable = payload.visibility === "public";
  return {
    title: `${summary.name} | Tales Without End`,
    description: `${summary.classLabel}, level ${summary.level}. A Worlds Without Number character sheet.`,
    alternates: { canonical },
    robots: { index: indexable, follow: indexable },
    openGraph: {
      title: `${summary.name} | Tales Without End`,
      description: `${summary.classLabel}, level ${summary.level}.`,
      type: "website",
      url: canonical,
    },
  };
}

export default async function CharacterPage(context: RouteContext) {
  const { publicId } = await context.params;
  const payload = await loadCharacter(publicId);
  if (!payload) notFound();
  return <CharacterSheet initialCharacter={payload} />;
}
