/** Convert Obsidian wiki links to local journal page IDs without exposing private pages. */
export type LinkedPage={id:string;title:string;sourcePath?:string|null;parentId:string|null};
function norm(value:string){return value.toLocaleLowerCase().replace(/\\/gu,"/").replace(/\.md$/iu,"");}
export function resolveJournalWikilinks(markdown:string,current:LinkedPage,pages:readonly LinkedPage[]):string{
 const byId=new Map(pages.map(page=>[page.id,page]));
 const folder=(page:LinkedPage):string=>{
  const parts:string[]=[];let parent=page.parentId;const seen=new Set<string>();
  while(parent&&!seen.has(parent)){seen.add(parent);const node=byId.get(parent);if(!node)break;parts.unshift(node.title);parent=node.parentId;}
  return parts.join("/");
 };
 return markdown.replace(/!?\[\[([^\]\n]+)\]\]/gu,(whole,inside:string)=>{
  if(whole.startsWith("!"))return whole;
  const [reference,label]=inside.split("|",2);
  const [target,heading]=reference.split("#",2);
  if(!target)return whole;
  const candidate=norm(target);
  const sameFolder=folder(current);
  const matches=pages.filter(page=>page.id!==current.id&&(
   norm(page.sourcePath||"")===candidate||
   norm(page.sourcePath||"")===(sameFolder?sameFolder+"/"+candidate:candidate)||
   norm(page.title)===candidate
  ));
  const exact=matches.filter(page=>norm(page.sourcePath||"")===candidate);
  const chosen=exact.length===1?exact[0]:exact.length>1?null:matches.length===1?matches[0]:null;
  if(!chosen)return whole;
  const text=label||chosen.title;
  const fragment=heading?"#"+encodeURIComponent(heading):"";
  return "["+text.replaceAll("[","").replaceAll("]","")+"]("+"/journal-page/"+encodeURIComponent(chosen.id)+fragment+")";
 });
}
