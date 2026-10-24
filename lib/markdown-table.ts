/** Split Markdown table cells while retaining escaped pipes as cell text. */
export function markdownTableCells(raw:string):string[]{
 const text=raw.trim().replace(/^\|/u,"").replace(/(?<!\\)\|$/u,"");
 const cells:string[]=[];let cell="";
 for(let i=0;i<text.length;i++){
  if(text[i]==="\\"&&text[i+1]==="|"){cell+="|";i++;}
  else if(text[i]==="|"){cells.push(cell.trim());cell="";}
  else cell+=text[i];
 }
 cells.push(cell.trim());return cells;
}
