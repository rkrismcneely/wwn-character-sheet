"use client";

import type { CampaignMapAreaTemplateMotionEffect } from "@/lib/campaigns/map-area-template-model";

/**
 * One small, repeating SVG tile per spell area. Drawing the tile once and
 * referencing it with an SVG pattern keeps effects cheap even on huge AoEs.
 * CSS animates the symbols, never the map geometry or token layer.
 */
export function CampaignMapMagicPattern({
  id, effect, color,
}: {
  id: string;
  effect: Exclude<CampaignMapAreaTemplateMotionEffect, "none">;
  color: string;
}) {
  return <pattern id={id} patternUnits="userSpaceOnUse" width="84" height="84">
    <g className={`campaign-map-magic-motifs is-${effect}`}
      stroke={color} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeWidth="2">
      {effect === "fire" && <>
        <g className="campaign-map-motif-primary">
          <path d="M 17 74 C 6 60, 28 54, 17 35 C 36 46, 37 58, 25 73" strokeWidth="2.7" />
          <path d="M 56 65 C 45 51, 66 45, 58 29 C 76 44, 75 55, 64 66" strokeWidth="2.3" />
        </g>
        <g className="campaign-map-motif-secondary">
          <path d="M 21 70 Q 17 60 25 54" strokeWidth="1.8" />
          <circle cx="44" cy="31" r="2.4" fill={color} stroke="none" />
          <circle cx="75" cy="18" r="1.8" fill={color} stroke="none" />
        </g>
      </>}
      {effect === "acid" && <>
        <g className="campaign-map-motif-primary">
          <circle cx="20" cy="69" r="6.5" strokeWidth="2" />
          <circle cx="60" cy="50" r="10" strokeWidth="2.2" />
          <circle cx="33" cy="21" r="3.8" />
        </g>
        <g className="campaign-map-motif-secondary">
          <circle cx="50" cy="76" r="3.5" fill={color} fillOpacity=".3" strokeWidth="1.4" />
          <circle cx="17" cy="37" r="3" />
          <path d="M 52 52 Q 57 43 64 46" strokeWidth="1.5" />
          <path d="M 16 70 Q 19 66 23 68" strokeWidth="1.3" />
        </g>
      </>}
      {effect === "sound" && <>
        <g className="campaign-map-motif-primary">
          <path d="M 15 42 A 12 12 0 0 1 39 42 M 9 42 A 18 18 0 0 1 45 42 M 3 42 A 24 24 0 0 1 51 42" />
          <path d="M 62 7 Q 73 18 62 29 M 68 5 Q 83 18 68 31" strokeWidth="1.8" />
        </g>
        <g className="campaign-map-motif-secondary">
          <path d="M 11 70 Q 24 59 37 70 T 63 70" strokeWidth="2.1" />
          <circle cx="27" cy="43" r="2" fill={color} stroke="none" />
        </g>
      </>}
      {effect === "poison" && <>
        <g className="campaign-map-motif-primary">
          <path d="M 13 78 C -2 57, 42 63, 24 39 S 42 13, 50 26" strokeWidth="3" />
          <path d="M 62 82 C 42 58, 85 54, 65 30 S 55 12, 75 7" strokeWidth="2.3" />
        </g>
        <g className="campaign-map-motif-secondary">
          <path d="M 30 72 Q 41 62 34 52 T 37 27" strokeWidth="1.4" />
          <circle cx="44" cy="40" r="3.2" fill={color} fillOpacity=".35" stroke="none" />
          <circle cx="12" cy="26" r="2" fill={color} stroke="none" />
        </g>
      </>}
      {effect === "ice" && <>
        <g className="campaign-map-motif-primary">
          <path d="M 27 13 V 45 M 11 29 H 43 M 16 18 L 38 40 M 38 18 L 16 40" strokeWidth="1.9" />
          <path d="M 27 13 L 23 19 M 27 13 L 31 19 M 27 45 L 23 39 M 27 45 L 31 39" strokeWidth="1.4" />
          <path d="M 11 29 L 17 25 M 11 29 L 17 33 M 43 29 L 37 25 M 43 29 L 37 33" strokeWidth="1.4" />
        </g>
        <g className="campaign-map-motif-secondary">
          <path d="M 61 54 L 75 68 L 61 82 L 47 68 Z M 61 54 V 82 M 47 68 H 75" strokeWidth="1.4" />
          <circle cx="67" cy="20" r="2" fill={color} stroke="none" />
        </g>
      </>}
      {effect === "lightning" && <>
        <g className="campaign-map-motif-primary">
          <path d="M 29 4 L 16 28 L 32 25 L 19 54 L 46 21 L 30 24 L 42 4" strokeWidth="2.7" />
          <path d="M 69 49 L 58 65 L 70 63 L 62 82" strokeWidth="2.2" />
        </g>
        <g className="campaign-map-motif-secondary">
          <path d="M 39 42 L 47 48 L 44 60 M 14 62 L 9 68 L 16 73" strokeWidth="1.5" />
          <circle cx="56" cy="17" r="2.6" fill={color} stroke="none" />
        </g>
      </>}
      {effect === "darkness" && <>
        <g className="campaign-map-motif-primary">
          <path d="M 15 70 C 5 53, 46 63, 43 43 S 14 28, 27 17 S 55 13, 51 29" strokeWidth="3.4" />
          <path d="M 57 84 C 44 68, 81 61, 70 45 S 53 33, 67 20" strokeWidth="2.8" />
        </g>
        <g className="campaign-map-motif-secondary">
          <path d="M 23 60 Q 41 58 35 43 M 52 12 Q 66 10 70 29" strokeWidth="1.8" />
          <ellipse cx="63" cy="61" rx="7" ry="3.5" fill={color} fillOpacity=".28" stroke="none" />
        </g>
      </>}
    </g>
  </pattern>;
}
