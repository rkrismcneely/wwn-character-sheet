export type TooltipRect = {
  top: number;
  bottom: number;
  right: number;
};

export type TooltipSize = {
  width: number;
  height: number;
};

export function viewportTooltipPosition({
  trigger,
  tooltip,
  viewportWidth,
  viewportHeight,
  viewportPadding = 12,
  gap = 8,
}: {
  trigger: TooltipRect;
  tooltip: TooltipSize;
  viewportWidth: number;
  viewportHeight: number;
  viewportPadding?: number;
  gap?: number;
}) {
  const safeWidth = Math.max(0, Number(viewportWidth) || 0);
  const safeHeight = Math.max(0, Number(viewportHeight) || 0);
  const safeTooltipWidth = Math.max(0, Number(tooltip.width) || 0);
  const safeTooltipHeight = Math.max(0, Number(tooltip.height) || 0);
  const spaceBelow = Math.max(
    0,
    safeHeight - trigger.bottom - gap - viewportPadding,
  );
  const spaceAbove = Math.max(0, trigger.top - gap - viewportPadding);
  const placement =
    safeTooltipHeight <= spaceBelow || spaceBelow >= spaceAbove
      ? "below"
      : "above";
  const maxHeight = placement === "below" ? spaceBelow : spaceAbove;
  const renderedHeight = Math.min(safeTooltipHeight, maxHeight);
  const maxLeft = Math.max(
    viewportPadding,
    safeWidth - viewportPadding - safeTooltipWidth,
  );
  const left = Math.min(
    Math.max(viewportPadding, trigger.right - safeTooltipWidth),
    maxLeft,
  );
  const top =
    placement === "below"
      ? trigger.bottom + gap
      : Math.max(viewportPadding, trigger.top - gap - renderedHeight);

  return { left, top, maxHeight, placement };
}
