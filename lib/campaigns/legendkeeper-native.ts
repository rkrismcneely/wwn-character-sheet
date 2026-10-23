/** Decode a native LegendKeeper backup, without guessing the evolving content schema. */
export async function readLegendKeeperBackup(buffer:ArrayBuffer,format:"lk"|"json"):Promise<unknown>{
 const maxBytes=20_000_000;
 if(!buffer.byteLength||buffer.byteLength>maxBytes)throw new Error("LegendKeeper backup exceeds 20 MB.");
 let bytes=new Uint8Array(buffer);
 if(format==="lk"){
  if(bytes[0]!==0x1f||bytes[1]!==0x8b)throw new Error("Expected a gzipped .lk backup.");
  if(typeof DecompressionStream==="undefined")throw new Error("GZIP decompression is unavailable.");
  const reader=new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks:Uint8Array[]=[];let size=0;
  try{
   while(true){
    const {value,done}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>maxBytes){await reader.cancel();throw new Error("Decompressed LegendKeeper backup exceeds 20 MB.");}
    chunks.push(value);
   }
  }finally{reader.releaseLock();}
  bytes=new Uint8Array(size);
  let position=0;
  for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
 }
 let decoded:unknown;
 try{decoded=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
 catch{throw new Error("LegendKeeper backup is not valid UTF-8 JSON.");}
 if(decoded===null||typeof decoded!=="object"||Array.isArray(decoded))
  throw new Error("LegendKeeper backup must contain a JSON object.");
 return decoded;
}

/**
 * Conservative inventory of a native backup. The format has no guaranteed
 * stable export schema, so this only counts explicitly typed records.
 * No native data is sent to the Journal import API.
 */
export function inspectLegendKeeperBackup(value:unknown):{
 recognized:boolean;resourceCount:number;pageCount:number;mapCount:number;
 boardCount:number;unknownCount:number;warnings:string[];
}{
 const empty={recognized:false,resourceCount:0,pageCount:0,mapCount:0,boardCount:0,unknownCount:0,warnings:[] as string[]};
 if(!value||typeof value!=="object"||Array.isArray(value))return empty;
 const root=value as Record<string,unknown>;
 if(!Array.isArray(root.resources))return {...empty,warnings:["No recognized resources array; native schema requires review."]};
 let pageCount=0,mapCount=0,boardCount=0,unknownCount=0;
 for(const resource of root.resources.slice(0,10000)){
  if(!resource||typeof resource!=="object"||Array.isArray(resource)){unknownCount++;continue;}
  const documents=(resource as {documents?:unknown}).documents;
  if(!Array.isArray(documents)){unknownCount++;continue;}
  for(const document of documents.slice(0,100)){
   if(!document||typeof document!=="object"||Array.isArray(document)){unknownCount++;continue;}
   const type=(document as {type?:unknown}).type;
   if(type==="page")pageCount++;
   else if(type==="map")mapCount++;
   else if(type==="board")boardCount++;
   else unknownCount++;
  }
 }
 return {recognized:true,resourceCount:root.resources.length,pageCount,mapCount,boardCount,
  unknownCount,warnings:[
   "Native LegendKeeper data is inspection-only until its export schema is verified.",
   ...(root.resources.length>10000?["Resource inventory truncated at 10,000."]:[]),
  ]};
}
