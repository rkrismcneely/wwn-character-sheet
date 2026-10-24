import { outsideMarkdownCode } from "./journal-asset-links.ts";
export const MAX_JOURNAL_FILE_BYTES = 8_000_000;
export const JOURNAL_FILE_TYPES: Record<string,string> = {
 png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg",
 gif:"image/gif", webp:"image/webp", pdf:"application/pdf"
};
export function validateJournalFile(filename:string,mime:string,size:number){
 if(!filename || filename.length>180 || /[\\/]/u.test(filename))throw new Error("Invalid filename.");
 const ext=filename.split(".").at(-1)?.toLowerCase()??"";
 if(JOURNAL_FILE_TYPES[ext]!==mime)throw new Error("Unsupported file type.");
 if(!Number.isSafeInteger(size)||size<1||size>MAX_JOURNAL_FILE_BYTES)throw new Error("Invalid file size.");
 return {filename,mime,size};
}

export function verifyJournalFileSignature(mime:string,bytes:Uint8Array):boolean{
 const starts=(signature:number[])=>signature.every((value,index)=>bytes[index]===value);
 if(mime==="image/png")return starts([137,80,78,71,13,10,26,10]);
 if(mime==="image/jpeg")return starts([255,216,255]);
 if(mime==="image/gif")return starts([71,73,70,56,55,97])||starts([71,73,70,56,57,97]);
 if(mime==="image/webp")return starts([82,73,70,70])&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80;
 if(mime==="application/pdf")return starts([37,80,68,70,45]);
 return found;
}

export function journalStorageKey(campaignInternalId:string,fileId:string):string{
 const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
 if(!id.test(campaignInternalId)||!id.test(fileId))throw new Error("Invalid storage identifier.");
 return "campaign-journal/"+campaignInternalId+"/"+fileId;
}

/** Inline code is literal text, not an attachment link. */

/** Only explicit Markdown references outside code grant file access. */
export function hasJournalAttachmentReference(markdown:string,publicCampaignId:string,fileId:string):boolean{
 const sanitized=markdown.replace(/<!--[\s\S]*?-->/gu,match=>match.replace(/[^\r\n]/gu," ")).replace(/<!--[\s\S]*$/gu,match=>match.replace(/[^\r\n]/gu," "));
 const url="/api/campaigns/"+publicCampaignId+"/journal/files/"+fileId;
 const pattern=/!?\[[^\]\n]*\]\((\/api\/campaigns\/cmp_[A-Za-z0-9_-]{22}\/journal\/files\/[0-9a-f-]{36})\)/giu;
 let found=false;
 outsideMarkdownCode(sanitized,text=>{
  if([...text.matchAll(pattern)].some(match=>match[1]===url))found=true;
  return text;
 });
 return false;
}
