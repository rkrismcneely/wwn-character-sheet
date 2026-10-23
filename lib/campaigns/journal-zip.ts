/** Read-only ZIP extractor for Obsidian Markdown archives. No dependencies. */
import { safeVaultPath, type VaultEntry } from "./journal-import.ts";

function u16(v:DataView,p:number){return v.getUint16(p,true);}
function u32(v:DataView,p:number){return v.getUint32(p,true);}
export async function extractMarkdownZip(buffer:ArrayBuffer):Promise<VaultEntry[]>{
 if(buffer.byteLength>20_000_000)throw new Error("ZIP exceeds 20 MB.");
 const view=new DataView(buffer);
 const bytes=new Uint8Array(buffer);
 const decoder=new TextDecoder("utf-8",{fatal:true});
 let eocd=-1;
 for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--){
  if(u32(view,i)===0x06054b50){eocd=i;break;}
 }
 if(eocd<0)throw new Error("Invalid ZIP archive.");
 if(u16(view,eocd+4)!==0||u16(view,eocd+6)!==0)throw new Error("Multi-disk ZIP unsupported.");
 const count=u16(view,eocd+10),size=u32(view,eocd+12),start=u32(view,eocd+16);
 if(count>1000||start+size>eocd)throw new Error("ZIP directory exceeds limits.");
 let cursor=start,total=0;
 const notes:VaultEntry[]=[];
 const seen=new Set<string>();
 for(let i=0;i<count;i++){
  if(cursor+46>start+size||u32(view,cursor)!==0x02014b50)throw new Error("Invalid ZIP directory.");
  const flags=u16(view,cursor+8),method=u16(view,cursor+10);
  const compressed=u32(view,cursor+20),uncompressed=u32(view,cursor+24);
  const nameLength=u16(view,cursor+28),extra=u16(view,cursor+30),comment=u16(view,cursor+32);
  const offset=u32(view,cursor+42);
  if(cursor+46+nameLength+extra+comment>start+size)throw new Error("Invalid ZIP filename.");
  const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength));
  cursor+=46+nameLength+extra+comment;
  if(name.endsWith("/"))continue;
  const path=safeVaultPath(name);
  if((flags&0x800)===0&&/[^\\x00-\\x7f]/u.test(name))throw new Error("ZIP filenames must use UTF-8.");
  if(seen.has(path.toLowerCase()))throw new Error("Duplicate ZIP path.");
  seen.add(path.toLowerCase());
  if(!path.toLowerCase().endsWith(".md")||path.split("/").includes(".obsidian"))continue;
  if(flags&1)throw new Error("Encrypted ZIP entries unsupported.");
  if(method!==0&&method!==8)throw new Error("Unsupported ZIP compression.");
  if(uncompressed>100000||compressed>1000000)throw new Error("Note exceeds size limit.");
  total+=uncompressed;
  if(total>900000)throw new Error("ZIP notes exceed the import limit.");
  if(offset+30>buffer.byteLength||u32(view,offset)!==0x04034b50)throw new Error("Invalid ZIP entry.");
  if(u16(view,offset+8)!==method)throw new Error("ZIP entry compression mismatch.");
  const localNameLength=u16(view,offset+26);
  if(offset+30+localNameLength>buffer.byteLength||decoder.decode(bytes.subarray(offset+30,offset+30+localNameLength))!==name)
   throw new Error("ZIP entry path mismatch.");
  const dataStart=offset+30+localNameLength+u16(view,offset+28);
  if(dataStart+compressed>buffer.byteLength)throw new Error("Truncated ZIP entry.");
  const raw=bytes.subarray(dataStart,dataStart+compressed);
  let content:Uint8Array;
  if(method===0)content=raw;
  else{
   if(typeof DecompressionStream==="undefined")throw new Error("ZIP decompression unavailable.");
   const stream=new Blob([new Uint8Array(raw)]).stream().pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat));
   const reader=stream.getReader();
   const chunks:Uint8Array[]=[];let length=0;
   try{
    while(true){
     const {value,done}=await reader.read();if(done)break;
     length+=value.byteLength;
     if(length>uncompressed||length>100000){await reader.cancel();throw new Error("ZIP decompression exceeds declared size.");}
     chunks.push(value);
    }
   }finally{reader.releaseLock();}
   content=new Uint8Array(length);let position=0;
   for(const chunk of chunks){content.set(chunk,position);position+=chunk.length;}
  }
  if(content.byteLength!==uncompressed)throw new Error("ZIP entry size mismatch.");
  notes.push({path,content:decoder.decode(content)});
 }
 return notes;
}
