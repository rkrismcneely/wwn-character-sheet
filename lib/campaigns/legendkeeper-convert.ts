/** Conservative LegendKeeper JSON v1 -> Campaign Journal Markdown conversion. */
type RecordValue=Record<string,unknown>;
const record=(v:unknown):RecordValue=>v&&typeof v==="object"&&!Array.isArray(v)?v as RecordValue:{};
const array=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const string=(v:unknown):string=>typeof v==="string"?v:"";
const filename=(v:string)=>v.replace(/[\\/\x00-\x1f<>:"|?*]/gu,"-").replace(/\.\./gu,".").trim().slice(0,110)||"Untitled";
const escape=(v:string)=>v.replace(/([\\`*_\[\]])/gu,"\\$1");
export function convertLegendKeeperNative(value:unknown){
 const root=record(value);
 if(root.version!==1||!Array.isArray(root.resources)||root.resources.length>1000)throw new Error("Unsupported LegendKeeper JSON schema or resource count.");
 const resources=root.resources.map(record),byId=new Map(resources.map(r=>[string(r.id),r]));
 const paths=new Map<string,string>(),used=new Set<string>(),warnings:string[]=[];
 const pathFor=(id:string,parents=new Set<string>()):string=>{
  const cached=paths.get(id);if(cached)return cached;
  const r=byId.get(id);if(!r)return "";
  if(parents.has(id))throw new Error("Circular LegendKeeper folder hierarchy.");
  parents.add(id);
  const pid=string(r.parentId),prefix=byId.has(pid)?pathFor(pid,parents)+"/":"";
  const name=filename(string(r.name));let path=prefix+name,i=2;
  while(used.has(path.toLowerCase()))path=prefix+name+" ("+(i++)+")";
  paths.set(id,path);used.add(path.toLowerCase());parents.delete(id);return path;
 };
 resources.forEach(r=>pathFor(string(r.id)));
 const mention=(id:string,label:string)=>{
  const target=paths.get(id);
  return target?"[["+target+"|"+escape(label||string(byId.get(id)?.name))+"]]":escape(label);
 };
 const inline=(node:unknown):string=>{
  const n=record(node),t=string(n.type),a=record(n.attrs);
  if(t==="hardBreak")return "  \n";
  if(t==="mention")return mention(string(a.id),string(a.alias)||string(a.text));
  let content=t==="text"?escape(string(n.text)):array(n.content).map(inline).join("");
  for(const m of array(n.marks)){
   const mark=record(m),kind=string(mark.type);
   if(kind==="strong")content="**"+content+"**";
   else if(kind==="em")content="*"+content+"*";
   else if(kind==="strike")content="~~"+content+"~~";
   else if(kind==="code")content="`"+content+"`";
   else if(kind==="link"){const href=string(record(mark.attrs).href);if(/^https?:\/\//iu.test(href))content="["+content+"]("+href.replace(/[()]/gu,encodeURIComponent)+")";}
  }
  return content;
 };
 const blocks=(nodes:unknown,depth=0):string=>{
  if(depth>25)throw new Error("LegendKeeper page nesting exceeds safe limits.");
  return array(nodes).map(node=>{
   const n=record(node),t=string(n.type),attrs=record(n.attrs),children=array(n.content);
   if(t==="paragraph")return children.map(inline).join("")+"\n\n";
   if(t==="heading")return "#".repeat(Math.max(1,Math.min(6,Number(attrs.level)||2)))+" "+children.map(inline).join("")+"\n\n";
   if(t==="rule")return "---\n\n";
   if(t==="layoutSection"||t==="layoutColumn"||t==="listItem"||t==="taskItem"||t==="tableCell"||t==="tableHeader")return blocks(children,depth+1);
   if(t==="bulletList"||t==="orderedList"||t==="taskList")return children.map((c,i)=>{
    const text=blocks(record(c).content,depth+1).trim().replace(/\n/gu,"\n  ");
    return (t==="orderedList"?(i+1)+". ":t==="taskList"?"- [ ] ":"- ")+text+"\n";
   }).join("")+"\n";
   if(t==="blockquote"||t==="panel")return blocks(children,depth+1).trim().split("\n").map(l=>"> "+l).join("\n")+"\n\n";
   if(t==="table"){
    const rows=children.filter(c=>record(c).type==="tableRow").map(row=>array(record(row).content).map(cell=>blocks(record(cell).content,depth+1).trim().replace(/\s*\n\s*/gu," ").replace(/\|/gu,"\\|")));
    if(!rows.length)return "";
    const width=Math.max(...rows.map(r=>r.length)),format=(r:string[])=>"| "+Array.from({length:width},(_,i)=>r[i]||"").join(" | ")+" |\n";
    return format(rows[0])+format(Array(width).fill("---"))+rows.slice(1).map(format).join("")+"\n";
   }
   if(t==="mediaSingle"||t==="media"){
    const media=t==="media"?n:record(children[0]),url=string(record(media.attrs).url);
    return /^https:\/\//iu.test(url)?"![]("+url+")\n\n":"";
   }
   if(t==="bodiedExtension"){
    if(attrs.extensionKey==="block-secret")return "<!-- gm-only:start -->\n"+blocks(children,depth+1).trim()+"\n<!-- gm-only:end -->\n\n";
    warnings.push("Unsupported extension "+string(attrs.extensionKey)+" rendered as plain Markdown");
    return blocks(children,depth+1);
   }
   if(t==="text"||t==="mention")return inline(n);
   if(children.length)return blocks(children,depth+1);
   if(t&&t!=="blank")warnings.push("Unsupported block "+t);
   return "";
  }).join("");
 };
 const notes:{path:string;content:string}[]=[];let pages=0,maps=0,unhandled=0;
 for(const r of resources){
  const base=paths.get(string(r.id))!,docs=array(r.documents).map(record),pageDocs=docs.filter(d=>d.type==="page");
  const other=docs.filter(d=>d.type!=="page"&&d.type!=="blank");
  maps+=other.filter(d=>d.type==="map").length;unhandled+=other.filter(d=>d.type!=="map").length;
  if(other.length)warnings.push(base+": map/board content requires separate VTT import.");
  if(!pageDocs.length){notes.push({path:base+".md",content:"_LegendKeeper resource (no wiki page content)._"});continue;}
  for(const [index,d] of pageDocs.entries()){
   pages++;
   const suffix=pageDocs.length===1?"":" - "+filename(string(d.name)||String(index+1));
   let content=blocks(record(d.content).content).trim();
   if(r.isHidden===true||d.isHidden===true||r.isLocked===true)content="<!-- Restricted LegendKeeper resource; review before sharing. -->\n\n"+content;
   if(content.length>100000){warnings.push(base+": page skipped (over 100,000 characters)");unhandled++;continue;}
   notes.push({path:base+suffix+".md",content});
  }
 }
 if(notes.length>1000)throw new Error("More than 1000 converted notes.");
 return {notes,warnings:[...new Set(warnings)].slice(0,100),statistics:{resources:resources.length,pages,maps,unhandled}};
}
