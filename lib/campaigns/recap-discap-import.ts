import {validateRecapCaptionCues,type CaptionCue} from "./recap-full-transcript.ts";

/** Discap publishes a speaker-labeled timestamped TXT attachment but does not
 * publish a formal export schema. Only accept explicitly recognized line shapes.
 * The guessed end time is for transcript navigation, NOT word-level sync.
 * Reject uncertain/unparsed content instead of silently losing RPG dialogue.
 */
function timeMs(input:string):number|null{
  const match=/^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)(?:[.,](\d{1,3}))?$/u.exec(input);
  if(!match)return null;
  const value=((Number(match[1]??0)*3600+Number(match[2])*60+Number(match[3]))*1000)+
    Number((match[4]??"").padEnd(3,"0"));
  return value<=8*60*60*1000?value:null;
}
type Entry={startMs:number;rawSpeaker:string;text:string};
function parseEntry(line:string):Entry|null{
  // [00:12:34] Player: dialogue; 00:12:34 - Player: dialogue
  const prefix=/^\s*(?:\[\s*([0-9:.,]+)\s*\]|\(\s*([0-9:.,]+)\s*\)|([0-9:.,]+))\s*(?:[-–—|]\s*)?([^:\n]{1,80}):\s*(\S.*)$/u.exec(line);
  // Player [00:12:34]: dialogue
  const infix=!prefix?/^\s*([^\[\]\n]{1,80})\s*\[\s*([0-9:.,]+)\s*\]\s*:\s*(\S.*)$/u.exec(line):null;
  const startMs=prefix?timeMs(prefix[1]??prefix[2]??prefix[3]):infix?timeMs(infix[2]):null;
  if(startMs===null)return null;
  const rawSpeaker=(prefix?prefix[4]:infix![1]).trim();
  const text=(prefix?prefix[5]:infix![3]).trim();
  if(!rawSpeaker||!text||/^[0-9:.,]+$/u.test(rawSpeaker))return null;
  return {startMs,rawSpeaker,text};
}
export type DiscapTranscriptDocument = {
  title:string|null;
  startedAt:string|null;
  durationMs:number|null;
  participants:string|null;
  cues:CaptionCue[];
};
export function parseDiscapTranscriptDocument(source:string,filename:string):DiscapTranscriptDocument{
  if(!/\.txt$/iu.test(filename))throw Error("Choose the Discap .txt transcript attachment.");
  if(source.length>2_000_000)throw Error("Transcript exceeds the 2 MB import limit.");
  const lines=source.replace(/^\uFEFF/u,"").replace(/\r\n?/gu,"\n").split("\n");
  const entries:Entry[]=[];
  let title:string|null=null;
  let startedAt:string|null=null;
  let durationMs:number|null=null;
  let participants:string|null=null;
  let sawSpeech=false;
  let nonSpeechHeader=0;
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(!line)continue;
    const entry=parseEntry(line);
    if(entry){
      if(entries.length>=10000)throw Error("Transcript contains more than 10,000 dialogue lines.");
      if(entries.length&&entry.startMs<entries[entries.length-1].startMs)
        throw Error("Discap transcript timestamps are out of order at line "+(i+1)+".");
      entries.push(entry);sawSpeech=true;
      continue;
    }
    // Continuation lines are accepted only after a recognized speech line and
    // never when the line resembles a timestamped entry that we failed to parse.
    const looksTimed=/^\s*(?:[\[(]?\d{1,2}:\d{2}|[^\n]{1,80}\[\s*\d{1,2}:\d{2})/u.test(line);
    if(looksTimed)throw Error("Unsupported timestamp or speaker layout on line "+(i+1)+
      ". No dialogue was imported. Please share a redacted example of the Discap output.");
    if(!sawSpeech){
      const started=/^Started:\s*(.+)$/iu.exec(line);
      const duration=/^Duration:\s*(\S+)$/iu.exec(line);
      const people=/^Participants:\s*(.+)$/iu.exec(line);
      if(started){
        const value=started[1].trim();
        if(!Number.isFinite(Date.parse(value))||!/^\d{4}-\d{2}-\d{2}T/u.test(value))
          throw Error("Invalid Discap recording start time at line "+(i+1)+".");
        startedAt=value;
      }else if(duration){
        durationMs=timeMs(duration[1]);
        if(durationMs===null)throw Error("Invalid Discap recording duration at line "+(i+1)+".");
      }else if(people){
        participants=people[1].trim();
      }else if(!title&&!/^(?:[-–—]{3,}|(?:recording|transcript)\s*:)/iu.test(line)){
        title=line.slice(0,200);
      }
      if(++nonSpeechHeader>12)throw Error("Could not locate speaker-labeled timestamped dialogue.");
      continue;
    }
    if(/^(?:recap|summary|action items|decisions|notes|transcript|duration|participants)\s*:/iu.test(line))
      throw Error("Unexpected non-dialogue section at line "+(i+1)+". No lines were silently discarded.");
    const previous=entries[entries.length-1];
    previous.text+=" "+line;
    if(previous.text.length>1500)throw Error("A dialogue entry is too long near line "+(i+1)+".");
  }
  if(!entries.length)throw Error("No speaker-labeled timed dialogue found in this Discap file.");
  if(durationMs!==null && entries.some(entry=>entry.startMs>=durationMs))
    throw Error("A transcript timestamp is at or after the recording duration.");
  const cues=validateRecapCaptionCues(entries.map((entry,index)=>{
    const next=entries[index+1]?.startMs;
    // Discap documents start timestamps but not per-utterance end positions.
    // When there is no end timestamp, bound navigation to the next start or 5 seconds.
    const endMs=Math.min(8*60*60*1000,
      durationMs??8*60*60*1000,
      next!==undefined&&next>entry.startMs?next:entry.startMs+5000);
    return {...entry,endMs};
  }));
  return {title,startedAt,durationMs,participants,cues};
}
export function parseDiscapTranscript(source:string,filename:string):CaptionCue[]{
  return parseDiscapTranscriptDocument(source,filename).cues;
}
