import type { VaultAsset } from "./journal-zip.ts";

function normalize(path:string){return path.replace(/^\.\//u,"").replace(/\\/gu,"/");}
function findAsset(target:string,notePath:string,assets:readonly VaultAsset[]):VaultAsset|undefined{
 const decoded=normalize(decodeURIComponent(target.split("#")[0].split("?")[0]));
 // Import only safe vault-relative paths; remote URLs must never resolve to local files.
 if(!decoded||decoded.startsWith("/")||/^[a-z][a-z0-9+.-]*:/iu.test(decoded))return;
 const segments=decoded.split("/");
 if(segments.some(segment=>segment===".."||segment===""))return;
 const clean=segments.filter(segment=>segment!==".").join("/");
 if(!clean)return;
 const folder=notePath.split("/").slice(0,-1).join("/");
 const relative=folder?folder+"/"+clean:clean;
 const exact=assets.find(asset=>asset.path.toLowerCase()===relative.toLowerCase())
   ??assets.find(asset=>asset.path.toLowerCase()===clean.toLowerCase());
 if(exact)return exact;
 const basename=clean.split("/").at(-1)?.toLowerCase();
 const matches=assets.filter(asset=>asset.filename.toLowerCase()===basename);
 return matches.length===1?matches[0]:undefined;
}

/** Preserve fenced and inline Markdown code verbatim during attachment conversion. */
function outsideMarkdownCode(markdown:string, transform:(text:string)=>string):string{
 let fence:{character:string;length:number}|null=null;
 return markdown.split(/(\r?\n)/u).map(line=>{
  if(line==="\n"||line==="\r\n")return line;
  const opening=/^ {0,3}(`{3,}|~{3,})/u.exec(line);
  if(fence){
   if(opening&&opening[1][0]===fence.character&&opening[1].length>=fence.length
     &&line.slice(opening[0].length).trim()==="")fence=null;
   return line;
  }
  if(opening){fence={character:opening[1][0],length:opening[1].length};return line;}
  let output="",cursor=0;
  while(cursor<line.length){
   const start=line.indexOf("`",cursor);
   if(start<0){output+=transform(line.slice(cursor));break;}
   let endRun=start+1;
   while(line[endRun]==="`")endRun++;
   const marker=line.slice(start,endRun);
   let closing=line.indexOf(marker,endRun);
   while(closing>=0&&(line[closing+marker.length]==="`"||line[closing-1]==="`"))
    closing=line.indexOf(marker,closing+marker.length);
   if(closing<0){output+=transform(line.slice(cursor,endRun));cursor=endRun;continue;}
   output+=transform(line.slice(cursor,start))+line.slice(start,closing+marker.length);
   cursor=closing+marker.length;
  }
  return output;
 }).join("");
}

export function referencedJournalAssets(markdown:string,notePath:string,assets:readonly VaultAsset[]){
 const paths=new Map<string,VaultAsset>();
 outsideMarkdownCode(markdown,text=>{for(const match of text.matchAll(/!?\[\[([^\]\n]+)\]\]|!?\[[^\]\n]*\]\(([^)\n]+)\)/gu)){
  const target=(match[1]?.split("|",1)[0]??match[2]??"").trim();
  let asset:VaultAsset|undefined;
  try{asset=findAsset(target,notePath,assets);}catch{continue;}
  if(asset)paths.set(asset.path,asset);
 }return text;});
 return [...paths.values()];
}
export function replaceJournalAssetLinks(markdown:string,notePath:string,assets:readonly VaultAsset[],urls:ReadonlyMap<string,string>):string{
 return outsideMarkdownCode(markdown,text=>text.replace(/!?\[\[([^\]\n]+)\]\]|(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/gu,(whole,wiki:string|undefined,bang:string|undefined,label:string|undefined,target:string|undefined)=>{
  const path=(wiki?.split("|",1)[0]??target??"").trim();
  let asset:VaultAsset|undefined;
  try{asset=findAsset(path,notePath,assets);}catch{return whole;}
  if(!asset)return whole;
  const url=urls.get(asset.path);
  if(!url)return whole;
  // Obsidian image embeds use numeric aliases for dimensions, not link labels.
  const alias=wiki?.split("|",2)[1];
  const display=(alias&&/^\d+(?:x\d+)?$/iu.test(alias)?asset.filename:(alias??label??asset.filename)).replace(/[\[\]]/gu,"");
  return (asset.mime.startsWith("image/")?"!":"")+"["+display+"]("+url+")";
 }));
}
