import { redirect } from "next/navigation";

export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/campaigns/${encodeURIComponent(id)}?tab=journal`);
}
