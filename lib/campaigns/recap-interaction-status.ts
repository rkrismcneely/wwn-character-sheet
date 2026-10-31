/** Decide a background interaction's lifecycle without resubmitting an
 * interaction that may already have consumed the GM's quota. */
export type RecapInteractionState=
  | {kind:"waiting"}
  | {kind:"complete"}
  | {kind:"attention";code:string;keepPartial:boolean};
export function classifyRecapInteraction(status:unknown):RecapInteractionState {
  switch(status){
    case "in_progress":return {kind:"waiting"};
    case "completed":return {kind:"complete"};
    case "failed":return {kind:"attention",code:"interaction_failed",keepPartial:false};
    case "cancelled":return {kind:"attention",code:"interaction_cancelled",keepPartial:false};
    case "incomplete":return {kind:"attention",code:"interaction_incomplete",keepPartial:true};
    case "requires_action":return {kind:"attention",code:"interaction_requires_action",keepPartial:false};
    case "requires_continuation":return {kind:"attention",code:"interaction_requires_continuation",keepPartial:true};
    default:return {kind:"attention",code:"interaction_unknown_status",keepPartial:false};
  }
}
