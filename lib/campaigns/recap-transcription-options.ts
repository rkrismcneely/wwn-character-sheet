/** Visible descriptions must reflect the implementation, not future plans. */
export type TranscriptionChoice = "groq"|"gemini"|"local-whisper";
export type TranscriptionChoiceInfo={
  id:TranscriptionChoice;name:string;subtitle:string;benefits:readonly string[];
  limitations:readonly string[];availability:"ready"|"experimental"|"building";
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
    id:"gemini",name:"Google Gemini",subtitle:"GM-owned transcription now; unattended queue in development",
    availability:"ready",requiresOpenBrowser:true,needsKey:true,ownerPays:false,
    benefits:["Ongoing free tier on eligible GM-owned projects, subject to limits",
      "File transcription through the GM's own Google AI Studio project",
      "Future scheduled mode will work with a powered-off computer"],
    limitations:["Foreground mode requires the browser open; encrypted unattended queue is not active",
      "Timed audio requests are limited to 30 minutes; multitrack sessions take more requests",
      "Free-tier content may be used by Google to improve products; provider quotas vary"],
  },
  {
    id:"local-whisper",name:"Local Whisper",subtitle:"Experimental on-device transcription with checkpoints",
    availability:"experimental",requiresOpenBrowser:true,needsKey:false,ownerPays:false,
    benefits:["No API key or transcription charges","Audio does not need to leave the device",
      "Finished chunks save privately and can be skipped when you return with the same WAV"],
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
  return ["ready","experimental"].includes(transcriptionChoice(value).availability);
}
