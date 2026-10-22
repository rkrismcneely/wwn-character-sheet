"use client";

import { useEffect, useRef, useState } from "react";
import type { CampaignSessionRecap, SessionRecapSummary } from "@/lib/campaigns/session-recaps";
import { SessionRecapMarkdown } from "./session-recap-markdown";
import { formatRecapDate } from "./session-recap-date";

export function SessionRecapPanel({ campaignId }: { campaignId: string }) {
  const [dates, setDates] = useState<SessionRecapSummary[]>([]);
  const [selected, setSelected] = useState<CampaignSessionRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestNumber = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}/session-recaps?view=player`, { cache: "no-store" });
        const result = await response.json() as { dates?: SessionRecapSummary[]; latest?: CampaignSessionRecap | null; error?: string };
        if (!response.ok || !Array.isArray(result.dates)) throw new Error(result.error || "Session recaps could not be loaded.");
        if (!cancelled) { setDates(result.dates); setSelected(result.latest ?? null); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Session recaps could not be loaded.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    const onRecapsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ campaignId?: string }>).detail;
      if (detail?.campaignId === campaignId) void load();
    };
    window.addEventListener("twe:session-recaps-changed", onRecapsChanged);
    return () => { cancelled = true; requestNumber.current++; window.removeEventListener("twe:session-recaps-changed", onRecapsChanged); };
  }, [campaignId]);

  async function selectRecap(id: string) {
    const sequence = ++requestNumber.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/session-recaps?recapId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const result = await response.json() as { recap?: CampaignSessionRecap; error?: string };
      if (!response.ok || !result.recap) throw new Error(result.error || "This recap could not be loaded.");
      if (sequence === requestNumber.current) setSelected(result.recap);
    } catch (err) {
      if (sequence === requestNumber.current) setError(err instanceof Error ? err.message : "This recap could not be loaded.");
    } finally { if (sequence === requestNumber.current) setLoading(false); }
  }
  return <section className="campaign-panel campaign-session-recaps-panel" aria-labelledby="campaign-session-recaps-title">
    <div className="campaign-section-heading">
      <div><p className="campaign-kicker">ADVENTURE JOURNAL</p><h2 id="campaign-session-recaps-title">Session Recap</h2></div>
      {dates.length > 0 && <label className="session-recap-date-picker"><span className="sr-only">Choose a session recap</span><select aria-label="Choose session recap" value={selected?.id ?? dates[0].id}
        onChange={event => void selectRecap(event.target.value)} disabled={loading}>
        {dates.map(recap => <option value={recap.id} key={recap.id}>{formatRecapDate(recap.date)} · {recap.title}</option>)}
      </select></label>}
    </div>
    {loading && <p className="campaign-empty-copy" role="status">Loading session recap…</p>}
    {error && <p className="campaign-error" role="alert">{error}</p>}
    {!loading && !error && !selected && <p className="campaign-empty-copy">No session recap has been posted yet.</p>}
    {selected && !loading && <article className="session-recap-reading">
      <p className="campaign-kicker">{formatRecapDate(selected.date)}</p>
      <h3>{selected.title}</h3>
      <SessionRecapMarkdown content={selected.content} />
    </article>}
  </section>;
}
