"use client";
import {useEffect} from "react";
export function EmbeddedCharacterSizing(){
 useEffect(()=>{
  document.body.classList.add("twe-embedded-character-body");
  const send=()=>{
   const root=document.querySelector<HTMLElement>(".twe-embedded-character");
   if(!root||window.parent===window)return;
   const height=Math.ceil(root.getBoundingClientRect().height+12);
   window.parent.postMessage({type:"twe:embedded-character-height",height},window.location.origin);
  };
  const observer=new ResizeObserver(send);
  const root=document.querySelector(".twe-embedded-character");
  if(root)observer.observe(root);
  window.addEventListener("load",send);
  window.addEventListener("resize",send);
  const frame=window.requestAnimationFrame(send);
  return()=>{observer.disconnect();window.cancelAnimationFrame(frame);window.removeEventListener("load",send);window.removeEventListener("resize",send);document.body.classList.remove("twe-embedded-character-body");};
 },[]);
 return null;
}
