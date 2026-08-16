"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignDialog } from "./campaign-dialog";
import { SignedInHeader } from "../app-header";
import {
  campaignRoleLabel,
  formatCampaignDate,
  type CampaignSummary,
} from "./campaign-types";

const INVITE_PATTERN = /^cminv_[A-Za-z0-9_-]{43}$/u;

interface JoinCharacterOption {
  id: string;
  name: string;
  classLabel: string;
  level: number;
}

interface JoinPreview {
  campaign: { id: string; name: string };
  characters: JoinCharacterOption[];
}

function redemptionMessage(status: number, message?: string): string {
  if (status === 400) return "This campaign invitation is invalid.";
  if (status === 401) return "Sign in before joining a campaign.";
  if (status === 404) return "This invitation is invalid, expired, or has been revoked.";
  if (status === 409 && message?.includes("already a member")) {
    return "You are already part of this campaign. Open it from your campaign list.";
  }
  if (status === 409) return "This invitation has already been used.";
  return message || "The campaign invitation could not be redeemed.";
}

export function CampaignDashboard() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinPreview, setJoinPreview] = useState<JoinPreview | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadCampaigns() {
    try {
      const response = await fetch("/api/campaigns", { cache: "no-store" });
      const payload = await response.json() as {
        campaigns?: CampaignSummary[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Your campaigns could not be loaded.");
      setCampaigns(Array.isArray(payload.campaigns) ? payload.campaigns : []);
    } catch (loadError) {
      setCampaigns([]);
      setError(loadError instanceof Error ? loadError.message : "Your campaigns could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Initial client-side API hydration; all state changes happen after fetch settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCampaigns();
  }, []);

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = campaignName.trim();
    if (!name) {
      setError("Enter a campaign name.");
      return;
    }
    setCreateBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json() as {
        campaign?: CampaignSummary;
        error?: string;
      };
      if (!response.ok || !payload.campaign) {
        throw new Error(payload.error || "The campaign could not be created.");
      }
      setCampaigns(current => [payload.campaign!, ...current]);
      setCampaignName("");
      setCreateOpen(false);
      setNotice(`${payload.campaign.name} is ready. You are its owner and Game Master.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "The campaign could not be created.");
    } finally {
      setCreateBusy(false);
    }
  }

  function resetJoin() {
    setJoinPreview(null);
    setSelectedCharacterId("");
  }

  async function previewInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = inviteCode.trim();
    if (!INVITE_PATTERN.test(token)) {
      setError(
        token.startsWith("cmp_")
          ? "Campaign IDs beginning cmp_ are not invite codes. Ask the Game Master for a private code beginning cminv_."
          : "Enter the private cminv_ invitation code supplied by the Game Master.",
      );
      return;
    }
    setJoinBusy(true);
    setError("");
    setNotice("");
    resetJoin();
    try {
      const response = await fetch("/api/campaign-invites/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json() as JoinPreview & { error?: string };
      if (!response.ok || !payload.campaign || !Array.isArray(payload.characters)) {
        throw new Error(redemptionMessage(response.status, payload.error));
      }
      setJoinPreview({
        campaign: payload.campaign,
        characters: payload.characters,
      });
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "The campaign invitation could not be verified.");
    } finally {
      setJoinBusy(false);
    }
  }

  async function joinCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!joinPreview || !selectedCharacterId) {
      setError("Choose one of your characters to join this campaign.");
      return;
    }
    setJoinBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/campaign-invites/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: inviteCode.trim(),
          characterId: selectedCharacterId,
        }),
      });
      const payload = await response.json() as {
        campaign?: { id: string; name: string };
        membership?: { role: "player" };
        character?: JoinCharacterOption;
        error?: string;
      };
      if (!response.ok || !payload.campaign || !payload.character) {
        throw new Error(redemptionMessage(response.status, payload.error));
      }
      setInviteCode("");
      resetJoin();
      router.push(`/campaigns/${payload.campaign.id}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "The campaign invitation could not be redeemed.");
    } finally {
      setJoinBusy(false);
    }
  }

  return (
    <main className="campaign-shell">
      <SignedInHeader active="campaigns" />

      <section className="campaign-hero" aria-labelledby="my-campaigns-title">
        <div>
          <p className="campaign-kicker">THE COMPANY ARCHIVE · PRIVATE CAMPAIGNS</p>
          <h1 id="my-campaigns-title">My Campaigns</h1>
          <p>Gather your company, keep the roster close, and prepare the next shared tale.</p>
        </div>
        <button type="button" className="campaign-primary" onClick={() => setCreateOpen(true)}>
          ＋ Create Campaign
        </button>
      </section>

      {notice && <div className="campaign-notice" role="status">{notice}</div>}
      {error && <div className="campaign-error" role="alert">{error}</div>}

      <div className="campaign-dashboard-layout">
        <section className="campaign-panel" aria-labelledby="campaign-list-title">
          <div className="campaign-section-heading">
            <div>
              <p className="campaign-kicker">YOUR COMPANIES</p>
              <h2 id="campaign-list-title">Campaign roster</h2>
            </div>
            <span className="campaign-count" aria-label={`${campaigns.length} campaigns`}>{campaigns.length}</span>
          </div>

          {busy && <div className="campaign-state" role="status">Opening your campaign ledger…</div>}
          {!busy && !error && campaigns.length === 0 && (
            <div className="campaign-state campaign-empty">
              <span aria-hidden="true">✦</span>
              <h3>Your next campaign begins here.</h3>
              <p>Campaigns give players and GMs a private place to organize the group and manage membership.</p>
              <button type="button" className="campaign-primary" onClick={() => setCreateOpen(true)}>Create Campaign</button>
            </div>
          )}
          {!busy && campaigns.length > 0 && (
            <div className="campaign-card-grid">
              {campaigns.map(campaign => (
                <article className="campaign-card" key={campaign.id}>
                  <div className="campaign-card-topline">
                    <span>{campaignRoleLabel(campaign)}</span>
                    <span>{campaign.memberCount} {campaign.memberCount === 1 ? "member" : "members"}</span>
                  </div>
                  <h3>{campaign.name}</h3>
                  <p>Updated <time dateTime={campaign.updatedAt}>{formatCampaignDate(campaign.updatedAt)}</time></p>
                  <Link href={`/campaigns/${campaign.id}`} className="campaign-open">
                    Open campaign <span aria-hidden="true">→</span>
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="campaign-panel campaign-join" aria-labelledby="join-campaign-title">
          <p className="campaign-kicker">ANSWER THE CALL</p>
          {!joinPreview ? (
            <>
              <h2 id="join-campaign-title">Join a campaign</h2>
              <p>Enter the private, single-use invitation code supplied by the campaign’s Game Master.</p>
              <form onSubmit={previewInvite}>
                <label htmlFor="campaign-invite-code">Campaign invite code</label>
                <input
                  id="campaign-invite-code"
                  value={inviteCode}
                  onChange={event => {
                    setInviteCode(event.target.value);
                    resetJoin();
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="cminv_…"
                />
                <button type="submit" className="campaign-secondary" disabled={joinBusy}>
                  {joinBusy ? "Checking…" : "Continue"}
                </button>
              </form>
              <small>Invite codes begin with cminv_, expire after seven days, and can be used only once. A cmp_ Campaign ID is not an invite code.</small>
            </>
          ) : (
            <>
              <h2 id="join-campaign-title">Choose Your Character</h2>
              <p>Select the one character who will join <strong>{joinPreview.campaign.name}</strong>. Your other characters remain unrelated to this campaign.</p>
              {joinPreview.characters.length === 0 ? (
                <div className="campaign-link-empty" role="status">
                  <strong>You need an owned character to join.</strong>
                  <p>Create or claim a character from My Characters, then return with this invitation.</p>
                </div>
              ) : (
                <form onSubmit={joinCampaign}>
                  <fieldset className="campaign-join-character-list">
                    <legend>Choose one character</legend>
                    {joinPreview.characters.map(character => (
                      <label key={character.id} className="campaign-join-character">
                        <input
                          type="radio"
                          name="campaign-character"
                          value={character.id}
                          checked={selectedCharacterId === character.id}
                          onChange={() => setSelectedCharacterId(character.id)}
                        />
                        <span><strong>{character.name}</strong><small>{character.classLabel} · Level {character.level}</small></span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="campaign-dialog-actions">
                    <button type="button" className="campaign-quiet" onClick={resetJoin}>Back</button>
                    <button type="submit" className="campaign-secondary" disabled={joinBusy || !selectedCharacterId}>
                      {joinBusy
                        ? "Joining…"
                        : selectedCharacterId
                          ? `Join ${joinPreview.campaign.name} as ${joinPreview.characters.find(character => character.id === selectedCharacterId)?.name || "Character"}`
                          : "Choose a Character"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </aside>
      </div>

      {createOpen && (
        <CampaignDialog
          title="Create Campaign"
          description="Create a private campaign company. You will be its owner and Game Master."
          onClose={() => setCreateOpen(false)}
        >
          <form className="campaign-dialog-form" onSubmit={createCampaign}>
            <label htmlFor="new-campaign-name">Campaign name</label>
            <input
              id="new-campaign-name"
              value={campaignName}
              onChange={event => setCampaignName(event.target.value)}
              maxLength={120}
              autoFocus
            />
            <div className="campaign-dialog-actions">
              <button type="button" className="campaign-quiet" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="submit" className="campaign-primary" disabled={createBusy}>
                {createBusy ? "Creating…" : "Create Campaign"}
              </button>
            </div>
          </form>
        </CampaignDialog>
      )}
    </main>
  );
}
