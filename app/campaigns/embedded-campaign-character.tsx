"use client";
import {useEffect,useRef,useState} from "react";
export function EmbeddedCampaignCharacter({campaignId,characterId}:{campaignId:string;characterId:string}){
 const frame=useRef<HTMLIFrameElement>(null);
 const [height,setHeight]=useState(1250);
 useEffect(()=>{
  setHeight(1250);
  const onMessage=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow)return;
   const data=event.data as {type?:string;height?:number}|null;
   if(data?.type!=="twe:embedded-character-height")return;
   const value=data.height;
   if(typeof value==="number"&&Number.isFinite(value)&&value>=300&&value<=15000)setHeight(value);
  };
  window.addEventListener("message",onMessage);
  return()=>window.removeEventListener("message",onMessage);
 },[campaignId,characterId]);
 return <iframe ref={frame} title="My campaign character sheet" className="campaign-my-character-frame" scrolling="no" style={{height}} src={`/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(characterId)}?embedded=1`}/>;
}
