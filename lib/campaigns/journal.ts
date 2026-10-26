import { journalPageIcon, validateJournalPageIcon } from "./journal-icons.ts";
import { journalAttachmentWriteGuard } from "./journal-write-guard.ts";
import { safeVaultPath } from "./journal-import.ts";
import { canManageCampaignContent } from "./authorization.ts";
import { CampaignServiceError, loadCampaignAccess } from "./service.ts";
import type { CampaignActor } from "./types.ts";

export type JournalEntry = {
  id: string; parentId: string | null; kind: "folder" | "page"; title: string;
  content: string; icon: string; visibility: "gm" | "players" | "selected";
  createdAt: string; updatedAt: string; sortOrder?: number | null; sourcePath?: string | null; source?: string | null;
};
type Row = JournalEntry;
const columns = "j.id, j.parent_id AS parentId, j.kind, j.title, j.content, j.icon, j.visibility, j.created_at AS createdAt, j.updated_at AS updatedAt, j.source_path AS sourcePath, j.source AS source, j.sort_order AS sortOrder";
export function redactJournalSecrets(markdown:string):string {
 let depth=0,cursor=0,output="";
 for(const marker of markdown.matchAll(/<!--\s*gm-only:(start|end)\s*-->/giu)){
  if(depth===0)output+=markdown.slice(cursor,marker.index);
  if(marker[1].toLowerCase()==="start")depth++;
  else if(depth>0)depth--;
  cursor=marker.index!+marker[0].length;
 }
 return output+(depth===0?markdown.slice(cursor):"");
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
/** Atomic content-only update used by attachment imports to detect concurrent GM edits. */
export const atomicJournalMoveSQL =
 "WITH RECURSIVE ancestors(id,parent_id) AS (SELECT id,parent_id FROM campaign_journal_entries WHERE campaign_id=? AND id=? AND kind='folder' UNION SELECT p.id,p.parent_id FROM campaign_journal_entries p JOIN ancestors a ON p.id=a.parent_id WHERE p.campaign_id=?) UPDATE campaign_journal_entries SET parent_id=?,updated_at=? WHERE campaign_id=? AND id=? AND NOT EXISTS (SELECT 1 FROM ancestors WHERE id=?) AND (? IS NULL OR EXISTS (SELECT 1 FROM ancestors WHERE id=?))";

export const conditionalJournalContentUpdateSQL =
 "UPDATE campaign_journal_entries SET content = ?, updated_at = ? WHERE campaign_id = ? AND id = ? AND kind = 'page' AND content = ? AND updated_at = ?";

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
function cleanPageIcon(value:unknown):string{
 try{return validateJournalPageIcon(value);}
 catch{throw new CampaignServiceError("Invalid journal page icon.",422);}
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
const starterJournalFolders = ["Locations", "NPCs", "Items", "Stores", "Quests", "Session Notes"] as const;

/** Bootstrap only truly empty journals, so edited, moved, or deleted folders never regenerate. */
async function initializeEmptyJournal(db: D1Database, campaignId: string) {
 const now = new Date().toISOString();
 // The INSERT ... SELECT guard keeps repeated reads idempotent.
 for (const title of starterJournalFolders) {
  await db.prepare(`INSERT INTO campaign_journal_entries
    (id,campaign_id,parent_id,kind,title,content,icon,visibility,created_at,updated_at)
    SELECT ?, ?, NULL, 'folder', ?, '', 'file-text', 'gm', ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM campaign_journal_entries WHERE campaign_id = ?)`)
    .bind(crypto.randomUUID(),campaignId,title,now,now,campaignId).run();
  // Once the first folder exists, subsequent inserts must use a separate condition.
  if (title === starterJournalFolders[0]) {
   for (const remaining of starterJournalFolders.slice(1)) {
    await db.prepare(`INSERT INTO campaign_journal_entries
     (id,campaign_id,parent_id,kind,title,content,icon,visibility,created_at,updated_at)
     SELECT ?, ?, NULL, 'folder', ?, '', 'file-text', 'gm', ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM campaign_journal_entries WHERE campaign_id = ? AND kind = 'folder' AND title = ?)`)
     .bind(crypto.randomUUID(),campaignId,remaining,now,now,campaignId,remaining).run();
   }
   break;
  }
 }
}

export async function listJournal(db: D1Database, actor: CampaignActor | null, campaignId: string, preview = false) {
  const ctx = await context(db, actor, campaignId);
  const gmView = ctx.isGM && !preview;
  if (gmView) await initializeEmptyJournal(db, ctx.campaignId);
  // Do not fetch restricted content into the player response. Selected readers are
  // evaluated against the authenticated user, never an ID supplied by the client.
  // Feature-detect the additive sort column so unmigrated databases can still read Journal entries.
  const schema=await db.prepare("SELECT name FROM pragma_table_info('campaign_journal_entries') WHERE name='sort_order'").first<{name:string}>();
  const hasOrder=Boolean(schema);
  const selectedColumns=hasOrder?columns:columns.replace(", j.sort_order AS sortOrder","");
  const orderClause=hasOrder
   ? "ORDER BY j.parent_id, j.sort_order IS NULL, j.sort_order, j.kind ASC, j.title COLLATE NOCASE ASC"
   : "ORDER BY j.kind ASC, j.title COLLATE NOCASE ASC";
  const rows=await db.prepare(`SELECT ${selectedColumns} FROM campaign_journal_entries j
    WHERE j.campaign_id = ? AND (? = 1 OR j.visibility = 'players'
      OR (? = 0 AND j.visibility = 'selected' AND EXISTS (
        SELECT 1 FROM campaign_journal_readers r JOIN campaign_members m ON m.user_id = r.user_id AND m.campaign_id = j.campaign_id WHERE r.entry_id = j.id AND r.user_id = ?
      ))) ${orderClause}`)
    .bind(ctx.campaignId, gmView ? 1 : 0, preview ? 1 : 0, actor!.userId).all<Row>();
  return { entries: visibleJournalEntries(rows.results).map(row=>gmView?row:{...row,content:redactJournalSecrets(row.content)}), canEdit: ctx.isGM && !preview, viewerId: actor!.userId };
}
export async function createJournalEntry(db: D1Database, actor: CampaignActor | null, campaignId: string,
  input: { parentId?: unknown; kind?: unknown; title?: unknown; content?: unknown; visibility?: unknown; icon?: unknown }) {
  const id = await requireGM(db, actor, campaignId);
  const kind = input.kind === "folder" ? "folder" : input.kind === "page" ? "page" : null;
  if (!kind) throw new CampaignServiceError("Invalid entry type.", 422);
  const parentId = await getParent(db, id, input.parentId);
  const title = cleanTitle(input.title);
  const content = kind === "folder" ? "" : cleanContent(input.content ?? "");
  const visibility = cleanVisibility(input.visibility ?? "gm");
  const parent=parentId?await db.prepare("SELECT title FROM campaign_journal_entries WHERE id=? AND campaign_id=? AND kind='folder'").bind(parentId,id).first<{title:string}>():null;
  const folderIcons:Record<string,string>={locations:"map-pin",npcs:"user-round",items:"sword",stores:"warehouse",quests:"scroll-text","session notes":"calendar-days"};
  // Source-aware icon inference; keep NPC braces escaped as regex literals.
  const inferredIcon = /<!-- twe-store:cstore_[a-f0-9]{32} -->/u.test(content) ? "warehouse" :
    /\{\{twe-npc:(?:cnpc_[a-f0-9]{32}|[a-f0-9-]{36})\}\}/u.test(content) ? "user-round" :
    folderIcons[parent?.title.trim().toLowerCase()??""]??journalPageIcon(null);
  const icon = kind === "folder" ? "file-text" : input.icon === undefined ? inferredIcon : cleanPageIcon(input.icon);
  const entryId = crypto.randomUUID();
  const now = new Date().toISOString();
  const guard=journalAttachmentWriteGuard(content,campaignId,id);
  const result=await db.prepare(`INSERT INTO campaign_journal_entries
    (id, campaign_id, parent_id, kind, title, content, icon, visibility, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE 1=1${guard.sql}`)
    .bind(entryId, id, parentId, kind, title, content, icon, visibility, now, now,...guard.bindings).run();
  if(!result.meta.changes)throw new CampaignServiceError("An attachment is no longer available. Refresh before saving.",409);
  return { id: entryId, parentId, kind, title, content, icon, visibility, createdAt: now, updatedAt: now };
}
export async function updateJournalEntry(db: D1Database, actor: CampaignActor | null, campaignId: string,
  input: { id?: unknown; title?: unknown; content?: unknown; visibility?: unknown; expectedContent?: unknown; expectedUpdatedAt?: unknown; icon?: unknown }) {
  const id = await requireGM(db, actor, campaignId);
  if (typeof input.id !== "string" || !uuidPattern.test(input.id))
    throw new CampaignServiceError("Invalid journal entry.", 422);
  const old = await db.prepare(`SELECT ${columns} FROM campaign_journal_entries j WHERE j.campaign_id = ? AND j.id = ?`)
    .bind(id, input.id).first<Row>();
  if (!old) throw new CampaignServiceError("Journal entry not found.", 404);
  const title = input.title === undefined ? old.title : cleanTitle(input.title);
  const content = old.kind === "folder" ? "" : input.content === undefined ? old.content : cleanContent(input.content);
  const visibility = input.visibility === undefined ? old.visibility : cleanVisibility(input.visibility);
  const icon = old.kind === "folder" ? "file-text" : input.icon === undefined ? old.icon : cleanPageIcon(input.icon);
  const updatedAt = new Date().toISOString();
  const guard=journalAttachmentWriteGuard(content,campaignId,id);
  if(input.expectedContent!==undefined){
    if(typeof input.expectedContent!=="string"||input.expectedContent.length>100000)
      throw new CampaignServiceError("Invalid expected journal content.",422);
    if(typeof input.expectedUpdatedAt!=="string"||input.expectedUpdatedAt.length>40||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(input.expectedUpdatedAt))
      throw new CampaignServiceError("Invalid expected journal version.",422);
    // Attachment imports only change content; never restore stale title or visibility.
    if(input.title!==undefined||input.visibility!==undefined||input.icon!==undefined)
      throw new CampaignServiceError("Conditional journal updates may only change content.",422);
    const result=await db.prepare(conditionalJournalContentUpdateSQL+guard.sql)
      .bind(content,updatedAt,id,old.id,input.expectedContent,input.expectedUpdatedAt,...guard.bindings).run();
    if(!result.meta.changes)throw new CampaignServiceError("Journal page changed since it was loaded. Refresh before retrying.",409);
  }else{
    const result=await db.prepare(`UPDATE campaign_journal_entries SET title = ?, content = ?, icon = ?, visibility = ?, updated_at = ?
      WHERE campaign_id = ? AND id = ?${guard.sql}`).bind(title,content,icon,visibility,updatedAt,id,old.id,...guard.bindings).run();
    if(!result.meta.changes)throw new CampaignServiceError("An attachment is no longer available. Refresh before saving.",409);
  }
  return { ...old, title, content, icon, visibility, updatedAt };
}

/** Reparent a Journal item, preserving its content and preventing cycles. */
/** Move multiple pages in a single D1 statement; folders are deliberately excluded. */
export async function moveJournalPages(db:D1Database,actor:CampaignActor|null,campaignId:string,input:{ids?:unknown;parentId?:unknown}){
 const campaign=await requireGM(db,actor,campaignId);
 const ids=input.ids;
 if(!Array.isArray(ids)||ids.length<1||ids.length>200||ids.some(id=>typeof id!=="string"||!uuidPattern.test(id))||new Set(ids).size!==ids.length)
  throw new CampaignServiceError("Select between 1 and 200 distinct Journal pages.",422);
 const parent=await getParent(db,campaign,input.parentId);
 const marks=ids.map(()=>"?").join(",");
 const rows=await db.prepare(`SELECT id,kind,parent_id AS parentId FROM campaign_journal_entries WHERE campaign_id=? AND id IN (${marks})`)
  .bind(campaign,...ids).all<{id:string;kind:string;parentId:string|null}>();
 if(rows.results.length!==ids.length||rows.results.some(row=>row.kind!=="page"))
  throw new CampaignServiceError("Only existing Journal articles can be moved together.",422);
 const toMove=rows.results.filter(row=>row.parentId!==parent).map(row=>row.id);
 if(!toMove.length)return {ids:[],parentId:parent};
 const placeholders=toMove.map(()=>"?").join(",");
 const result=await db.prepare(`UPDATE campaign_journal_entries SET parent_id=?,updated_at=?
   WHERE campaign_id=? AND kind='page' AND id IN (${placeholders})
   AND (? IS NULL OR EXISTS(SELECT 1 FROM campaign_journal_entries p WHERE p.id=? AND p.campaign_id=? AND p.kind='folder'))`)
  .bind(parent,new Date().toISOString(),campaign,...toMove,parent,parent,campaign).run();
 if(result.meta.changes!==toMove.length)throw new CampaignServiceError("Journal changed during the move. Refresh and try again.",409);
 return {ids:toMove,parentId:parent};
}

export async function moveJournalEntry(db:D1Database,actor:CampaignActor|null,campaignId:string,input:{id?:unknown;parentId?:unknown}){
 const campaign=await requireGM(db,actor,campaignId);
 if(typeof input.id!=="string"||!uuidPattern.test(input.id))throw new CampaignServiceError("Invalid journal entry.",422);
 const entry=await db.prepare("SELECT id,parent_id AS parentId,kind FROM campaign_journal_entries WHERE campaign_id=? AND id=?").bind(campaign,input.id).first<{id:string;parentId:string|null;kind:string}>();
 if(!entry)throw new CampaignServiceError("Journal entry not found.",404);
 const parent=await getParent(db,campaign,input.parentId);
 if(parent===entry.id)throw new CampaignServiceError("A folder cannot contain itself.",422);
 let current=parent;
 const seen=new Set<string>([entry.id]);
 for(let i=0;current;i++){
  if(i>1000||seen.has(current))throw new CampaignServiceError("Circular folder move is not allowed.",422);
  seen.add(current);
  const row=await db.prepare("SELECT parent_id AS parentId FROM campaign_journal_entries WHERE campaign_id=? AND id=? AND kind='folder'").bind(campaign,current).first<{parentId:string|null}>();
  if(!row)throw new CampaignServiceError("Destination folder not found.",422);
  current=row.parentId;
 }
 if(entry.parentId===parent)return {id:entry.id,parentId:parent};
 const result=await db.prepare(atomicJournalMoveSQL)
 .bind(campaign,parent,campaign,parent,new Date().toISOString(),campaign,entry.id,entry.id,parent,parent).run();
 if(!result.meta.changes)throw new CampaignServiceError("Folder hierarchy changed. Refresh before moving.",409);
 return {id:entry.id,parentId:parent};
}


/** Persist explicit order for siblings without changing their folder or visibility. */
export async function reorderJournalEntry(db:D1Database,actor:CampaignActor|null,campaignId:string,input:{id?:unknown;beforeId?:unknown}){
 const campaign=await requireGM(db,actor,campaignId);
 if(typeof input.id!=="string"||!uuidPattern.test(input.id)||typeof input.beforeId!=="string"||!uuidPattern.test(input.beforeId))
  throw new CampaignServiceError("Invalid journal reorder request.",422);
 const source=await db.prepare("SELECT id,parent_id AS parentId FROM campaign_journal_entries WHERE campaign_id=? AND id=?").bind(campaign,input.id).first<{id:string;parentId:string|null}>();
 const before=await db.prepare("SELECT id,parent_id AS parentId FROM campaign_journal_entries WHERE campaign_id=? AND id=?").bind(campaign,input.beforeId).first<{id:string;parentId:string|null}>();
 if(!source||!before||source.parentId!==before.parentId)throw new CampaignServiceError("Items must be in the same folder.",422);
 const all=await db.prepare("SELECT id FROM campaign_journal_entries WHERE campaign_id=? AND parent_id IS ? ORDER BY sort_order IS NULL,sort_order,kind ASC,title COLLATE NOCASE ASC,id").bind(campaign,source.parentId).all<{id:string}>();
 const ids=all.results.map(row=>row.id).filter(id=>id!==source.id);
 const index=ids.indexOf(before.id);
 if(index<0)throw new CampaignServiceError("Reorder target no longer exists.",409);
 ids.splice(index,0,source.id);
 const now=new Date().toISOString();
 await db.batch(ids.map((id,order)=>db.prepare("UPDATE campaign_journal_entries SET sort_order=?,updated_at=? WHERE campaign_id=? AND id=? AND parent_id IS ?").bind(order,now,campaign,id,source.parentId)));
 return {ids,parentId:source.parentId};
}

/** GM-authorized bulk folder visibility. Never changes selected-reader grants or page content. */
export async function setJournalFolderVisibility(db:D1Database,actor:CampaignActor|null,campaignId:string,input:{id?:unknown;visibility?:unknown;includeContents?:unknown}){
 const campaign=await requireGM(db,actor,campaignId);
 if(typeof input.id!=="string"||!uuidPattern.test(input.id)||typeof input.includeContents!=="boolean")throw new CampaignServiceError("Invalid folder operation.",422);
 const visibility=cleanVisibility(input.visibility);
 if(visibility==="selected")throw new CampaignServiceError("Choose individual players for selected visibility.",422);
 const folder=await db.prepare("SELECT id FROM campaign_journal_entries WHERE campaign_id=? AND id=? AND kind='folder'").bind(campaign,input.id).first();
 if(!folder)throw new CampaignServiceError("Folder not found.",404);
 const recursive=input.includeContents;
 const rows=recursive
  ? await db.prepare(`WITH RECURSIVE tree(id) AS (
    SELECT id FROM campaign_journal_entries WHERE campaign_id=? AND id=? AND kind='folder'
    UNION ALL
    SELECT child.id FROM campaign_journal_entries child JOIN tree parent ON child.parent_id=parent.id WHERE child.campaign_id=?
   ) SELECT id FROM tree LIMIT 5001`).bind(campaign,input.id,campaign).all<{id:string}>()
  : {results:[{id:input.id}]};
 if(rows.results.length>5000)throw new CampaignServiceError("Folder contains too many items to update at once.",422);
 const now=new Date().toISOString();
 const statements=rows.results.map(row=>db.prepare("UPDATE campaign_journal_entries SET visibility=?,updated_at=? WHERE campaign_id=? AND id=?").bind(visibility,now,campaign,row.id));
 if(statements.length)await db.batch(statements);
 return {updated:statements.length,visibility};
}

export async function setJournalReaders(db:D1Database,actor:CampaignActor|null,campaignId:string,entryId:string,userIds:string[]){
 const campaign=await requireGM(db,actor,campaignId);
 if(!uuidPattern.test(entryId)||!Array.isArray(userIds)||userIds.length>100||userIds.some(id=>typeof id!=="string"||id.length<1||id.length>128))
   throw new CampaignServiceError("Invalid readers.",422);
 const entry=await db.prepare("SELECT id FROM campaign_journal_entries WHERE campaign_id=? AND id=?").bind(campaign,entryId).first();
 if(!entry)throw new CampaignServiceError("Journal entry not found.",404);
 const unique=[...new Set(userIds)];
 for(const userId of unique){
   const member=await db.prepare("SELECT user_id FROM campaign_members WHERE campaign_id=? AND user_id=? AND role='player'").bind(campaign,userId).first();
   if(!member)throw new CampaignServiceError("Reader must be a campaign player.",422);
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
  if(typeof note.path!=="string"||!/\.md$/iu.test(note.path)||safeVaultPath(note.path)!==note.path||seen.has(note.path.toLowerCase()))
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
 for(const note of notes){
  if(paths.has(note.path.toLowerCase())){skipped++;continue;}
  const guard=journalAttachmentWriteGuard(note.markdown,campaignId,campaign);
  statements.push(db.prepare("INSERT INTO campaign_journal_entries (id,campaign_id,parent_id,kind,title,content,visibility,source,source_path,created_at,updated_at) SELECT ?,?,?,'page',?,?,'gm',?,?,?,? WHERE 1=1"+guard.sql)
   .bind(crypto.randomUUID(),campaign,folderIds.get(note.folder.toLowerCase())??null,note.title,note.markdown,source,note.path,now,now,...guard.bindings));
 }
 for(let i=0;i<statements.length;i+=50){
  const results=await db.batch(statements.slice(i,i+50));
  if(results.some(result=>!result.meta.changes))throw new CampaignServiceError("An attachment is no longer available. Refresh before retrying import.",409);
 }
 return {created:statements.length-foldersCreated,foldersCreated,skipped};
}

/** Resolve a page through the same server-side visibility rules used by journal listings. */
export async function requireReadableJournalPage(db:D1Database,actor:CampaignActor|null,campaignId:string,entryId:string){
 if(!uuidPattern.test(entryId))throw new CampaignServiceError("Journal page not found.",404);
 const journal=await listJournal(db,actor,campaignId);
 const page=journal.entries.find(entry=>entry.id===entryId&&entry.kind==="page");
 if(!page)throw new CampaignServiceError("Journal page not found.",404);
 return page;
}

/** Delete a page or folder with its descendants; attachment metadata is cascaded by D1. */
export async function deleteJournalEntry(db:D1Database,actor:CampaignActor|null,campaignId:string,input:{id?:unknown}){
 const campaign=await requireGM(db,actor,campaignId);
 if(typeof input.id!=="string"||!uuidPattern.test(input.id))throw new CampaignServiceError("Invalid journal entry.",422);
 const row=await db.prepare("SELECT id FROM campaign_journal_entries WHERE campaign_id=? AND id=?").bind(campaign,input.id).first();
 if(!row)throw new CampaignServiceError("Journal entry not found.",404);
 const result=await db.prepare(`WITH RECURSIVE descendants(id) AS (
   SELECT id FROM campaign_journal_entries WHERE campaign_id=? AND id=?
   UNION SELECT child.id FROM campaign_journal_entries child JOIN descendants d ON child.parent_id=d.id WHERE child.campaign_id=?
 ) DELETE FROM campaign_journal_entries WHERE campaign_id=? AND id IN (SELECT id FROM descendants)`)
 .bind(campaign,input.id,campaign,campaign).run();
 return {deleted:result.meta.changes??0};
}

/** Deep-copy a folder tree (or single page), keeping the original unchanged. */
export async function duplicateJournalEntry(db:D1Database,actor:CampaignActor|null,campaignId:string,input:{id?:unknown}){
 const campaign=await requireGM(db,actor,campaignId);
 if(typeof input.id!=="string"||!uuidPattern.test(input.id))throw new CampaignServiceError("Invalid journal entry.",422);
 const result=await db.prepare(`WITH RECURSIVE descendants(id,depth) AS (
    SELECT id,0 FROM campaign_journal_entries WHERE campaign_id=? AND id=?
    UNION ALL SELECT child.id,descendants.depth+1 FROM campaign_journal_entries child JOIN descendants ON child.parent_id=descendants.id
    WHERE child.campaign_id=? AND descendants.depth<50
  ) SELECT j.id, j.parent_id AS parentId, j.kind, j.title, j.content, j.icon, j.visibility, j.sort_order AS sortOrder
  FROM descendants d JOIN campaign_journal_entries j ON j.campaign_id=? AND j.id=d.id
  ORDER BY d.depth,j.sort_order,j.title COLLATE NOCASE`)
  .bind(campaign,input.id,campaign,campaign).all<Pick<Row,"id"|"parentId"|"kind"|"title"|"content"|"icon"|"visibility"|"sortOrder">>();
 const entries=result.results;
 if(!entries.length)throw new CampaignServiceError("Journal entry not found.",404);
 if(entries.length>500)throw new CampaignServiceError("Folder is too large to duplicate in one operation.",422);
 const ids=new Map(entries.map(entry=>[entry.id,crypto.randomUUID()]));
 const now=new Date().toISOString();
 const statements=entries.map((entry,index)=>db.prepare(`INSERT INTO campaign_journal_entries
 (id,campaign_id,parent_id,kind,title,content,icon,visibility,created_at,updated_at)
 VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(ids.get(entry.id),campaign,index===0?entry.parentId:ids.get(entry.parentId??"")??null,
 entry.kind,index===0?entry.title+" (copy)":entry.title,entry.content,entry.icon,entry.visibility,now,now));
 await db.batch(statements);
 return {id:ids.get(entries[0].id),count:entries.length};
}
