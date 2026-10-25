import { journalSecretMarkersBalanced } from "./journal-editor-format.ts";
export type PendingJournalAttachment = { file: File; uploadedUrl?: string; entryId?: string };
export type JournalEditorDraft = { title: string; content: string; visibility: string; icon: string };
type SavedEntry = JournalEditorDraft & { id: string; kind: string; parentId: string | null };

export async function uploadJournalEditorFile(endpoint: string, entryId: string, file: File, request: typeof fetch = fetch): Promise<string> {
  const body = new FormData(); body.set("entryId", entryId); body.set("file", file);
  const response = await request(endpoint + "/files", { method: "POST", body });
  const result = await response.json() as { id?: string; error?: string };
  if (!response.ok || !result.id) throw new Error(result.error || "The attachment could not be uploaded.");
  return endpoint + "/files/" + encodeURIComponent(result.id);
}

/** New pages with pending files remain GM-only until every file is attached. */
export async function saveJournalEditorDraft({ endpoint, id, kind, parentId, draft, attachments, onCreated, request = fetch }: {
  endpoint: string; id: string; kind: string; parentId: string | null; draft: JournalEditorDraft;
  attachments: Map<string, PendingJournalAttachment>; onCreated: (entry: SavedEntry) => void; request?: typeof fetch;
}): Promise<SavedEntry> {
  if(!journalSecretMarkersBalanced(draft.content))throw new Error("A GM-only block has an unmatched secret marker. Remove it or repair it in Advanced Markdown before saving.");
  const pending = [...attachments.entries()].filter(([url]) => draft.content.includes(url));
  if(pending.length&&kind!=="page")throw new Error("Folders cannot contain attachments.");
  let targetId = id;
  const write = async (method: string, body: object) => {
    const response = await request(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { entry?: SavedEntry; error?: string };
    if (!response.ok || !result.entry) throw new Error(result.error || "The page could not be saved.");
    return result.entry;
  };
  if (!targetId && pending.length) {
    let staging = draft.content;
    for (const [url] of pending) staging = staging.split(url).join("journal-attachment-pending");
    const created = await write("POST", { kind, parentId, ...draft, visibility: "gm", content: staging });
    targetId = created.id; onCreated(created);
  }
  let content = draft.content;
  for (const [localUrl, attachment] of pending) {
    if (!attachment.uploadedUrl || attachment.entryId !== targetId) {
      attachment.uploadedUrl = await uploadJournalEditorFile(endpoint, targetId, attachment.file, request);
      attachment.entryId = targetId;
    }
    content = content.split(localUrl).join(attachment.uploadedUrl);
  }
  if (/\]\(blob:/u.test(content)) throw new Error("An attachment is unavailable. Remove it and attach it again.");
  return write(targetId ? "PATCH" : "POST", targetId ? { id: targetId, ...draft, content } : { kind, parentId, ...draft, content });
}
