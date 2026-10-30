/** Client-side import of Craig supporter VTT/SRT or compatible captions. */
export function captionsToRecapTranscript(source:string,filename:string):{block:string;count:number} {
  if(source.length>500_000)throw new Error("Caption file is too large (maximum 500 KB).");
  if(!/\.(?:vtt|srt)$/iu.test(filename))throw new Error("Choose a .vtt or .srt caption file.");
  const normalized=source.replace(/^\uFEFF/u,"").replace(/\r\n?/gu,"\n");
  const cues=normalized.split(/\n\s*\n/u);
  const output:string[]=[];
  for(const cue of cues){
    const lines=cue.trim().split("\n");
    const timing=lines.findIndex(line=>/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/u.test(line));
    if(timing<0)continue;
    const match=/(\d{2}):(\d{2}):(\d{2})[.,]\d{3}\s*-->/u.exec(lines[timing]);
    if(!match||Number(match[2])>59||Number(match[3])>59)continue;
    const caption=lines.slice(timing+1).join(" ").replace(/\s+/gu," ").trim();
    if(!caption)continue;
    const speakerMatch=/^(?:<v\s+([^>]+)>|([^:]{1,80}):)\s*(.*)$/iu.exec(caption);
    const speaker=(speakerMatch?.[1]??speakerMatch?.[2]??"Unassigned").trim().replace(/[\[\]\r\n:]/gu,"");
    const dialogue=(speakerMatch?.[3]??caption).replace(/<[^>]*>/gu,"").replace(/[\r\n]/gu," ").trim();
    if(!dialogue)continue;
    output.push("["+match[1]+":"+match[2]+":"+match[3]+"] "+speaker+": "+dialogue);
    if(output.length>=1000)break;
  }
  if(!output.length)throw new Error("No supported timestamped caption cues found.");
  return {block:"\`\`\`transcript\n"+output.join("\n")+"\n\`\`\`",count:output.length};
}
