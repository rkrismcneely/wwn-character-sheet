export const recapSeekEvent="twe:session-recap-audio-seek";
export const recapReferenceMarker=/^<!-- twe-session-recap:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}) -->$/miu;
export function parseAudioTimestamp(value:string):number|null{
  const parts=value.split(":").map(Number);
  if(parts.length!==3||parts.some(x=>!Number.isSafeInteger(x))||
    parts[0]>23||parts[0]<0||parts[1]>59||parts[1]<0||parts[2]>59||parts[2]<0)return null;
  return parts[0]*3600+parts[1]*60+parts[2];
}
