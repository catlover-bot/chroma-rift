/** Shared one-axis handle rule. Coordinates are local to the device panel.
 * The starting pointer offset is retained, so grabbing an edge never jumps. */
export type PanelPoint = Readonly<{ x: number; y: number }>;
export type LinearDrag = Readonly<{ pointerId: number; startValue: number; startPoint: PanelPoint }>;
export type LinearSpec = Readonly<{ min: number; max: number; handleRadius: number; axis: 'x' | 'y'; scale: number; direction: 1 | -1 }>;

export function validLinearSpec(spec: LinearSpec): boolean {
  return [spec.min, spec.max, spec.handleRadius, spec.scale].every(Number.isFinite) &&
    spec.min < spec.max && spec.handleRadius > 0 && spec.scale > 0 && (spec.axis === 'x' || spec.axis === 'y') &&
    (spec.direction === 1 || spec.direction === -1);
}

export function beginLinearDrag(pointerId: number, point: PanelPoint, handle: PanelPoint, value: number, spec: LinearSpec): LinearDrag | undefined {
  if (!validLinearSpec(spec) || !Number.isSafeInteger(pointerId) || ![point.x, point.y, handle.x, handle.y, value].every(Number.isFinite) ||
    value < spec.min || value > spec.max || Math.hypot(point.x - handle.x, point.y - handle.y) > spec.handleRadius) return;
  return { pointerId, startValue: value, startPoint: { ...point } };
}

export function previewLinearDrag(drag: LinearDrag, pointerId: number, point: PanelPoint, spec: LinearSpec): number | undefined {
  if (!validLinearSpec(spec) || pointerId !== drag.pointerId || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  const displacement = spec.axis === 'x' ? point.x - drag.startPoint.x : point.y - drag.startPoint.y;
  return Math.max(spec.min, Math.min(spec.max, drag.startValue + spec.direction * displacement / spec.scale));
}
