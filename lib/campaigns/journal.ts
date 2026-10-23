import { canManageCampaignContent } from "./authorization.ts";
import { CampaignServiceError, loadCampaignAccess } from "./service.ts";
import type { CampaignActor } from "./types.ts";

export type JournalEntry = {
  id: string; parentId: string | null; kind: "folder" | "page"; title: string;
  content: string; visibility: "gm" | "players" | "selected";
  createdAt: string; updatedAt: string;
};
type Row = JournalEntry;
const columns = "j.id, j.parent_id AS parentId, j.kind, j.title, j.content, j.visibility, j.created_at AS createdAt, j.updated_at AS updatedAt";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
async function context(db: D1Database, actor: CampaignActor | null, campaignId: string) {
  if (!actor) throw new CampaignServiceError("Sign in is required.", 401);
  const access = await loadCampaignAccess(db, actor, campaignId);
  return { campaignId: access.campaign.id, isGM: canManageCampaignContent(actor, access.campaign, access.membership) };
}
function cleanTitle(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160 || /[\u0000-\u001f\u007f]/u.test(value))
    throw new CampaignServiceError("Title must be 1–160 characters.", 422);
  return value.trim();
}
function cleanContent(value: unknown) {
  if (typeof value !== "string" || value.length > 100000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))
    throw new CampaignServiceError("Journal content must be Markdown up to 100,000 characters.", 422);
  return value;
}
function cleanVisibility(value: unknown): JournalEntry["visibility"] {
  if (value !== "gm" && value !== "players" && value !== "selected")
    throw new CampaignServiceError("Invalid visibility.", 422);
  return value;
}
async function requireGM(db: D1Database, actor: CampaignActor | null, campaignId: string) {
  const ctx = await context(db, actor, campaignId);
  if (!ctx.isGM) throw new CampaignServiceError("Only campaign GMs can edit the journal.", 403);
  return ctx.campaignId;
}
async function getParent(db: D1Database, campaignId: string, parentId: unknown) {
  if (parentId == null || parentId === "") return null;
  if (typeof parentId !== "string" || !uuidPattern.test(parentId))
    throw new CampaignServiceError("Invalid parent folder.", 422);
  const row = await db.prepare("SELECT kind FROM campaign_journal_entries WHERE campaign_id = ? AND id = ?")
    .bind(campaignId, parentId).first<{ kind: string }>();
  if (row?.kind !== "folder") throw new CampaignServiceError("Parent folder not found.", 422);
  return parentId;
}
export async function listJournal(db: D1Database, actor: CampaignActor | null, campaignId: string, preview = false) {
  const ctx = await context(db, actor, campaignId);
  const gmView = ctx.isGM && !preview;
  // Do not fetch restricted content into the player response. Selected readers are
  // evaluated against the authenticated user, never an ID supplied by the client.
  const rows = await db.prepare(`SELECT ${columns} FROM campaign_journal_entries j
    WHERE j.campaign_id = ? AND (? = 1 OR j.visibility = 'players'
      OR (j.visibility = 'selected' AND EXISTS (
        SELECT 1 FROM campaign_journal_readers r WHERE r.entry_id = j.id AND r.user_id = ?
      )))
    ORDER BY j.kind ASC, j.title COLLATE NOCASE ASC`)
    .bind(ctx.campaignId, gmView ? 1 : 0, actor!.userId).all<Row>();
  // Hide nested pages under restricted folders as well.
  const visible = new Map(rows.results.map(row => [row.id, row]));
  const canSee = (row: Row): boolean => {
    let parent = row.parentId;
    const seen = new Set<string>();
    while (parent) {
      if (seen.has(parent)) return false;
      seen.add(parent);
      const folder = visible.get(parent);
      if (!folder || folder.kind !== "folder") return false;
      parent = folder.parentId;
    }
    return true;
  };
  return { entries: rows.results.filter(canSee), canEdit: ctx.isGM && !preview };
}
export async function createJournalEntry(db: D1Database, actor: CampaignActor | null, campaignId: string,
  input: { parentId?: unknown; kind?: unknown; title?: unknown; content?: unknown; visibility?: unknown }) {
  const id = await requireGM(db, actor, campaignId);
  const kind = input.kind === "folder" ? "folder" : input.kind === "page" ? "page" : null;
  if (!kind) throw new CampaignServiceError("Invalid entry type.", 422);
  const parentId = await getParent(db, id, input.parentId);
  const title = cleanTitle(input.title);
  const content = kind === "folder" ? "" : cleanContent(input.content ?? "");
  const visibility = cleanVisibility(input.visibility ?? "gm");
  const entryId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO campaign_journal_entries
    (id, campaign_id, parent_id, kind, title, content, visibility, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(entryId, id, parentId, kind, title, content, visibility, now, now).run();
  return { id: entryId, parentId, kind, title, content, visibility, createdAt: now, updatedAt: now };
}
export async function updateJournalEntry(db: D1Database, actor: CampaignActor | null, campaignId: string,
  input: { id?: unknown; title?: unknown; content?: unknown; visibility?: unknown }) {
  const id = await requireGM(db, actor, campaignId);
  if (typeof input.id !== "string" || !uuidPattern.test(input.id))
    throw new CampaignServiceError("Invalid journal entry.", 422);
  const old = await db.prepare(`SELECT ${columns} FROM campaign_journal_entries j WHERE j.campaign_id = ? AND j.id = ?`)
    .bind(id, input.id).first<Row>();
  if (!old) throw new CampaignServiceError("Journal entry not found.", 404);
  const title = input.title === undefined ? old.title : cleanTitle(input.title);
  const content = old.kind === "folder" ? "" : input.content === undefined ? old.content : cleanContent(input.content);
  const visibility = input.visibility === undefined ? old.visibility : cleanVisibility(input.visibility);
  const updatedAt = new Date().toISOString();
  await db.prepare(`UPDATE campaign_journal_entries SET title = ?, content = ?, visibility = ?, updated_at = ?
    WHERE campaign_id = ? AND id = ?`).bind(title, content, visibility, updatedAt, id, old.id).run();
  return { ...old, title, content, visibility, updatedAt };
}

export async function setJournalReaders(db:D1Database,actor:CampaignActor|null,campaignId:string,entryId:string,userIds:string[]){
 const campaign=await requireGM(db,actor,campaignId);
 if(!uuidPattern.test(entryId)||!Array.isArray(userIds)||userIds.length>100||userIds.some(id=>typeof id!=="string"||!uuidPattern.test(id)))
   throw new CampaignServiceError("Invalid readers.",422);
 const entry=await db.prepare("SELECT id FROM campaign_journal_entries WHERE campaign_id=? AND id=?").bind(campaign,entryId).first();
 if(!entry)throw new CampaignServiceError("Journal entry not found.",404);
 const unique=[...new Set(userIds)];
 for(const userId of unique){
   const member=await db.prepare("SELECT user_id FROM campaign_members WHERE campaign_id=? AND user_id=?").bind(campaign,userId).first();
   if(!member)throw new CampaignServiceError("Reader is not a campaign member.",422);
 }
 await db.batch([db.prepare("DELETE FROM campaign_journal_readers WHERE entry_id=?").bind(entryId),
 ...unique.map(userId=>db.prepare("INSERT INTO campaign_journal_readers (entry_id,user_id) VALUES (?,?)").bind(entryId,userId))]);
 return {entryId,userIds:unique};
}
