/** Optional GM-edited transcript fenced inside recap Markdown. No AI service is called. */
export interface RecapTranscriptLine { seconds:number; timestamp:string; speaker:string; text:string }
export function parseRecapTranscript(content:string):RecapTranscriptLine[] {
  const output:RecapTranscriptLine[]=[];
  let inside=false;
  for(const sourceLine of content.split(/\r?\n/u)){
    const line=sourceLine.trim();
    if(/^`{3,}\s*transcript\s*$/iu.test(line)){inside=true;continue;}
    if(/^`{3,}/u.test(line)){inside=false;continue;}
    if(!inside)continue;
    const match=/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+([^:\n]{1,80}):\s+(.{1,2000})$/u.exec(line);
    if(!match)continue;
    const parts=match[1].split(":").map(Number);
    if(parts.length===3 && (parts[1]>59||parts[2]>59))continue;
    if(parts.length===2 && parts[1]>59)continue;
    const seconds=parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts[0]*60+parts[1];
    output.push({seconds,timestamp:match[1],speaker:match[2].trim(),text:match[3].trim()});
    if(output.length>=5000)break;
  }
  return output;
}
