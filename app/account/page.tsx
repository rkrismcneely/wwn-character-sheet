import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { getAccountD1, readAccountProfile } from "@/lib/account/profile";
import { AccountPageClient } from "./account-page";
import "./account.css";

export const metadata: Metadata = {
  title: "Account | Tales Without End",
  description: "Manage your Tales Without End profile and signed-in destinations.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/account" },
};

export default async function AccountPage() {
  const actor = await getSessionActor({ headers: await headers() });
  if (!actor) redirect("/");
  const profile = await readAccountProfile(await getAccountD1(), actor);
  return <AccountPageClient initialProfile={profile} />;
}
