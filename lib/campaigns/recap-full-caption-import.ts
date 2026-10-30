import { validateRecapCaptionCues, type CaptionCue } from "./recap-full-transcript.ts";

/** Parses Craig supporter SRT/WebVTT locally; never uploads original subtitle files. */
export function parseFullCraigCaptions(source: string, filename: string): CaptionCue[] {
  if (!/\.(?:vtt|srt)$/iu.test(filename)) throw new Error("Select a .vtt or .srt caption file.");
  if (source.length > 2_000_000) throw new Error("Caption file exceeds the 2 MB import limit.");
  const blocks=source.replace(/^\uFEFF/u,"").replace(/\r\n?/gu,"\n").split(/\n\s*\n/u);
  const result: CaptionCue[]=[];
  function timestamp(value:string):number|null {
    const m=/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})$/u.exec(value.trim());
    if(!m||Number(m[2])>59||Number(m[3])>59)return null;
    return ((Number(m[1]??0)*3600 + Number(m[2])*60+Number(m[3]))*1000+Number(m[4]));
  }
  for(const block of blocks) {
    const lines=block.trim().split("\n");
    const i=lines.findIndex(line=>line.includes("-->"));
    if(i<0)continue;
    const timing=/^\s*(\S+)\s*-->\s*(\S+)/u.exec(lines[i]);
    if(!timing)throw new Error("Unsupported caption time range.");
    const startMs=timestamp(timing[1]),endMs=timestamp(timing[2]);
    if(startMs===null||endMs===null||endMs<=startMs)throw new Error("Invalid caption time range.");
    const content=lines.slice(i+1).join(" ").trim();
    if(!content)continue;
    const voice=/<v\s+([^>]{1,80})>/iu.exec(content);
    const plain=content.replace(/<[^>]*>/gu,"").replace(/\s+/gu," ").trim();
    const labeled=!voice ? /^([^:]{1,80}):\s*(.*)$/u.exec(plain) : null;
    const rawSpeaker=(voice?.[1]??labeled?.[1]??"Unassigned").trim();
    const text=(labeled?.[2]??plain).trim();
    if(!text)continue;
    result.push({startMs,endMs,rawSpeaker,text});
    if(result.length>10000)throw new Error("Caption file contains more than 10,000 cues.");
  }
  return validateRecapCaptionCues(result);
}
