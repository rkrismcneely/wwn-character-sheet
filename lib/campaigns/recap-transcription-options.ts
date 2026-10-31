/** Visible descriptions must reflect the implementation, not future plans. */
export type TranscriptionChoice = "groq"|"gemini"|"local-whisper";
export type TranscriptionChoiceInfo={
  id:TranscriptionChoice;name:string;subtitle:string;benefits:readonly string[];
  limitations:readonly string[];availability:"ready"|"building";
  requiresOpenBrowser:boolean;needsKey:boolean;ownerPays:boolean;
};
export const transcriptionChoices:readonly TranscriptionChoiceInfo[]=[
  {
    id:"groq",name:"Groq Whisper",subtitle:"Use your own Groq account",
    availability:"ready",requiresOpenBrowser:true,needsKey:true,ownerPays:false,
    benefits:["Already integrated","Whisper timestamps and existing Craig speaker mappings",
      "Long standard PCM WAVs split automatically; finished clips are saved"],
    limitations:["Requires a personal Groq key and may use paid quota",
      "Keep the tab open while processing","Large compressed Craig tracks still need conversion"],
  },
  {
    id:"gemini",name:"Google Gemini",subtitle:"Unattended processing (in development)",
    availability:"building",requiresOpenBrowser:false,needsKey:true,ownerPays:false,
    benefits:["Ongoing free tier on eligible GM-owned projects, subject to limits",
      "Designed to run on TWE's schedule while your computer is off",
      "Preserves results and resumes after pauses when deployed"],
    limitations:["Unattended queue and encrypted GM credentials must be activated first",
      "Timed audio requests are limited to 30 minutes; multitrack sessions take more requests",
      "Free-tier content may be used by Google to improve products; provider quotas vary"],
  },
  {
    id:"local-whisper",name:"Local Whisper",subtitle:"Transcription on this device (in development)",
    availability:"building",requiresOpenBrowser:true,needsKey:false,ownerPays:false,
    benefits:["No API key or transcription charges","Audio does not need to leave the device",
      "Planned: save completed chunks and resume when you reopen the page"],
    limitations:["Computer and browser must remain open and awake while computing",
      "Requires a compatible browser and sufficient device performance",
      "Automatic resume needs a persistent authorized audio source or re-selection"],
  },
] as const;
export function transcriptionChoice(value:unknown):TranscriptionChoiceInfo {
  const found=transcriptionChoices.find(option=>option.id===value);
  if(!found)throw new Error("Choose a supported transcription provider.");
  return found;
}
export function canStartTranscription(value:unknown):boolean {
  return transcriptionChoice(value).availability==="ready";
}
