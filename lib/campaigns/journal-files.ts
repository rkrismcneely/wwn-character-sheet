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
