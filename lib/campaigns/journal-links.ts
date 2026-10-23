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
  if(matches.length!==1)return whole;
  const text=label||matches[0].title;
  const fragment=heading?"#"+encodeURIComponent(heading):"";
  return "["+text.replace(/[\\[\\]]/gu,"")+"]("+"/journal-page/"+encodeURIComponent(matches[0].id)+fragment+")";
 });
}
