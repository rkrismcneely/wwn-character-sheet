/** Resolve a Markdown export link inside its imported vault; never escape the root. */
export function relativeJournalPath(notePath:string,target:string):string|null{
 let decoded:string;
 try{decoded=decodeURIComponent(target);}catch{return null;}
 if(!decoded||decoded.startsWith("/")||decoded.includes("\\")||/^[a-z][a-z0-9+.-]*:/iu.test(decoded)||/[\u0000-\u001f\u007f]/u.test(decoded))return null;
 const result=notePath.split("/").slice(0,-1);
 for(const part of decoded.split("/")){
  if(!part||part===".")continue;
  if(part===".."){if(!result.length)return null;result.pop();}
  else result.push(part);
 }
 return result.join("/");
}

/** Prefer note-relative links, then bare vault-root links used by LegendKeeper. */
export function journalLinkPaths(notePath:string,target:string):string[]{
 const relative=relativeJournalPath(notePath,target);
 if(!relative)return [];
 const decoded=decodeURIComponent(target);
 const root=/^\.{1,2}(?:\/|$)/u.test(decoded)?null:relativeJournalPath("",target);
 return [...new Set([relative,...(root?[root]:[])])];
}
