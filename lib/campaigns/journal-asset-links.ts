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
export function referencedJournalAssets(markdown:string,notePath:string,assets:readonly VaultAsset[]){
 const paths=new Map<string,VaultAsset>();
 for(const match of markdown.matchAll(/!\[\[([^\]\n]+)\]\]|!?\[[^\]\n]*\]\(([^)\n]+)\)/gu)){
  const target=(match[1]?.split("|",1)[0]??match[2]??"").trim();
  let asset:VaultAsset|undefined;
  try{asset=findAsset(target,notePath,assets);}catch{continue;}
  if(asset)paths.set(asset.path,asset);
 }
 return [...paths.values()];
}
export function replaceJournalAssetLinks(markdown:string,notePath:string,assets:readonly VaultAsset[],urls:ReadonlyMap<string,string>):string{
 return markdown.replace(/!\[\[([^\]\n]+)\]\]|(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/gu,(whole,wiki:string|undefined,bang:string|undefined,label:string|undefined,target:string|undefined)=>{
  const path=(wiki?.split("|",1)[0]??target??"").trim();
  let asset:VaultAsset|undefined;
  try{asset=findAsset(path,notePath,assets);}catch{return whole;}
  if(!asset)return whole;
  const url=urls.get(asset.path);
  if(!url)return whole;
  const display=(wiki?.split("|",2)[1]??label??asset.filename).replace(/[\[\]]/gu,"");
  return (asset.mime.startsWith("image/")?"!":"")+"["+display+"]("+url+")";
 });
}
