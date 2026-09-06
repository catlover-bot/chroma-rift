export type ControlRect = { left: number; top: number; width: number; height: number };
export type ControlLayout = {
  width: number;
  height: number;
  movement: ControlRect;
  look: ControlRect;
  pause: ControlRect;
  goal: ControlRect;
  action: ControlRect;
  color: ControlRect;
};

/** All rectangles use the already safe-area-inset scene's logical points.
 * Header and action rail are separate from native drag activation views. */
export function controlLayout(width: number, height: number, fontScale = 1, handedness: 'left' | 'right' = 'right'): ControlLayout {
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const margin = 12;
  const halfWidth = Math.max(44, width / 2 - margin - 6);
  const pauseWidth = 48;
  const pauseHeight = 48;
  const headerBottom = Math.min(height * 0.32, Math.max(82, 50 * scale + 28));
  const actionHeight = Math.max(64, 40 * scale + 24);
  const colorHeight = Math.max(48, 40 * scale + 12);
  const railTop = height - margin - actionHeight;
  const dragBottom = railTop - 12;
  const left = margin;
  const right = width / 2 + 6;
  const movementLeft = handedness === 'right' ? left : right;
  const lookLeft = handedness === 'right' ? right : left;
  const movementTop = Math.min(dragBottom - 116, Math.max(headerBottom, height * 0.43));
  return {
    width, height,
    movement: { left: movementLeft, top: movementTop, width: halfWidth, height: Math.max(44, dragBottom - movementTop) },
    look: { left: lookLeft, top: headerBottom, width: halfWidth, height: Math.max(44, dragBottom - headerBottom) },
    pause: { left: margin, top: margin, width: pauseWidth, height: pauseHeight },
    goal: { left: margin + pauseWidth + 8, top: margin, width: width - margin * 2 - pauseWidth - 8, height: headerBottom - margin - 8 },
    action: { left: lookLeft, top: railTop, width: halfWidth, height: actionHeight },
    color: { left: movementLeft, top: height - margin - colorHeight, width: halfWidth, height: colorHeight },
  };
}
