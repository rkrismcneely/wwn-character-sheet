"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CampaignDialog } from "./campaign-dialog";
import { SignedInHeader } from "../app-header";
import { SessionRecapPanel } from "./session-recap-panel";
import dynamic from "next/dynamic";
import type { ConsoleTab } from "./gm-console";

// Load the large GM workspace only when a GM opens one of its tabs.
const GmConsole = dynamic(() => import("./gm-console").then(module => module.GmConsole), { ssr: false });
import { campaignInviteLink } from "@/lib/campaigns/invite-link";
import {
  campaignRoleLabel,
  formatCampaignDate,
  type CampaignCharacter,
  type CampaignMember,
  type CampaignResource,
  type CampaignSummary,
  type CreatedInvite,
} from "./campaign-types";

type Confirmation =
  | { kind: "delete" }
  | { kind: "leave" }
  | { kind: "remove"; member: CampaignMember }
  | { kind: "unlink"; character: CampaignCharacter }
  | { kind: "resource"; resource: CampaignResource };

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [campaignTab, setCampaignTab] = useState<"campaign" | ConsoleTab>("campaign");
  const [gmOpened, setGmOpened] = useState(false);
  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [characters, setCharacters] = useState<CampaignCharacter[]>([]);
  const [resources, setResources] = useState<CampaignResource[]>([]);
  const [eligibleCharacters, setEligibleCharacters] = useState<CampaignCharacter[]>([]);
  const [busy, setBusy] = useState(true);
  const [detailsBusy, setDetailsBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState("");
  const [resourceOpen, setResourceOpen] = useState(false);
  const [resourceEditing, setResourceEditing] = useState<CampaignResource | null>(null);
  const [resourceDraft, setResourceDraft] = useState({ title: "", type: "text" as "text" | "link", content: "" });
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [changeCharacter, setChangeCharacter] = useState<CampaignCharacter | null>(null);
  const [replacementCharacterId, setReplacementCharacterId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [invite, setInvite] = useState<CreatedInvite | null>(null);
  const [inviteCopied, setInviteCopied] = useState<"link" | "code" | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  async function loadCampaign() {
    // Request all sections concurrently; release the header and navigation
    // as soon as campaign access is confirmed.
    let primaryLoaded = false;
    const campaignRequest = fetch(`/api/campaigns/${campaignId}`, { cache: "no-store" });
    const detailRequests = Promise.all([
      fetch(`/api/campaigns/${campaignId}/members`, { cache: "no-store" }),
      fetch(`/api/campaigns/${campaignId}/characters`, { cache: "no-store" }),
      fetch(`/api/campaigns/${campaignId}/resources`, { cache: "no-store" }),
    ]).then(async ([memberResponse, characterResponse, resourceResponse]) => {
      const [memberPayload, characterPayload, resourcePayload] = await Promise.all([
        memberResponse.json() as Promise<{ members?: CampaignMember[]; error?: string }>,
        characterResponse.json() as Promise<{ characters?: CampaignCharacter[]; eligibleCharacters?: CampaignCharacter[]; error?: string }>,
        resourceResponse.json() as Promise<{ resources?: CampaignResource[]; error?: string }>,
      ]);
      if (!memberResponse.ok) throw new Error(memberPayload.error || "The campaign roster could not be loaded.");
      if (!characterResponse.ok) throw new Error(characterPayload.error || "The campaign character library could not be loaded.");
      if (!resourceResponse.ok) throw new Error(resourcePayload.error || "The campaign resources could not be loaded.");
      return { memberPayload, characterPayload, resourcePayload };
    });
    // Attach a rejection handler now, including if the primary request fails.
    void detailRequests.catch(() => {});
    try {
      const response = await campaignRequest;
      const payload = await response.json() as { campaign?: CampaignSummary; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error || "This campaign could not be opened.");
      primaryLoaded = true;
      setCampaign(payload.campaign);
      setRenameValue(payload.campaign.name);
      setDescriptionValue(payload.campaign.description ?? "");
      setBusy(false);
      const { memberPayload, characterPayload, resourcePayload } = await detailRequests;
      setMembers(Array.isArray(memberPayload.members) ? memberPayload.members : []);
      setCharacters(Array.isArray(characterPayload.characters) ? characterPayload.characters : []);
      setEligibleCharacters(Array.isArray(characterPayload.eligibleCharacters) ? characterPayload.eligibleCharacters : []);
      setResources(Array.isArray(resourcePayload.resources) ? resourcePayload.resources : []);
      setError("");
    } catch (loadError) {
      if (!primaryLoaded) {
        setCampaign(null);
        setMembers([]);
        setCharacters([]);
        setEligibleCharacters([]);
        setResources([]);
      }
      setError(loadError instanceof Error ? loadError.message : "This campaign could not be opened.");
    } finally {
      setBusy(false);
      setDetailsBusy(false);
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

  async function saveDescription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!campaign) return;
    setActionBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: descriptionValue, version: campaign.version }),
      });
      const payload = await response.json() as { campaign?: CampaignSummary; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error || "The campaign description could not be saved.");
      setCampaign(payload.campaign);
      setDescriptionValue(payload.campaign.description ?? "");
      setDescriptionOpen(false);
      setNotice("Campaign description updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The campaign description could not be saved.");
    } finally {
      setActionBusy(false);
    }
  }

  function openResource(resource?: CampaignResource) {
    setResourceEditing(resource ?? null);
    setResourceDraft(resource ? { title: resource.title, type: resource.type, content: resource.content } : { title: "", type: "text", content: "" });
    setResourceOpen(true);
  }

  async function saveResource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!campaign) return;
    setActionBusy(true);
    setError("");
    try {
      const response = await fetch(resourceEditing ? `/api/campaigns/${campaign.id}/resources/${resourceEditing.resourceKey}` : `/api/campaigns/${campaign.id}/resources`, {
        method: resourceEditing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(resourceDraft),
      });
      const payload = await response.json() as { resources?: CampaignResource[]; error?: string };
      if (!response.ok || !payload.resources) throw new Error(payload.error || "The campaign resource could not be saved.");
      setResources(payload.resources);
      setResourceOpen(false);
      setNotice(resourceEditing ? "Campaign resource updated." : "Campaign resource added.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The campaign resource could not be saved.");
    } finally {
      setActionBusy(false);
    }
  }

  async function moveResource(resource: CampaignResource, direction: "up" | "down") {
    if (!campaign) return;
    setActionBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/resources/${resource.resourceKey}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      const payload = await response.json() as { resources?: CampaignResource[]; error?: string };
      if (!response.ok || !payload.resources) throw new Error(payload.error || "The campaign resource could not be reordered.");
      setResources(payload.resources);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "The campaign resource could not be reordered.");
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
      setInviteCopied(null);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "The campaign invitation could not be created.");
    } finally {
      setActionBusy(false);
    }
  }

  async function copyInviteLink() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(campaignInviteLink(invite.token));
      setInviteCopied("link");
    } catch {
      setInviteCopied(null);
      setNotice("The invite link could not be copied. Copy the cminv_ invitation code instead.");
    }
  }

  async function copyInviteCode() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.token);
      setInviteCopied("code");
    } catch {
      setInviteCopied(null);
      setNotice("Select the cminv_ invitation code and copy it manually.");
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
      setInviteCopied(null);
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
      if (confirmation.kind === "resource") {
        const response = await fetch(`/api/campaigns/${campaign.id}/resources/${confirmation.resource.resourceKey}`, { method: "DELETE" });
        const payload = await response.json() as { resources?: CampaignResource[]; error?: string };
        if (!response.ok || !payload.resources) throw new Error(payload.error || "The campaign resource could not be deleted.");
        setResources(payload.resources);
        setNotice(`${confirmation.resource.title} was removed from this campaign.`);
        setConfirmation(null);
        return;
      }
      if (confirmation.kind === "unlink") {
        const response = await fetch(`/api/campaigns/${campaign.id}/characters`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ characterId: confirmation.character.id }),
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error || "The character could not be removed from the campaign.");
        setCharacters(current => current.filter(character => character.id !== confirmation.character.id));
        setEligibleCharacters(current => [confirmation.character, ...current]);
        setNotice(`${confirmation.character.name} was removed from this campaign. The character itself was not deleted or changed.`);
        setConfirmation(null);
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

  async function linkCharacter(character: CampaignCharacter) {
    if (!campaign) return;
    setActionBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/characters`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId: character.id }),
      });
      const payload = await response.json() as {
        character?: CampaignCharacter;
        error?: string;
      };
      if (!response.ok || !payload.character) {
        throw new Error(payload.error || "The character could not be added to the campaign.");
      }
      setCharacters(current => [...current, payload.character!].sort((left, right) => left.name.localeCompare(right.name)));
      setEligibleCharacters([]);
      setNotice(`${payload.character.name} was added to the campaign library. Ownership and visibility were not changed.`);
      setAddCharacterOpen(false);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "The character could not be added to the campaign.");
    } finally {
      setActionBusy(false);
    }
  }

  function openCharacterReplacement(character: CampaignCharacter) {
    setReplacementCharacterId("");
    setChangeCharacter(character);
  }

  async function replaceCharacter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!campaign || !changeCharacter || !replacementCharacterId) return;
    const replacement = eligibleCharacters.find(character => character.id === replacementCharacterId);
    if (!replacement) {
      setError("Choose an eligible character you own.");
      return;
    }
    setActionBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/characters`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentCharacterId: changeCharacter.id,
          replacementCharacterId,
        }),
      });
      const payload = await response.json() as { character?: CampaignCharacter; error?: string };
      if (!response.ok || !payload.character) {
        throw new Error(payload.error || "The campaign character could not be changed.");
      }
      setCharacters(current => current
        .map(character => character.id === changeCharacter.id ? payload.character! : character)
        .sort((left, right) => left.name.localeCompare(right.name)));
      setEligibleCharacters(current => [
        changeCharacter,
        ...current.filter(character => character.id !== payload.character!.id),
      ].sort((left, right) => left.name.localeCompare(right.name)));
      setNotice(`${payload.character.name} is now your campaign character. ${changeCharacter.name} remains unchanged in My Characters.`);
      setChangeCharacter(null);
      setReplacementCharacterId("");
    } catch (replaceError) {
      setError(replaceError instanceof Error ? replaceError.message : "The campaign character could not be changed.");
    } finally {
      setActionBusy(false);
    }
  }

  async function changeCampaignLifecycle(archived: boolean) {
    if (!campaign) return;
    if (archived && !window.confirm(`Archive ${campaign.name}? Members keep read access, while edits, invitations, joins, and character-link changes pause until restore.`)) return;
    setActionBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/archive`, { method: archived ? "POST" : "DELETE" });
      const payload = await response.json() as { campaign?: CampaignSummary; error?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.error || "The campaign lifecycle could not be changed.");
      setCampaign(payload.campaign);
      setEligibleCharacters([]);
      setNotice(`Campaign ${archived ? "archived" : "restored"}.`);
    } catch (lifecycleError) {
      setError(lifecycleError instanceof Error ? lifecycleError.message : "The campaign lifecycle could not be changed.");
    } finally {
      setActionBusy(false);
    }
  }

  function closeInvite() {
    setInvite(null);
    setInviteCopied(null);
  }

  return (
    <main className="campaign-shell">
      <SignedInHeader active="campaigns" />

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
          {campaign.permissions.canUseGmConsole && !campaign.archivedAt && (
            <nav className="gm-console-tabs" aria-label="Campaign pages">
              {(["campaign", "encounter", "bestiary", "npcs", "items", "stores", "party", "recaps"] as const).map(item => <button type="button" key={item} className={campaignTab === item ? "active" : ""} aria-current={campaignTab === item ? "page" : undefined} onClick={() => { setCampaignTab(item); if (item !== "campaign") setGmOpened(true); }}>{item === "campaign" ? "Campaign" : item === "npcs" ? "My NPCs" : item === "recaps" ? "Session Recap" : item[0].toUpperCase() + item.slice(1)}</button>)}
            </nav>
          )}
          {gmOpened && campaign.permissions.canUseGmConsole && !campaign.archivedAt && (
            <div hidden={campaignTab === "campaign"}>
              <GmConsole campaignId={campaignId} campaignName={campaign.name} embedded activeTab={campaignTab === "campaign" ? "encounter" : campaignTab} />
            </div>
          )}
          <div hidden={campaignTab !== "campaign"}>
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

          {campaign.archivedAt && (
            <div className="campaign-readonly campaign-archived-notice" role="status">
              Archived campaign · Existing members retain read access. Restore the campaign to resume invitations and management.
            </div>
          )}
          {campaign.permissions.adminReadOnly && (
            <div className="campaign-readonly" role="status">
              Administrator read-only view. Campaign ownership and member permissions remain unchanged.
            </div>
          )}
          {notice && <div className="campaign-notice" role="status">{notice}</div>}
          {error && <div className="campaign-error" role="alert">{error}</div>}

          {detailsBusy && <div className="campaign-page-state" role="status">Loading campaign details…</div>}
          {!detailsBusy && <div className="campaign-detail-layout">
            <section className="campaign-panel campaign-overview-panel" aria-labelledby="campaign-overview-title">
            <div className="campaign-section-heading">
              <div>
                <p className="campaign-kicker">CAMPAIGN OVERVIEW</p>
                <h2 id="campaign-overview-title">About this campaign</h2>
              </div>
              {campaign.permissions.canManageContent && <button type="button" className="campaign-secondary" onClick={() => { setDescriptionValue(campaign.description ?? ""); setDescriptionOpen(true); }}>{campaign.description ? "Edit Description" : "Add Description"}</button>}
            </div>
            {campaign.description ? <p className="campaign-description">{campaign.description}</p> : <p className="campaign-empty-copy">{campaign.permissions.canManageContent ? "Add a short briefing so members know what this campaign is about." : "The campaign owner has not added a description yet."}</p>}
            </section>

            <section className="campaign-panel campaign-resources-panel" aria-labelledby="campaign-resources-title">
              <div className="campaign-section-heading">
                <div>
                  <p className="campaign-kicker">REFERENCE DESK</p>
                  <h2 id="campaign-resources-title">Campaign Resources</h2>
                </div>
                {campaign.permissions.canManageContent && <button type="button" className="campaign-primary" onClick={() => openResource()}>Add Resource</button>}
              </div>
              {resources.length === 0 ? <p className="campaign-empty-copy">{campaign.permissions.canManageContent ? "Add a Discord, VTT, document, wiki, or rules link for the company." : "No campaign resources have been added yet."}</p> : <div className="campaign-resource-list">
                {resources.map((resource, index) => <article className="campaign-resource-card" key={resource.resourceKey}>
                  <div className="campaign-resource-card-body"><p className="campaign-kicker">{resource.type === "link" ? "EXTERNAL LINK" : "CAMPAIGN NOTE"}</p><h3>{resource.title}</h3>{resource.type === "link" ? <a href={resource.content} target="_blank" rel="noreferrer">{resource.content}</a> : <p className="campaign-resource-text">{resource.content}</p>}</div>
                  {campaign.permissions.canManageContent && <div className="campaign-resource-actions"><button type="button" className="campaign-quiet" onClick={() => openResource(resource)}>Edit</button><button type="button" className="campaign-quiet" onClick={() => void moveResource(resource, "up")} disabled={index === 0 || actionBusy}>Move up</button><button type="button" className="campaign-quiet" onClick={() => void moveResource(resource, "down")} disabled={index === resources.length - 1 || actionBusy}>Move down</button><button type="button" className="campaign-danger" onClick={() => setConfirmation({ kind: "resource", resource })}>Delete</button></div>}
                </article>)}
              </div>}
            </section>

            <SessionRecapPanel campaignId={campaignId} />

            <section className="campaign-panel campaign-character-panel" aria-labelledby="campaign-characters-title">
              <div className="campaign-section-heading">
                <div>
                  <p className="campaign-kicker">SHARED ROSTER</p>
                  <h2 id="campaign-characters-title">Campaign Characters</h2>
                </div>
                <div className="campaign-character-heading-actions">
                  <span className="campaign-count" aria-label={`${characters.length} linked characters`}>{characters.length}</span>
                  {campaign.permissions.canLinkCharacters && !characters.some(character => character.isMine) && (
                    <button type="button" className="campaign-primary" onClick={() => setAddCharacterOpen(true)}>Add Your Character</button>
                  )}
                </div>
              </div>
              {characters.length === 0 ? (
                <div className="campaign-character-empty">
                  <span aria-hidden="true">✦</span>
                  <h3>No characters linked yet</h3>
                  <p>Campaign owners and members can add a character they own without changing ownership or global visibility.</p>
                  {campaign.permissions.canLinkCharacters && !characters.some(character => character.isMine) && (
                    <button type="button" className="campaign-secondary" onClick={() => setAddCharacterOpen(true)}>Add Your Character</button>
                  )}
                </div>
              ) : (
                <div className="campaign-character-grid">
                  {characters.map(character => (
                    <article className="campaign-character-card" key={character.id}>
                      <div className="campaign-character-portrait">
                        {character.portraitUrl
                          ? <img src={character.portraitUrl} alt={`${character.name} portrait`} />
                          : <span aria-hidden="true">✦</span>}
                      </div>
                      <div className="campaign-character-identity">
                        <p>PLAYER · {character.ownerName}</p>
                        <h3>{character.name}</h3>
                        <span>{character.classLabel} · Level {character.level}</span>
                      </div>
                      <div className="campaign-character-vitals" aria-label={`${character.name} combat summary`}>
                        <div><span>HP</span><strong>{character.hpCurrent} / {character.hpMax}</strong></div>
                        <div><span>AC</span><strong>{character.armorClass}</strong></div>
                      </div>
                      <div className="campaign-character-actions">
                        <Link className="campaign-open" href={`/campaigns/${campaign.id}/characters/${character.id}`}>
                          Open Character <span aria-hidden="true">→</span>
                        </Link>
                        {character.permissions.canUnlink && (
                          <button type="button" className="campaign-quiet" onClick={() => setConfirmation({ kind: "unlink", character })}>
                            Remove from Campaign
                          </button>
                        )}
                      </div>
                      {campaign.membershipRole === "player" && character.isMine && (
                        eligibleCharacters.length > 0
                          ? <button type="button" className="campaign-change-character" onClick={() => openCharacterReplacement(character)}>Change Character</button>
                          : <p className="campaign-character-switch-empty">You don&apos;t have another eligible character to switch to.</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

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
              </dl>
              {!campaign.permissions.adminReadOnly && (
                <div className="campaign-management-actions">
                  {campaign.permissions.canArchive && (
                    <details className="campaign-secondary-actions"><summary>More actions</summary><div><button type="button" className="campaign-secondary" onClick={() => void changeCampaignLifecycle(true)} disabled={actionBusy}>Archive campaign</button></div></details>
                  )}
                  {campaign.permissions.canRestore && (
                    <button type="button" className="campaign-primary" onClick={() => void changeCampaignLifecycle(false)} disabled={actionBusy}>Restore Campaign</button>
                  )}
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
          </div>}
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

      {descriptionOpen && campaign && (
        <CampaignDialog title={campaign.description ? "Edit Campaign Description" : "Add Campaign Description"} onClose={() => setDescriptionOpen(false)}>
          <form className="campaign-dialog-form" onSubmit={saveDescription}>
            <label htmlFor="campaign-description">Description</label>
            <textarea id="campaign-description" value={descriptionValue} onChange={event => setDescriptionValue(event.target.value)} maxLength={4000} rows={8} placeholder="A short briefing for the company…" autoFocus />
            <div className="campaign-dialog-actions"><button type="button" className="campaign-quiet" onClick={() => setDescriptionOpen(false)}>Cancel</button><button type="submit" className="campaign-primary" disabled={actionBusy}>{actionBusy ? "Saving…" : "Save Description"}</button></div>
          </form>
        </CampaignDialog>
      )}

      {resourceOpen && campaign && (
        <CampaignDialog title={resourceEditing ? "Edit Campaign Resource" : "Add Campaign Resource"} description="Keep this to a useful note or a safe external HTTPS link for campaign members." onClose={() => setResourceOpen(false)}>
          <form className="campaign-dialog-form" onSubmit={saveResource}>
            <label htmlFor="campaign-resource-title">Title</label><input id="campaign-resource-title" value={resourceDraft.title} onChange={event => setResourceDraft(current => ({ ...current, title: event.target.value }))} maxLength={120} autoFocus />
            <label htmlFor="campaign-resource-type">Type</label><select id="campaign-resource-type" value={resourceDraft.type} onChange={event => setResourceDraft(current => ({ ...current, type: event.target.value as "text" | "link", content: "" }))}><option value="text">Campaign note</option><option value="link">External HTTPS link</option></select>
            <label htmlFor="campaign-resource-content">{resourceDraft.type === "link" ? "HTTPS URL" : "Note"}</label>{resourceDraft.type === "link" ? <input id="campaign-resource-content" type="url" value={resourceDraft.content} onChange={event => setResourceDraft(current => ({ ...current, content: event.target.value }))} placeholder="https://…" maxLength={2048} /> : <textarea id="campaign-resource-content" value={resourceDraft.content} onChange={event => setResourceDraft(current => ({ ...current, content: event.target.value }))} rows={6} maxLength={4000} />}
            <div className="campaign-dialog-actions"><button type="button" className="campaign-quiet" onClick={() => setResourceOpen(false)}>Cancel</button><button type="submit" className="campaign-primary" disabled={actionBusy}>{actionBusy ? "Saving…" : resourceEditing ? "Save Resource" : "Add Resource"}</button></div>
          </form>
        </CampaignDialog>
      )}

      {addCharacterOpen && campaign && (
        <CampaignDialog
          title="Add Your Character"
          description="Choose one of your existing characters for this campaign. Ownership and global visibility will not change."
          onClose={() => setAddCharacterOpen(false)}
        >
          {eligibleCharacters.length === 0 ? (
            <div className="campaign-link-empty" role="status">
              <strong>Your campaign character is already linked.</strong>
              <p>Each campaign participant may have one character in a campaign. Remove your current character before choosing a different one.</p>
            </div>
          ) : (
            <div className="campaign-link-list" aria-label="Characters eligible to add">
              {eligibleCharacters.map(character => (
                <article key={character.id}>
                  <div>
                    <h3>{character.name}</h3>
                    <p>{character.classLabel} · Level {character.level} · {character.visibility}</p>
                  </div>
                  <button type="button" className="campaign-primary" onClick={() => void linkCharacter(character)} disabled={actionBusy}>
                    {actionBusy ? "Adding…" : `Add ${character.name}`}
                  </button>
                </article>
              ))}
            </div>
          )}
        </CampaignDialog>
      )}

      {changeCharacter && campaign && (
        <CampaignDialog
          title="Change Campaign Character"
          description="Choose another character you own. Only the campaign link changes; both characters remain in My Characters with the same ownership and visibility."
          onClose={() => { setChangeCharacter(null); setReplacementCharacterId(""); }}
        >
          <form className="campaign-dialog-form" onSubmit={replaceCharacter}>
            <div className="campaign-current-character">
              <span>Currently linked</span>
              <strong>{changeCharacter.name}</strong>
              <small>{changeCharacter.classLabel} · Level {changeCharacter.level}</small>
            </div>
            <fieldset className="campaign-join-character-list">
              <legend>Choose your replacement character</legend>
              {eligibleCharacters.map(character => (
                <label key={character.id} className="campaign-join-character">
                  <input
                    type="radio"
                    name="replacement-character"
                    value={character.id}
                    checked={replacementCharacterId === character.id}
                    onChange={() => setReplacementCharacterId(character.id)}
                  />
                  <span><strong>{character.name}</strong><small>{character.classLabel} · Level {character.level} · {character.visibility}</small></span>
                </label>
              ))}
            </fieldset>
            <p className="campaign-replacement-confirmation">
              {replacementCharacterId
                ? `Confirm that ${eligibleCharacters.find(character => character.id === replacementCharacterId)?.name ?? "this character"} should replace ${changeCharacter.name} for this campaign.`
                : "Select a different owned character before confirming."}
            </p>
            <div className="campaign-dialog-actions">
              <button type="button" className="campaign-quiet" onClick={() => { setChangeCharacter(null); setReplacementCharacterId(""); }}>Cancel</button>
              <button type="submit" className="campaign-primary" disabled={actionBusy || !replacementCharacterId}>
                {actionBusy ? "Changing…" : "Confirm Character Change"}
              </button>
            </div>
          </form>
        </CampaignDialog>
      )}

      {invite && (
        <CampaignDialog
          title="Campaign Invitation"
          description="Share this private, single-use invitation link. The invite code remains available for manual entry."
          onClose={closeInvite}
        >
          <div className="campaign-invite-code">
            <label htmlFor="created-campaign-invite">Single-use invite code</label>
            <input id="created-campaign-invite" readOnly value={invite.token} onFocus={event => event.currentTarget.select()} />
          </div>
          <p className="campaign-invite-expiry">Expires <time dateTime={invite.expiresAt}>{formatCampaignDate(invite.expiresAt)}</time>. The invitation can be redeemed once.</p>
          <div className="campaign-dialog-actions">
            <button type="button" className="campaign-danger" onClick={() => void revokeInvite()} disabled={actionBusy}>Revoke Invite</button>
            <button type="button" className="campaign-secondary" onClick={() => void copyInviteCode()}>{inviteCopied === "code" ? "Code Copied" : "Copy Invite Code"}</button>
            <button type="button" className="campaign-primary" onClick={() => void copyInviteLink()}>{inviteCopied === "link" ? "Link Copied" : "Copy Invite Link"}</button>
          </div>
          <p className="campaign-invite-note" role="status">
            {inviteCopied === "link"
              ? "Invitation link copied to your clipboard."
              : inviteCopied === "code"
                ? "Invitation code copied to your clipboard."
                : "The plaintext code cannot be retrieved after this window closes. Campaign IDs beginning cmp_ are not invite codes."}
          </p>
        </CampaignDialog>
      )}

      {confirmation && (
        <CampaignDialog
          title={confirmation.kind === "delete" ? "Delete Campaign" : confirmation.kind === "leave" ? "Leave Campaign" : confirmation.kind === "unlink" ? "Remove Character" : confirmation.kind === "resource" ? "Delete Resource" : "Remove Player"}
          onClose={() => setConfirmation(null)}
        >
          <p className="campaign-confirm-copy">
            {confirmation.kind === "delete" && "Delete this private campaign and its membership records? Deleting this campaign does not delete any characters."}
            {confirmation.kind === "leave" && "Leave this campaign? Your characters, ownership, and visibility will not change."}
            {confirmation.kind === "remove" && `Remove ${confirmation.member.name} from this campaign? Their characters will not be deleted and ownership will not change.`}
            {confirmation.kind === "unlink" && `Remove ${confirmation.character.name} from this campaign? This removes only the campaign association; the character will not be deleted or changed.`}
            {confirmation.kind === "resource" && `Delete ${confirmation.resource.title} from this campaign? This cannot be undone.`}
          </p>
          <div className="campaign-dialog-actions">
            <button type="button" className="campaign-quiet" onClick={() => setConfirmation(null)}>Cancel</button>
            <button type="button" className="campaign-danger" onClick={() => void confirmDestructiveAction()} disabled={actionBusy}>
              {actionBusy ? "Working…" : confirmation.kind === "delete" ? "Delete Campaign" : confirmation.kind === "leave" ? "Leave Campaign" : confirmation.kind === "resource" ? "Delete Resource" : "Remove from Campaign"}
            </button>
          </div>
        </CampaignDialog>
      )}
    </main>
  );
}
