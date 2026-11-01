import type { LinkedPage } from "./journal-links.ts";

/** Match article titles in prose without rewriting saved markdown. */
export function autoLinkJournalTitles(markdown:string,current:LinkedPage,pages:readonly LinkedPage[]):string{
 const titles=new Map<string,LinkedPage|null>();
 for(const page of pages){
  if(page.kind==="folder"||page.id===current.id||!page.title.trim())continue;
  const key=page.title.trim().toLocaleLowerCase();
  if(titles.has(key))titles.set(key,null); // Ambiguous names are never guessed.
  else titles.set(key,page);
 }
 const candidates=[...titles].filter((item):item is [string,LinkedPage]=>item[1]!==null)
  .filter(([title])=>title.length>=3)
  .sort((a,b)=>b[0].length-a[0].length);
 if(!candidates.length)return markdown;
 const used=new Set<string>();
 let fenced=false;
 return markdown.split("\n").map(line=>{
  if(/^\s*(?:`{3}|~{3})/u.test(line)){fenced=!fenced;return line;}
  // Headings are readable text, including Gemini's timestamped scene headings.
  // Link their named subjects too so that "Referenced By" finds recaps where
  // an NPC or location appears only in a heading. Reference definitions stay
  // protected, as do fenced code blocks and existing links.
  if(fenced||/^\s*!?\[[^\]]+\]:/u.test(line))return line;
  // Do not interpret existing links, images, inline code, or HTML as prose.
  const protectedPattern=/(<!--[\s\S]*?-->|!?\[[^\]\n]*\]\([^)]+\)|!?\[\[[^\]\n]+\]\]|`[^`\n]*`|<[^>]*>|https?:\/\/\S+)/gu;
  const parts=line.split(protectedPattern);
  return parts.map((part,index)=>{
   if(index%2)return part;
   let output="";
   let cursor=0;
   while(cursor<part.length){
    let found:{at:number;title:string;page:LinkedPage}|null=null;
    const lower=part.toLocaleLowerCase();
    for(const [title,page] of candidates){
     if(used.has(page.id))continue;
     let at=lower.indexOf(title,cursor);
     while(at>=0){
      const before=at===0?"":part[at-1];
      const after=at+title.length>=part.length?"":part[at+title.length];
      if((!before||!(/[\p{L}\p{N}_]/u).test(before))&&(!after||!(/[\p{L}\p{N}_]/u).test(after)))break;
      at=lower.indexOf(title,at+1);
     }
     if(at>=0&&(!found||at<found.at||(at===found.at&&title.length>found.title.length)))found={at,title,page};
    }
    if(!found){output+=part.slice(cursor);break;}
    output+=part.slice(cursor,found.at);
    const label=part.slice(found.at,found.at+found.title.length);
    output+="["+label+"](/journal-page/"+encodeURIComponent(found.page.id)+")";
    used.add(found.page.id);
    cursor=found.at+found.title.length;
   }
   return output;
  }).join("");
 }).join("\n");
}

export function journalBacklinks(current:LinkedPage,pages:readonly (LinkedPage&{content:string})[]):LinkedPage[]{
 return pages.filter(page=>page.id!==current.id&&page.kind!=="folder").filter(page=>{
  const converted=autoLinkJournalTitles(page.content,page,[current]);
  return converted!==page.content||page.content.includes("/journal-page/"+current.id);
 });
}
