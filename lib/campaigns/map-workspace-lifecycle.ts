export type InPageMapPresentation = "fullscreen" | "drawer";
export type MapWorkspacePresentation = InPageMapPresentation | "pip" | "standalone" | "closed";

export type MapWorkspaceState = {
  presentation: MapWorkspacePresentation;
  inPagePresentation: InPageMapPresentation;
};

export type MapWorkspaceEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "choose-in-page-presentation"; presentation: InPageMapPresentation }
  | { type: "move-to-picture-in-picture" }
  | { type: "picture-in-picture-closed"; returnToPage: boolean };

export function createMapWorkspaceState(options: {
  initialOpen: boolean;
  initialPresentation?: "standalone";
  preferredPresentation: InPageMapPresentation;
}): MapWorkspaceState {
  return {
    presentation: options.initialOpen && options.initialPresentation === "standalone"
      ? "standalone"
      : options.initialOpen
        ? options.preferredPresentation
        : "closed",
    inPagePresentation: options.preferredPresentation,
  };
}

/**
 * A map has exactly one visible host. Moving it to Picture-in-Picture can
 * either close it or return it to the in-page presentation explicitly
 * selected by the player.
 */
export function mapWorkspaceReducer(state: MapWorkspaceState, event: MapWorkspaceEvent): MapWorkspaceState {
  switch (event.type) {
    case "open":
      return { ...state, presentation: state.inPagePresentation };
    case "close":
      return { ...state, presentation: "closed" };
    case "choose-in-page-presentation":
      return { presentation: event.presentation, inPagePresentation: event.presentation };
    case "move-to-picture-in-picture":
      return { ...state, presentation: "pip" };
    case "picture-in-picture-closed":
      return {
        ...state,
        presentation: event.returnToPage ? state.inPagePresentation : "closed",
      };
    default:
      return state;
  }
}
