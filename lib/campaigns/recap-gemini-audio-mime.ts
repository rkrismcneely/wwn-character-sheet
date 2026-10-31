/** Gemini Audio and Interactions APIs prefer the documented audio MIME names.
 * Keep the Drive recording's MIME unchanged for ownership/size verification;
 * normalize only the temporary Gemini file and the interaction input.
 */
export function geminiAudioMime(driveMime:string):string{
  switch(driveMime.toLowerCase().split(";")[0].trim()){
    case "audio/mp4":case "audio/x-m4a":case "audio/m4a":return "audio/m4a";
    case "audio/mp3":case "audio/mpeg":return "audio/mpeg";
    case "audio/x-wav":case "audio/wave":case "audio/wav":return "audio/wav";
    case "audio/flac":case "audio/aac":return driveMime.toLowerCase().split(";")[0].trim();
    default:throw new Error("Unsupported Gemini audio format.");
  }
}
