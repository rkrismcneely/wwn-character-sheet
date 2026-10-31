"use client";

import { useState } from "react";
import { transcriptionChoices,type TranscriptionChoice } from "@/lib/campaigns/recap-transcription-options";
import { SessionRecapGroqTranscriber } from "./session-recap-groq-transcriber";
import { SessionRecapLocalWhisper } from "./session-recap-local-whisper";

export function SessionRecapTranscriptionOptions({campaignId,recapId,onSaved}:{
  campaignId:string;recapId:string;onSaved:()=>void;
}) {
  const [selected,setSelected]=useState<TranscriptionChoice>("groq");
  return <section aria-label="Choose a session transcription method" className="session-recap-reading">
    <h3>Choose how to transcribe</h3>
    <p className="campaign-empty-copy">
      All providers save dialogue to a private GM draft for review. Compare cost, privacy, speed,
      and whether you can leave the browser before choosing. No provider automatically charges
      the TWE site owner.
    </p>
    <div className="session-recap-speaker-list">
      {transcriptionChoices.map(option=><div className="session-recap-speaker-entry" key={option.id}>
        <div>
          <strong>{option.name}</strong>
          <p className="campaign-empty-copy">{option.subtitle}</p>
          <p><strong>Advantages:</strong> {option.benefits.join(" · ")}</p>
          <p><strong>Trade-offs:</strong> {option.limitations.join(" · ")}</p>
          <p className="campaign-empty-copy">
            {option.requiresOpenBrowser?"Browser must stay open while computing":
              "Designed for unattended server work; not yet activated"}
            {" · "}{option.needsKey?"GM-owned provider key":"No API key"}
          </p>
        </div>
        <button type="button"
          className={selected===option.id?"campaign-primary":"campaign-secondary"}
          onClick={()=>setSelected(option.id)}
          aria-pressed={selected===option.id}>
          {selected===option.id?"Selected":"Choose"}
        </button>
      </div>)}
    </div>
    {selected==="groq"&&<SessionRecapGroqTranscriber
      key="groq" provider="groq" campaignId={campaignId} recapId={recapId} onSaved={onSaved}/>}
    {selected==="gemini"&&<>
      <p className="session-recap-import-notice">
        Gemini can transcribe clips now using your own API key, but this foreground version
        requires keeping the page open. The unattended, multi-day Gemini queue is not deployed.
      </p>
      <SessionRecapGroqTranscriber
        key="gemini" provider="gemini" campaignId={campaignId} recapId={recapId} onSaved={onSaved}/>
    </>}
    {selected==="local-whisper"&&<SessionRecapLocalWhisper
      key="local" campaignId={campaignId} recapId={recapId} onSaved={onSaved}/>}
  </section>;
}
