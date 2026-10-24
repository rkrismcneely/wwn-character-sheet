import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { CampaignJournal } from "../../campaign-journal";
import "../../campaign-ui.css";
import "../../campaign-journal.css";

export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getSessionActor({ headers: await headers() });
  if (!actor) redirect("/");
  const { id } = await params;
  return <CampaignJournal campaignId={id} />;
}
