import { canManageCampaignContent } from "./authorization.ts";
import { CampaignServiceError, loadCampaignAccess, requireActiveCampaign } from "./service.ts";
import type { CampaignActor } from "./types.ts";

export type CampaignSessionRecap = {
  id: string;
  date: string;
  title: string;
  content: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};
export type SessionRecapSummary = Pick<CampaignSessionRecap, "id" | "date" | "title">;
export type SessionRecapPage = { recaps: CampaignSessionRecap[]; page: number; totalPages: number; total: number };
export type SessionRecapArchive = { dates: SessionRecapSummary[]; latest: CampaignSessionRecap | null };
export const SESSION_RECAP_PAGE_SIZE = 10;

type RecapRow = {
  id: string; sessionDate: string; title: string; content: string; isPublished: number; createdAt: string; updatedAt: string;
};

const recapColumns = "id, session_date AS sessionDate, title, content, is_published AS isPublished, created_at AS createdAt, updated_at AS updatedAt";
export const PRIVATE_RECAP_DRAFT_CONTENT = "*Recording awaiting a GM-approved recap.*";
const order = "ORDER BY session_date DESC, created_at DESC, id DESC";

function asRecap(row: RecapRow): CampaignSessionRecap {
  return { id: row.id, date: row.sessionDate, title: row.title, content: row.content,
    isPublished: row.isPublished === 1, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
function validId(id: unknown): string {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) {
    throw new CampaignServiceError("Select a valid session recap.", 422);
  }
  return id;
}
function validateDraft(input: { date?: unknown; title?: unknown; content?: unknown }) {
  const date = input.date;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)
    || Number.isNaN(Date.parse(date + "T00:00:00Z"))
    || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) {
    throw new CampaignServiceError("Enter a valid session date.", 422);
  }
  if (!title || title.length > 120 || /[\u0000-\u001f\u007f]/u.test(title)) {
    throw new CampaignServiceError("The session title must be 1–120 characters.", 422);
  }
  if (!content || content.length > 30000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content)) {
    throw new CampaignServiceError("Enter a Markdown recap (up to 30,000 characters).", 422);
  }
  return { date, title, content };
}
async function access(db: D1Database, actor: CampaignActor | null, campaignId: string) {
  if (!actor) throw new CampaignServiceError("Sign in is required.", 401);
  return loadCampaignAccess(db, actor, campaignId);
}
async function writable(db: D1Database, actor: CampaignActor | null, campaignId: string) {
  const record = await access(db, actor, campaignId);
  requireActiveCampaign(record.campaign);
  if (!canManageCampaignContent(actor, record.campaign, record.membership)) {
    throw new CampaignServiceError("Only campaign GMs can edit session recaps.", 403);
  }
  return record.campaign.id;
}

export async function listCampaignSessionRecaps(
  db: D1Database, actor: CampaignActor | null, campaignId: string, pageValue: number,
): Promise<SessionRecapPage> {
  const { campaign, membership } = await access(db, actor, campaignId);
  const draftsVisible = canManageCampaignContent(actor!, campaign, membership);
  const filter = draftsVisible ? "" : " AND is_published = 1";
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 && pageValue <= 100000 ? pageValue : 1;
  const count = await db.prepare("SELECT COUNT(*) AS total FROM campaign_session_recaps WHERE campaign_id = ?" + filter)
    .bind(campaign.id).first<{ total: number }>();
  const total = Number(count?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / SESSION_RECAP_PAGE_SIZE));
  const normalizedPage = Math.min(page, totalPages);
  const rows = await db.prepare(`SELECT ${recapColumns} FROM campaign_session_recaps
    WHERE campaign_id = ? ${filter} ${order} LIMIT ? OFFSET ?`)
    .bind(campaign.id, SESSION_RECAP_PAGE_SIZE, (normalizedPage - 1) * SESSION_RECAP_PAGE_SIZE).all<RecapRow>();
  return { recaps: rows.results.map(asRecap), page: normalizedPage, totalPages, total };
}

export async function getCampaignSessionRecap(
  db: D1Database, actor: CampaignActor | null, campaignId: string, recapId: unknown,
): Promise<CampaignSessionRecap> {
  const { campaign, membership } = await access(db, actor, campaignId);
  const row = await db.prepare(`SELECT ${recapColumns} FROM campaign_session_recaps WHERE campaign_id = ? AND id = ?`)
    .bind(campaign.id, validId(recapId)).first<RecapRow>();
  if (!row || (row.isPublished !== 1 && !canManageCampaignContent(actor!, campaign, membership)))
    throw new CampaignServiceError("Session recap not found.", 404);
  return asRecap(row);
}

