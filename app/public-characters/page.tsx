import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { PublicCharacterBrowser } from "./public-character-browser";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { getSessionActor } from "@/lib/auth-session";
import { SignedInHeader, TalesBrandLink } from "../app-header";

/* eslint-disable @next/next/no-img-element -- small existing brand SVGs are served directly */

export const metadata: Metadata = {
  title: "Public Characters | Tales Without End",
  description: "Browse public Worlds Without Number character folios.",
  alternates: { canonical: "/public-characters" },
};

export default async function PublicCharactersPage() {
  const actor = await getSessionActor({ headers: await headers() });
  return (
    <main className="public-library-page">
      {actor ? (
        <SignedInHeader active="public" />
      ) : (
        <header>
          <TalesBrandLink href="/" className="landing-brand" />
          <GoogleSignInButton className="landing-button landing-button-small" />
        </header>
      )}
      <section className="public-library-intro">
        <p className="landing-kicker">THE PUBLIC ARCHIVE</p>
        <h1>Public Characters</h1>
        <p>Discover adventurers their owners have chosen to share. Public folios are always read-only to visitors.</p>
      </section>
      <PublicCharacterBrowser />
      <footer className="landing-footer">
        <Link href="/">Return to Tales Without End</Link>
        <p>Unofficial fan-made character tool. Not affiliated with or endorsed by Sine Nomine Publishing.</p>
      </footer>
    </main>
  );
}
