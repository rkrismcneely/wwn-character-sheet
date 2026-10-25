/** Decode text entities as text; React still escapes the result when rendering. */
export function markdownTextEntities(value:string):string{
 const named:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:"\u00a0"};
 return value.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos|nbsp);/giu,(whole:string,entity:string)=>{
  if(entity.startsWith("#")){
   const point=entity[1].toLowerCase()==="x"?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
   return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):whole;
  }
  return named[entity.toLowerCase()]??whole;
 });
}