export async function sessionRecapArchive(
  db: D1Database, actor: CampaignActor | null, campaignId: string,
): Promise<SessionRecapArchive> {
  const { campaign } = await access(db, actor, campaignId);
  // Small date/title index for the campaign selector; only the latest full Markdown
  // is fetched until a player asks for an older recap.
  const dates = await db.prepare(`SELECT id, session_date AS date, title FROM campaign_session_recaps
    WHERE campaign_id = ? AND is_published = 1 ${order}`).bind(campaign.id).all<SessionRecapSummary>();
  const latest = dates.results[0]
    ? await getCampaignSessionRecap(db, actor, campaignId, dates.results[0].id) : null;
  return { dates: dates.results, latest };
}

export async function createCampaignSessionRecap(
  db: D1Database, actor: CampaignActor | null, campaignId: string,
  input: { date?: unknown; title?: unknown; content?: unknown; draftOnly?: unknown }, now = new Date().toISOString(),
): Promise<CampaignSessionRecap> {
  const internalId = await writable(db, actor, campaignId);
  if (input.draftOnly !== undefined && input.draftOnly !== true)
    throw new CampaignServiceError("Invalid private recap preference.", 422);
  const isPublished = input.draftOnly !== true;
  const draft = validateDraft(isPublished ? input : {...input, content: PRIVATE_RECAP_DRAFT_CONTENT});
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO campaign_session_recaps
    (id, campaign_id, session_date, title, content, is_published, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, internalId, draft.date, draft.title, draft.content, isPublished ? 1 : 0, now, now).run();
  return { id, ...draft, isPublished, createdAt: now, updatedAt: now };
}

export async function updateCampaignSessionRecap(
  db: D1Database, actor: CampaignActor | null, campaignId: string,
  input: { id?: unknown; date?: unknown; title?: unknown; content?: unknown; updatedAt?: unknown; publish?: unknown },
  now = new Date().toISOString(),
): Promise<CampaignSessionRecap> {
  const internalId = await writable(db, actor, campaignId);
  const id = validId(input.id);
  if (typeof input.updatedAt !== "string" || !input.updatedAt) {
    throw new CampaignServiceError("Reload the recap before saving changes.", 422);
  }
  if (input.publish !== undefined && typeof input.publish !== "boolean") {
    throw new CampaignServiceError("Invalid recap publication preference.", 422);
  }
  const original = await db.prepare(
    "SELECT is_published AS isPublished FROM campaign_session_recaps WHERE campaign_id = ? AND id = ?",
  ).bind(internalId, id).first<{isPublished: number}>();
  if (!original) throw new CampaignServiceError("Session recap not found.", 404);
  // A published recap must never be silently unpublished. An unpublished recap
  // stays private unless its GM explicitly requests publication.
  if (original.isPublished === 1 && input.publish === false) {
    throw new CampaignServiceError("A published recap cannot be saved as a private draft.", 422);
  }
  const isPublished = original.isPublished === 1 || input.publish === true;
  const content = !isPublished && (!input.content || typeof input.content !== "string" || !input.content.trim())
    ? PRIVATE_RECAP_DRAFT_CONTENT : input.content;
  const draft = validateDraft({...input, content});
  if (isPublished && draft.content === PRIVATE_RECAP_DRAFT_CONTENT) {
    throw new CampaignServiceError("Write and review a recap before publishing.", 422);
  }
  const result = await db.prepare(`UPDATE campaign_session_recaps
    SET session_date = ?, title = ?, content = ?, is_published = ?, updated_at = ?
    WHERE id = ? AND campaign_id = ? AND updated_at = ?`)
    .bind(draft.date, draft.title, draft.content, isPublished ? 1 : 0,
      now, id, internalId, input.updatedAt).run();
  if (result.meta.changes !== 1) {
    const existing = await db.prepare("SELECT id FROM campaign_session_recaps WHERE campaign_id = ? AND id = ?")
      .bind(internalId, id).first<{ id: string }>();
    throw new CampaignServiceError(existing
      ? "This recap was edited elsewhere. Reload it before saving." : "Session recap not found.", existing ? 409 : 404);
  }
  // Only published recaps can be in the Journal. Preserve its independently
  // managed Markdown and visibility while keeping its date/title synchronized.
  if (isPublished) {
    const marker="<!-- twe-session-recap:"+id+" -->";
    await db.prepare(`UPDATE campaign_journal_entries SET title=?,updated_at=?
      WHERE campaign_id=? AND kind='page' AND instr(content,?)>0`)
      .bind(draft.date.slice(2)+" — "+draft.title,now,internalId,marker).run();
  }
  return { id, ...draft, isPublished,
    createdAt: (await getCampaignSessionRecap(db, actor, campaignId, id)).createdAt, updatedAt: now };
}
