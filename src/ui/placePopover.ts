export interface Rect { left: number; top: number; width: number; height: number }

/**
 * Where to put a small popup so it sits right next to the thing that was tapped: just below it with the left edges
 * aligned, pulled back inside the screen, flipped above when there is no room below.
 */
export function placePopover(
  anchor: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 6,
  margin = 8,
): { left: number; top: number } {
  const left = Math.max(margin, Math.min(anchor.left, viewport.width - size.width - margin));
  let top = anchor.top + anchor.height + gap;
  if (top + size.height > viewport.height - margin) {
    const above = anchor.top - size.height - gap;
    top = above >= margin ? above : Math.max(margin, viewport.height - size.height - margin);
  }
  return { left, top };
}
