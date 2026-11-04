/** Alignment for locally detected speaker turns. This module never guesses player identity.
 * sherpa-onnx produces turn times and speaker cluster numbers; ASR supplies words.
 * Keep the full ASR text if speaker evidence is missing or ambiguous.
 */
export type SherpaTurn={start:number;end:number;speaker:number};
export type DiarizedCaption={startMs:number;endMs:number;text:string;rawSpeaker:string};
export type SpeakerAlignment={cues:DiarizedCaption[];speakerLabels:string[];uncertain:number};
export function alignSherpaTurns(
  captions:readonly DiarizedCaption[], turns:readonly SherpaTurn[],
  offsetMs=0,
):SpeakerAlignment{
  if(!Number.isSafeInteger(offsetMs)||offsetMs<0)throw Error("Invalid recording offset.");
  const valid=turns.map(turn=>{
    if(!Number.isFinite(turn.start)||!Number.isFinite(turn.end)||
      turn.start<0||turn.end<=turn.start||!Number.isSafeInteger(turn.speaker)||
      turn.speaker<0||turn.speaker>=32)throw Error("Invalid local diarization turn.");
    return {startMs:offsetMs+Math.round(turn.start*1000),
      endMs:offsetMs+Math.round(turn.end*1000),speaker:turn.speaker};
  });
  const labels=new Set<string>();
  let uncertain=0;
  const cues=captions.map(cue=>{
    if(!Number.isSafeInteger(cue.startMs)||!Number.isSafeInteger(cue.endMs)||
      cue.startMs<0||cue.endMs<=cue.startMs||!cue.text.trim())
      throw Error("Invalid timestamped transcript cue.");
    const seconds=new Map<number,number>();
    for(const turn of valid){
      const overlap=Math.max(0,Math.min(cue.endMs,turn.endMs)-Math.max(cue.startMs,turn.startMs));
      if(overlap>0)seconds.set(turn.speaker,(seconds.get(turn.speaker)??0)+overlap);
    }
    const ranked=[...seconds].sort((a,b)=>b[1]-a[1]);
    const duration=cue.endMs-cue.startMs;
    // Prefer no assignment over a wrong one, especially across speaker changes.
    const confident=ranked.length>0&&ranked[0][1]>=duration*0.55&&
      (ranked.length===1||ranked[0][1]>=ranked[1][1]*1.5);
    const rawSpeaker=confident?"Speaker "+(ranked[0][0]+1):"Unidentified speaker";
    if(confident)labels.add(rawSpeaker);else uncertain++;
    return {...cue,rawSpeaker};
  });
  return {cues,speakerLabels:[...labels].sort((a,b)=>
    Number(a.split(" ")[1])-Number(b.split(" ")[1])),uncertain};
}
