/**
 * Only authenticated GM audio-clip POST routes bypass Vinext request-body parsing.
 * The existing provider route retains authentication, CSRF, consent and size checks.
 */
export function matchDirectRecapTranscription(
  pathname:string,method:string,
):{campaignId:string;provider:"gemini"|"groq"}|null{
  if(method!=="POST")return null;
  const found=pathname.match(
    /^\/api\/campaigns\/(cmp_[A-Za-z0-9_-]{22})\/session-recaps\/transcript\/(gemini|transcribe)$/u);
  if(!found)return null;
  return {campaignId:found[1],provider:found[2]==="gemini"?"gemini":"groq"};
}
