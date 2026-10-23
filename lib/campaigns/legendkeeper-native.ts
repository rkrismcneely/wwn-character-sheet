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

/** Never import an unknown native schema as if it were a Markdown page tree. */
export function inspectLegendKeeperBackup(value:unknown):{recognized:boolean;resourceCount:number}{
 if(!value||typeof value!=="object"||Array.isArray(value))return {recognized:false,resourceCount:0};
 const root=value as Record<string,unknown>;
 const resources=root.resources;
 return {recognized:Array.isArray(resources),resourceCount:Array.isArray(resources)?resources.length:0};
}
