import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionActor } from "@/lib/auth-session";
import { CampaignDashboard } from "./campaign-dashboard";
import "./campaign-ui.css";

export default async function MyCampaignsPage() {
  const actor = await getSessionActor({ headers: await headers() });
  if (!actor) redirect("/");
  return <CampaignDashboard />;
}
