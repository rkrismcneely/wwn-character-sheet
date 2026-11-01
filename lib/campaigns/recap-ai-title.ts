/** A generated recap may start with an H1 that proposes its session title.
 * Keep titles separate from Markdown so the Session Recap and Journal can
 * display the title once, with the existing date prefix.
 *
 * Earlier AI recap versions without an H1 remain fully compatible.
 */
export const RECORDING_WORKING_TITLE="Session recording";

export function isPlaceholderRecapTitle(value:string):boolean{
  return ["session recording","untitled","untitled session","new session"]
    .includes(value.trim().toLowerCase());
}

export function parseGeneratedRecapTitle(markdown:string):{
  title:string|null;content:string;
}{
  const match=/^\s*#(?!#)[ \t]+([^\r\n]+)\r?\n+(?=\S)/u.exec(markdown);
  if(!match)return {title:null,content:markdown};
  const title=match[1].trim().replace(/[ \t]+/gu," ");
  // Same validation as the user-editable session title. Do not let an AI
  // inject a date or markdown into the title, or strip a chapter heading.
  if(!title||title.length>120||/[\u0000-\u001f\u007f]/u.test(title)||
    /^(?:\d{2,4}[-/]\d\d[-/]\d\d\s*[—:-]\s*)/u.test(title)||
    /^\d{1,2}:\d{2}(?::\d{2})?\b/u.test(title))
    return {title:null,content:markdown};
  const content=markdown.slice(match[0].length).trimStart();
  if(!content)return {title:null,content:markdown};
  return {title,content};
}
