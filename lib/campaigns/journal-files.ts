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
 return false;
}
