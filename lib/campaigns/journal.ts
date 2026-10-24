import { safeVaultPath } from "./journal-import.ts";
import { canManageCampaignContent } from "./authorization.ts";
import { CampaignServiceError, loadCampaignAccess } from "./service.ts";
import type { CampaignActor } from "./types.ts";

export type JournalEntry = {
  id: string; parentId: string | null; kind: "folder" | "page"; title: string;
  content: string; visibility: "gm" | "players" | "selected";
  createdAt: string; updatedAt: string; sourcePath?: string | null; source?: string | null;
};
type Row = JournalEntry;
const columns = "j.id, j.parent_id AS parentId, j.kind, j.title, j.content, j.visibility, j.created_at AS createdAt, j.updated_at AS updatedAt, j.source_path AS sourcePath, j.source AS source";
export function redactJournalSecrets(markdown:string):string {
 return markdown.replace(/<!--\s*gm-only:start\s*-->[\s\S]*?<!--\s*gm-only:end\s*-->/giu,"").replace(/<!--\s*gm-only:start\s*-->[\s\S]*$/giu,"");
}
export function visibleJournalEntries<T extends {id:string;parentId:string|null;kind:string}>(rows:T[]):T[] {
 const byId=new Map(rows.map(row=>[row.id,row]));
 return rows.filter(row=>{
  const seen=new Set<string>([row.id]);
  let parent=row.parentId;
  while(parent){
   if(seen.has(parent))return false;
   seen.add(parent);
   const folder=byId.get(parent);
   if(!folder||folder.kind!=="folder")return false;
   parent=folder.parentId;
  }
  return true;
 });
}
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
      OR (? = 0 AND j.visibility = 'selected' AND EXISTS (
        SELECT 1 FROM campaign_journal_readers r JOIN campaign_members m ON m.user_id = r.user_id AND m.campaign_id = j.campaign_id WHERE r.entry_id = j.id AND r.user_id = ?
      )))
    ORDER BY j.kind ASC, j.title COLLATE NOCASE ASC`)
    .bind(ctx.campaignId, gmView ? 1 : 0, preview ? 1 : 0, actor!.userId).all<Row>();
  return { entries: visibleJournalEntries(rows.results).map(row=>gmView?row:{...row,content:redactJournalSecrets(row.content)}), canEdit: ctx.isGM && !preview };
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
 if(!uuidPattern.test(entryId)||!Array.isArray(userIds)||userIds.length>100||userIds.some(id=>typeof id!=="string"||id.length<1||id.length>128))
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

export async function journalReaderOptions(db:D1Database,actor:CampaignActor|null,campaignId:string,entryId:string){
 const id=await requireGM(db,actor,campaignId);
 if(!uuidPattern.test(entryId))throw new CampaignServiceError("Invalid journal entry.",422);
 const entry=await db.prepare("SELECT id FROM campaign_journal_entries WHERE campaign_id=? AND id=?").bind(id,entryId).first();
 if(!entry)throw new CampaignServiceError("Journal entry not found.",404);
 const options=await db.prepare("SELECT m.user_id AS userId, u.name AS name, CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS selected FROM campaign_members m JOIN user u ON u.id=m.user_id LEFT JOIN campaign_journal_readers r ON r.entry_id=? AND r.user_id=m.user_id WHERE m.campaign_id=? AND m.role='player' ORDER BY u.name").bind(entryId,id).all<{userId:string;name:string;selected:number}>();
 return {readers:options.results};
}

export async function importJournalNotes(db:D1Database,actor:CampaignActor|null,campaignId:string,
 notes:{path:string;title:string;folder:string;markdown:string}[],confirm:boolean,source:"obsidian"|"legendkeeper"="obsidian"){
 const campaign=await requireGM(db,actor,campaignId);
 if(!confirm)throw new CampaignServiceError("Import confirmation is required.",422);
 if(!Array.isArray(notes)||notes.length>1000)throw new CampaignServiceError("Too many notes.",422);
 const existing=await db.prepare("SELECT source_path AS path FROM campaign_journal_entries WHERE campaign_id=? AND source=?").bind(campaign,source).all<{path:string}>();
 const paths=new Set(existing.results.filter(row=>typeof row.path==="string").map(row=>row.path.toLowerCase()));
 const seen=new Set<string>();
 for(const note of notes){
  if(typeof note.path!=="string"||!note.path.endsWith(".md")||safeVaultPath(note.path)!==note.path||seen.has(note.path.toLowerCase()))
   throw new CampaignServiceError("Invalid import path.",422);
  seen.add(note.path.toLowerCase());
  if(note.folder!==note.path.split("/").slice(0,-1).join("/"))throw new CampaignServiceError("Invalid import folder.",422);
  if(note.title!==note.path.split("/").at(-1)?.replace(/\.md$/iu,""))throw new CampaignServiceError("Invalid import title.",422);
  cleanTitle(note.title);cleanContent(note.markdown);
 }
 const now=new Date().toISOString();
 const statements=[];
 const folderIds=new Map<string,string>();
 const existingFolders=await db.prepare("SELECT id,source_path AS path FROM campaign_journal_entries WHERE campaign_id=? AND source=? AND kind='folder'").bind(campaign,source).all<{id:string;path:string}>();
 for(const folder of existingFolders.results)folderIds.set(folder.path.toLowerCase(),folder.id);
 const folders=new Set<string>();
 for(const note of notes){const parts=note.path.split("/");parts.pop();for(let i=1;i<=parts.length;i++)folders.add(parts.slice(0,i).join("/"));}
 for(const folder of [...folders].sort((a,b)=>a.split("/").length-b.split("/").length)){
  if(folderIds.has(folder.toLowerCase()))continue;
  const id=crypto.randomUUID();folderIds.set(folder.toLowerCase(),id);
  const parent=folder.includes("/")?folderIds.get(folder.slice(0,folder.lastIndexOf("/")).toLowerCase())??null:null;
  statements.push(db.prepare("INSERT INTO campaign_journal_entries (id,campaign_id,parent_id,kind,title,content,visibility,source,source_path,created_at,updated_at) VALUES (?,?,?,'folder',?,'','gm',?,?,?,?)").bind(id,campaign,parent,folder.split("/").at(-1),source,folder,now,now));
 }
 const foldersCreated=statements.length;
 let skipped=0;
 const createdPaths:string[]=[];
 for(const note of notes){
  if(paths.has(note.path.toLowerCase())){skipped++;continue;}
  createdPaths.push(note.path);
  statements.push(db.prepare("INSERT INTO campaign_journal_entries (id,campaign_id,parent_id,kind,title,content,visibility,source,source_path,created_at,updated_at) VALUES (?,?,?,'page',?,?,'gm',?,?,?,?)")
   .bind(crypto.randomUUID(),campaign,folderIds.get(note.folder.toLowerCase())??null,note.title,note.markdown,source,note.path,now,now));
 }
 for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));
 return {created:statements.length-foldersCreated,foldersCreated,skipped,createdPaths};
}

/** Resolve a page through the same server-side visibility rules used by journal listings. */
export async function requireReadableJournalPage(db:D1Database,actor:CampaignActor|null,campaignId:string,entryId:string){
 if(!uuidPattern.test(entryId))throw new CampaignServiceError("Journal page not found.",404);
 const journal=await listJournal(db,actor,campaignId);
 const page=journal.entries.find(entry=>entry.id===entryId&&entry.kind==="page");
 if(!page)throw new CampaignServiceError("Journal page not found.",404);
 return page;
}
