"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignDialog } from "./campaign-dialog";
import {
  campaignRoleLabel,
  formatCampaignDate,
  type CampaignMember,
  type CampaignSummary,
  type CreatedInvite,
} from "./campaign-types";

/* eslint-disable @next/next/no-img-element -- the established navigation mark is a static asset */

type Confirmation =
  | { kind: "delete" }
  | { kind: "leave" }
  | { kind: "remove"; member: CampaignMember };

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  async function loadCampaign() {
    try {
      const [campaignResponse, memberResponse] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" }),
        fetch(`/api/campaigns/${campaignId}/members`, { cache: "no-store" }),
      ]);
      const campaignPayload = await campaignResponse.json() as {
        campaign?: CampaignSummary;
        error?: string;
      };
      const memberPayload = await memberResponse.json() as {
        members?: CampaignMember[];
        error?: string;
      };
      if (!campaignResponse.ok || !campaignPayload.campaign) {
        throw new Error(campaignPayload.error || "This campaign could not be opened.");
      }
      if (!memberResponse.ok) {
        throw new Error(memberPayload.error || "The campaign roster could not be loaded.");
      }
      setCampaign(campaignPayload.campaign);
      setMembers(Array.isArray(memberPayload.members) ? memberPayload.members : []);
      setRenameValue(campaignPayload.campaign.name);
    } catch (loadError) {
      setCampaign(null);
      setMembers([]);
      setError(loadError instanceof Error ? loadError.message : "This campaign could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Initial client-side API hydration; all state changes happen after fetch settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCampaign();
    // This route remounts for a different public campaign ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function renameCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!campaign) return;
    const name = renameValue.trim();
    if (!name) {
      setError("Enter a campaign name.");
      return;
    }
    setActionBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, version: campaign.version }),
      });
      const payload = await response.json() as {
        campaign?: CampaignSummary;
        error?: string;
      };
      if (!response.ok || !payload.campaign) {
        throw new Error(payload.error || "The campaign could not be renamed.");
      }
      setCampaign(payload.campaign);
      setRenameValue(payload.campaign.name);
      setRenameOpen(false);
      setNotice("Campaign name updated.");
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "The campaign could not be renamed.");
    } finally {
      setActionBusy(false);
    }
  }

  async function createInvite() {
    if (!campaign) return;
    setActionBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/invites`, {
        method: "POST",
      });
      const payload = await response.json() as {
        invite?: CreatedInvite;
        error?: string;
      };
      if (!response.ok || !payload.invite) {
        throw new Error(payload.error || "The campaign invitation could not be created.");
      }
      setInvite(payload.invite);
      setInviteCopied(false);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "The campaign invitation could not be created.");
    } finally {
      setActionBusy(false);
    }
  }

  async function copyInvite() {
    if (!invite) return;
    try {
      const inviteUrl = new URL("/campaigns/join", window.location.origin);
      inviteUrl.hash = invite.token;
      await navigator.clipboard.writeText(inviteUrl.toString());
      setInviteCopied(true);
    } catch {
      setInviteCopied(false);
      setNotice("Select the invite code and copy it manually.");
    }
  }

  async function revokeInvite() {
    if (!campaign || !invite) return;
    setActionBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/invites`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: invite.token }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The invitation could not be revoked.");
      setInvite(null);
      setInviteCopied(false);
      setNotice("Campaign invitation revoked.");
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "The invitation could not be revoked.");
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmDestructiveAction() {
    if (!campaign || !confirmation) return;
    setActionBusy(true);
    setError("");
    try {
      if (confirmation.kind === "delete") {
        const response = await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error || "The campaign could not be deleted.");
        router.push("/campaigns");
        return;
      }
      if (confirmation.kind === "leave") {
        const response = await fetch(`/api/campaigns/${campaign.id}/membership`, { method: "DELETE" });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error || "The campaign could not be left.");
        router.push("/campaigns");
        return;
      }
      const response = await fetch(`/api/campaigns/${campaign.id}/members`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberKey: confirmation.member.memberKey }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The campaign member could not be removed.");
      setMembers(current => current.filter(member => member.memberKey !== confirmation.member.memberKey));
      setCampaign(current => current ? {
        ...current,
        memberCount: Math.max(0, current.memberCount - 1),
      } : current);
      setNotice(`${confirmation.member.name} was removed from the campaign. Their characters were not deleted or changed.`);
      setConfirmation(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The campaign action could not be completed.");
    } finally {
      setActionBusy(false);
    }
  }

  function closeInvite() {
    setInvite(null);
    setInviteCopied(false);
  }

  return (
    <main className="campaign-shell">
      <header className="campaign-header">
        <Link href="/" className="campaign-brand" aria-label="Tales Without End home">
          <img src="/assets/tales-without-end-navigation-logo.svg" alt="" />
          <span>Tales Without End</span>
        </Link>
        <nav aria-label="Campaign navigation">
          <Link href="/campaigns">My Campaigns</Link>
          <Link href="/">My Characters</Link>
        </nav>
      </header>

      {busy && <div className="campaign-page-state" role="status">Opening the campaign ledger…</div>}
      {!busy && error && !campaign && (
        <div className="campaign-page-state campaign-page-error" role="alert">
          <h1>Campaign unavailable</h1>
          <p>{error}</p>
          <Link className="campaign-secondary" href="/campaigns">Return to My Campaigns</Link>
        </div>
      )}
      {!busy && campaign && (
        <>
          <section className="campaign-hero campaign-detail-hero" aria-labelledby="campaign-title">
            <div>
              <p className="campaign-kicker">PRIVATE CAMPAIGN · {campaignRoleLabel(campaign).toUpperCase()}</p>
              <h1 id="campaign-title">{campaign.name}</h1>
              <p>{campaign.memberCount} {campaign.memberCount === 1 ? "member" : "members"} · Updated {formatCampaignDate(campaign.updatedAt)}</p>
            </div>
            <div className="campaign-hero-actions">
              {campaign.permissions.canInviteMembers && (
                <button type="button" className="campaign-primary" onClick={() => void createInvite()} disabled={actionBusy}>Invite Player</button>
              )}
              {campaign.permissions.canManageSettings && (
                <button type="button" className="campaign-secondary" onClick={() => setRenameOpen(true)}>Rename Campaign</button>
              )}
            </div>
          </section>

          {campaign.permissions.adminReadOnly && (
            <div className="campaign-readonly" role="status">
              Administrator read-only view. Campaign ownership and member permissions remain unchanged.
            </div>
          )}
          {notice && <div className="campaign-notice" role="status">{notice}</div>}
          {error && <div className="campaign-error" role="alert">{error}</div>}

          <div className="campaign-detail-layout">
            <section className="campaign-panel" aria-labelledby="campaign-members-title">
              <div className="campaign-section-heading">
                <div>
                  <p className="campaign-kicker">THE COMPANY</p>
                  <h2 id="campaign-members-title">Campaign members</h2>
                </div>
                <span className="campaign-count" aria-label={`${members.length} campaign members`}>{members.length}</span>
              </div>
              <div className="campaign-member-list">
                {members.map(member => (
                  <article className="campaign-member" key={member.memberKey}>
                    <div className="campaign-member-mark" aria-hidden="true">{member.isOwner ? "✦" : "•"}</div>
                    <div>
                      <h3>{member.name}</h3>
                      <p>{member.isOwner ? "Owner · Game Master" : member.role === "gm" ? "Game Master" : "Player"}</p>
                    </div>
                    <time dateTime={member.joinedAt}>Joined {formatCampaignDate(member.joinedAt)}</time>
                    {campaign.permissions.canRemovePlayers && member.role === "player" && (
                      <button type="button" className="campaign-member-remove" onClick={() => setConfirmation({ kind: "remove", member })}>
                        Remove from Campaign
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <aside className="campaign-panel campaign-management" aria-labelledby="campaign-management-title">
              <p className="campaign-kicker">CAMPAIGN RECORD</p>
              <h2 id="campaign-management-title">Your access</h2>
              <dl>
                <div><dt>Role</dt><dd>{campaignRoleLabel(campaign)}</dd></div>
                <div><dt>Campaign ID</dt><dd>{campaign.id}</dd></div>
              </dl>
              {!campaign.permissions.adminReadOnly && (
                <div className="campaign-management-actions">
                  {campaign.permissions.canLeave && (
                    <button type="button" className="campaign-secondary" onClick={() => setConfirmation({ kind: "leave" })}>Leave Campaign</button>
                  )}
                  {campaign.permissions.canDelete && (
                    <button type="button" className="campaign-danger" onClick={() => setConfirmation({ kind: "delete" })}>Delete Campaign</button>
                  )}
                </div>
              )}
              <p className="campaign-management-note">Campaign membership never transfers character ownership or changes character visibility.</p>
            </aside>
          </div>
        </>
      )}

      {renameOpen && campaign && (
        <CampaignDialog title="Rename Campaign" onClose={() => setRenameOpen(false)}>
          <form className="campaign-dialog-form" onSubmit={renameCampaign}>
            <label htmlFor="rename-campaign-name">Campaign name</label>
            <input id="rename-campaign-name" value={renameValue} onChange={event => setRenameValue(event.target.value)} maxLength={120} autoFocus />
            <div className="campaign-dialog-actions">
              <button type="button" className="campaign-quiet" onClick={() => setRenameOpen(false)}>Cancel</button>
              <button type="submit" className="campaign-primary" disabled={actionBusy}>{actionBusy ? "Saving…" : "Save Name"}</button>
            </div>
          </form>
        </CampaignDialog>
      )}

      {invite && (
        <CampaignDialog
          title="Campaign Invite"
          description="Share this link or code with the player you want to invite. It is displayed only now."
          onClose={closeInvite}
        >
          <div className="campaign-invite-code">
            <label htmlFor="created-campaign-invite">Single-use invite code</label>
            <input id="created-campaign-invite" readOnly value={invite.token} onFocus={event => event.currentTarget.select()} />
          </div>
          <p className="campaign-invite-expiry">Expires <time dateTime={invite.expiresAt}>{formatCampaignDate(invite.expiresAt)}</time>. The code can be redeemed once.</p>
          <div className="campaign-dialog-actions">
            <button type="button" className="campaign-danger" onClick={() => void revokeInvite()} disabled={actionBusy}>Revoke Invite</button>
            <button type="button" className="campaign-primary" onClick={() => void copyInvite()}>{inviteCopied ? "Copied" : "Copy Invite Link"}</button>
          </div>
          <p className="campaign-invite-note" role="status">{inviteCopied ? "Invite link copied to your clipboard." : "The plaintext code cannot be retrieved after this window closes."}</p>
        </CampaignDialog>
      )}

      {confirmation && (
        <CampaignDialog
          title={confirmation.kind === "delete" ? "Delete Campaign" : confirmation.kind === "leave" ? "Leave Campaign" : "Remove Player"}
          onClose={() => setConfirmation(null)}
        >
          <p className="campaign-confirm-copy">
            {confirmation.kind === "delete" && "Delete this private campaign and its membership records? Deleting this campaign does not delete any characters."}
            {confirmation.kind === "leave" && "Leave this campaign? Your characters, ownership, and visibility will not change."}
            {confirmation.kind === "remove" && `Remove ${confirmation.member.name} from this campaign? Their characters will not be deleted and ownership will not change.`}
          </p>
          <div className="campaign-dialog-actions">
            <button type="button" className="campaign-quiet" onClick={() => setConfirmation(null)}>Cancel</button>
            <button type="button" className="campaign-danger" onClick={() => void confirmDestructiveAction()} disabled={actionBusy}>
              {actionBusy ? "Working…" : confirmation.kind === "delete" ? "Delete Campaign" : confirmation.kind === "leave" ? "Leave Campaign" : "Remove from Campaign"}
            </button>
          </div>
        </CampaignDialog>
      )}
    </main>
  );
}
